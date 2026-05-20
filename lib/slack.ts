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
