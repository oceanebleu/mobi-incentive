// ─────────────────────────────────────────────────────────────
// lib/slack.ts
// 수주인센티브운영봇 (Slack) 호출 헬퍼
//   - 이메일 → Slack user_id 룩업 (users.lookupByEmail)
//   - DM 채널 오픈 후 chat.postMessage 로 메시지 전송
//
// 사용:
//   await sendSlackDmByEmail('foo@mobidays.com', '*hello*');
// ─────────────────────────────────────────────────────────────

const SLACK_API = 'https://slack.com/api';

function getToken(): string {
  const t = process.env.SLACK_BOT_TOKEN;
  if (!t) throw new Error('SLACK_BOT_TOKEN 환경변수가 설정되어 있지 않습니다.');
  return t;
}

// Slack 메서드 호출 — form-encoded body 사용.
//   · users.lookupByEmail 같은 레거시 메서드는 JSON 을 지원하지 않으므로
//     form-encoded 로 통일 (chat.postMessage / conversations.open 도 동일하게 호환).
//   · 값은 모두 문자열로 직렬화 (boolean 은 'true'/'false').
async function slackCall<T = any>(method: string, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams(params);
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    },
    body: body.toString(),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({} as any));
  if (!json.ok) {
    const code = json?.error ?? `http_${res.status}`;
    // missing_scope 케이스 — Slack 이 needed / provided 를 함께 돌려주므로 같이 노출
    const extra: string[] = [];
    if (json?.needed) extra.push(`needed=${json.needed}`);
    if (json?.provided) extra.push(`provided=${json.provided}`);
    const suffix = extra.length ? ` (${extra.join(' · ')})` : '';
    throw new Error(`Slack ${method} 실패: ${code}${suffix}`);
  }
  return json as T;
}

/** 이메일로 Slack user_id 조회 — 봇 권한: users:read.email */
export async function lookupSlackUserIdByEmail(email: string): Promise<string> {
  const r = await slackCall<{ user: { id: string } }>(
    'users.lookupByEmail',
    { email }
  );
  return r.user.id;
}

/** DM 채널 오픈 — 봇 권한: im:write */
async function openImChannel(userId: string): Promise<string> {
  const r = await slackCall<{ channel: { id: string } }>('conversations.open', {
    users: userId,
  });
  return r.channel.id;
}

/**
 * 이메일 기반으로 사용자 1명에게 DM 발송.
 *  - text 는 Slack mrkdwn (*bold*, <url|label> 등 지원)
 *  - 매핑 실패 / 권한 부족 / Slack API 에러는 모두 throw
 */
export async function sendSlackDmByEmail(email: string, text: string): Promise<void> {
  const userId = await lookupSlackUserIdByEmail(email);
  const channelId = await openImChannel(userId);
  await slackCall('chat.postMessage', {
    channel: channelId,
    text,
    // mrkdwn 활성화 — 기본값이지만 명시 (form-encoded 이므로 문자열로)
    mrkdwn: 'true',
    unfurl_links: 'false',
    unfurl_media: 'false',
  });
}

/**
 * 특정 채널(public/private)에 메시지 발송.
 *  - channel: 채널 ID (C12345ABC) 또는 채널 이름 (#hrm-notify)
 *  - 봇이 해당 채널에 초대되어 있어야 함 (not_in_channel 에러 시 invite 필요)
 *  - 봇 권한: chat:write (private 채널이면 추가로 채널 멤버 자격 필요)
 */
export async function sendSlackChannelMessage(channel: string, text: string): Promise<void> {
  await slackCall('chat.postMessage', {
    channel,
    text,
    mrkdwn: 'true',
    unfurl_links: 'false',
    unfurl_media: 'false',
  });
}

// ─── 스레드 관련 ──────────────────────────────────────────────
//
// 운영위원회 스레드: 수주인센티브 채널에 프로젝트당 루트 메시지 1개를 만들고,
// 이후 알럿(작성요청/작성완료/위원회완료)은 그 스레드의 답글로 달린다.

/**
 * 채널에 메시지를 올리고 ts(스레드 식별자)를 돌려준다.
 *  - sendSlackChannelMessage 와 달리 반환값이 있음 (스레드 루트 생성용)
 *  - 봇이 해당 채널 멤버여야 함 (not_in_channel 이면 채널에 /invite 필요)
 */
export async function postSlackChannelMessage(
  channel: string,
  text: string
): Promise<{ ts: string; channel: string }> {
  const r = await slackCall<{ ts: string; channel: string }>('chat.postMessage', {
    channel,
    text,
    mrkdwn: 'true',
    unfurl_links: 'false',
    unfurl_media: 'false',
  });
  return { ts: r.ts, channel: r.channel };
}

/** 기존 스레드에 답글 — thread_ts 는 루트 메시지의 ts */
export async function postSlackThreadReply(
  channel: string,
  threadTs: string,
  text: string
): Promise<void> {
  await slackCall('chat.postMessage', {
    channel,
    thread_ts: threadTs,
    text,
    mrkdwn: 'true',
    unfurl_links: 'false',
    unfurl_media: 'false',
  });
}

/**
 * 메시지 permalink 조회. 실패해도 스레드 생성 자체는 유효하므로 null 반환.
 *  - 봇 권한: 별도 scope 불필요 (채널 접근 권한만 있으면 됨)
 */
export async function getSlackPermalink(
  channel: string,
  messageTs: string
): Promise<string | null> {
  try {
    const r = await slackCall<{ permalink: string }>('chat.getPermalink', {
      channel,
      message_ts: messageTs,
    });
    return r.permalink ?? null;
  } catch {
    return null;
  }
}

/**
 * 봇이 올린 메시지 삭제 — chat.delete
 *  - 봇 토큰으로는 '봇 자신이 올린 메시지'만 삭제 가능 (추가 scope 불필요, chat:write 로 충분)
 *  - 스레드 루트를 지우면 그 스레드의 답글도 함께 사라진다
 *  - 이미 지워진 메시지면 message_not_found 가 돌아오는데, 결과적으로 '없는 상태'는
 *    같으므로 호출부에서 성공으로 처리해도 된다
 */
export async function deleteSlackMessage(channel: string, ts: string): Promise<void> {
  await slackCall('chat.delete', { channel, ts });
}

/**
 * Slack 메시지 permalink → { channel, ts }
 *   https://<workspace>.slack.com/archives/C0CM7MD8MC0/p1763451234567890
 *     → channel = C0CM7MD8MC0
 *       ts      = 1763451234.567890   (p 뒤 숫자에서 뒤 6자리가 마이크로초)
 *   쿼리스트링(?thread_ts=...&cid=...)이 붙어 있어도 무시한다.
 *   형식이 아니면 null.
 */
export function parseSlackLink(raw: string): { channel: string; ts: string } | null {
  const link = (raw ?? '').trim();
  if (!link) return null;
  const m = link.match(/\/archives\/([A-Z0-9]+)\/p(\d{10,})/i);
  if (!m) return null;
  const digits = m[2];
  if (digits.length < 7) return null;
  return { channel: m[1], ts: `${digits.slice(0, digits.length - 6)}.${digits.slice(-6)}` };
}
