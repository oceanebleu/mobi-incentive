// ─────────────────────────────────────────────────────────────
// lib/committee-thread-message.ts
// 수주인센티브 채널(운영위원회 스레드) 메시지 빌더 4종
//
//   1) buildCommitteeThreadRoot     프로젝트 생성 시 스레드 루트
//   2) buildCommitteeRequestReply   PL 작성요청 발송 시 답글
//   3) buildCommitteeCompletedReply PL 작성 완료 시 답글
//   4) buildCommitteeFinishedReply  운영위원회 진행 완료 시 답글
//
// 모두 Slack mrkdwn — *bold*, <url|label>, <@U123>(멘션) 지원.
// 멘션 ID 를 못 구한 경우(룩업 실패)에는 이름 텍스트로 폴백한다.
// ─────────────────────────────────────────────────────────────

const DEFAULT_APP_URL = 'https://mobi-incentive.vercel.app';

/** 프로젝트 상세 URL — https://mobi-incentive.vercel.app/projects/PROPJ00063 */
export function projectUrl(projectId: string, baseUrl?: string): string {
  const base = (baseUrl ?? process.env.APP_BASE_URL ?? DEFAULT_APP_URL).replace(/\/+$/, '');
  return `${base}/projects/${encodeURIComponent(projectId)}`;
}

/** <@U123> 또는 (룩업 실패 시) 이름 그대로 */
export function mentionOrName(slackUserId: string | null | undefined, name: string): string {
  return slackUserId ? `<@${slackUserId}>` : name;
}

/**
 * 운영위원회 담당자 그룹 멘션.
 *   · SLACK_COMMITTEE_GROUP_ID (usergroup id, S로 시작) 가 있으면 그룹 멘션
 *   · 없으면 평문 — 그룹 생성 전까지 폴백
 */
export function committeeGroupMention(): string {
  const gid = (process.env.SLACK_COMMITTEE_GROUP_ID ?? '').trim();
  return gid ? `<!subteam^${gid}>` : '@incentive-committee';
}

export interface ThreadRootInput {
  projectId: string;
  campaignName: string;
  /** PL 멘션 문자열 (<@U123>) 또는 이름 */
  plMention: string;
  /** 신규 / 연장 */
  category: string | null;
  /** 퍼포먼스마케팅, AEO/GEO 등 */
  product: string | null;
  baseUrl?: string;
}

/** ① 스레드 루트 — 프로젝트 생성 시 채널에 1건 */
export function buildCommitteeThreadRoot(i: ThreadRootInput): string {
  const url = projectUrl(i.projectId, i.baseUrl);
  // '구분' 은 신규/연장 과 제품을 ' / ' 로 이어 붙인다. 한쪽이 비면 있는 것만.
  const division = [i.category, i.product].map(v => (v ?? '').trim()).filter(Boolean).join(' / ');
  return [
    `:moneybag: *${i.campaignName} 수주인센티브 운영위원회*`,
    '',
    `*프로젝트번호* : <${url}|${i.projectId}>`,
    `*광고주명* : ${i.campaignName}`,
    `*PL* : ${i.plMention}`,
    `*구분* : ${division || '-'}`,
  ].join('\n');
}

/** ② PL 작성요청 발송 시 — 스레드 답글 */
export function buildCommitteeRequestReply(plMention: string): string {
  return [
    `${plMention} 님, 수주인센티브 운영위원회 진행을 위하여 프로젝트 정보값 기재 부탁드립니다.`,
    '수주인센티브운영위원회 봇이 DM으로 요청드렸으니 확인 부탁드립니다 :love_letter:',
  ].join('\n');
}

export interface CompletedReplyInput {
  projectId: string;
  campaignName: string;
  baseUrl?: string;
}

/** ③ PL 작성 완료 시 — 스레드 답글 (운영위 담당자 그룹 멘션) */
export function buildCommitteeCompletedReply(i: CompletedReplyInput): string {
  const url = projectUrl(i.projectId, i.baseUrl);
  return [
    committeeGroupMention(),
    `*${i.campaignName}* 프로젝트 정보값 기입이 완료되었습니다.`,
    '',
    `:link: *<${url}|${i.projectId} ${i.campaignName} 바로가기>*`,
    '',
    '회사계정(구글)으로 로그인 후 확인이 가능하며, 권한이 없을 경우 관리자(HRBP 이홍은)에게 문의주시기 바랍니다.',
    '감사합니다.',
  ].join('\n');
}

/** ④ 운영위원회 진행 완료 시 — 스레드 답글 (PL 멘션) */
export function buildCommitteeFinishedReply(plMention: string, campaignName: string): string {
  return [
    `${plMention} 님, *${campaignName}* 수주인센티브 운영위원회 진행이 완료되었습니다.`,
    '수주인센티브운영위원회 봇이 DM으로 안내드렸으니 확인 부탁드립니다.',
  ].join('\n');
}
