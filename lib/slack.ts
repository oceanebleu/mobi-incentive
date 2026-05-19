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

async function slackCall<T = any>(method: string, body: any): Promise<T> {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({} as any));
  if (!json.ok) {
    const code = json?.error ?? `http_${res.status}`;
    throw new Error(`Slack ${method} 실패: ${code}`);
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
    // mrkdwn 활성화 — 기본값이지만 명시
    mrkdwn: true,
    // Slack 메시지 푸시 알림 미리보기 텍스트 — 너무 길면 잘리니 헤더만
    unfurl_links: false,
    unfurl_media: false,
  });
}
