// ─────────────────────────────────────────────────────────────
// lib/hrm-payroll-message.ts
// 월별 인센티브 실지급액 → HRM 공유 Slack 메시지 포맷터
//
// 포맷 규약 (Slack mrkdwn):
//   · *text*               — bold
//   · <@U12345>            — 사용자 멘션
//   · <url|label>          — 하이퍼링크
// ─────────────────────────────────────────────────────────────

export interface HRMShareInput {
  year: number;
  month: number;
  /** YYYY-MM-DD — payDateForMonth() 결과 */
  payDate: string;
  /** 월별 탭의 지급총액 (원) */
  totalAmount: number;
  /** 1차 수신자 Slack 멘션 (`<@U...>`). 룩업 실패 시 plain text 로 fallback */
  primaryMention: string;
  /** 참조(cc) 수신자 멘션 목록 — 매핑된 것만 포함 */
  ccMentions: string[];
  /** 페이지 랜딩 URL */
  pageUrl?: string;
}

const DEFAULT_PAGE_URL = 'https://mobi-incentive.vercel.app/payroll';

function formatKRWComma(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** YYYY-MM-DD → mm/dd (요일) — UTC 기반으로 timezone-safe */
function formatPayDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayKr = ['일', '월', '화', '수', '목', '금', '토'][date.getUTCDay()];
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${mm}/${dd} (${dayKr})`;
}

export function buildHRMShareMessage(p: HRMShareInput): string {
  const url = p.pageUrl ?? DEFAULT_PAGE_URL;
  const ccBlock = p.ccMentions.length > 0
    ? ` (cc. ${p.ccMentions.join(', ')})`
    : '';
  const lines = [
    `*💸${p.year}년 ${p.month}월 수주인센티브 지급요청의 건 ${p.primaryMention}${ccBlock}*`,
    ``,
    `안녕하세요,`,
    `${p.year}년 ${p.month}월 수주인센티브 지급 필요 내용 공유 드립니다.`,
    ``,
    ``,
    `*🔗<${url}|월별 인센티브 실지급액 (${p.year}년 ${p.month}월 탭)>*`,
    `- *지급일* : ${formatPayDate(p.payDate)}`,
    `- *지급총액* : ${formatKRWComma(p.totalAmount)} 원`,
    ``,
    ``,
    `감사합니다.`,
  ];
  return lines.join('\n');
}
