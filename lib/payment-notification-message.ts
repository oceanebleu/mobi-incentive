// ─────────────────────────────────────────────────────────────
// lib/payment-notification-message.ts
// 재원확정완료 → PL 지급알림 Slack DM 포맷터
//   - 프로젝트 관리 → 캠페인 → 관리 → '지급알림' 버튼 클릭 시 발송되는 메시지
//   - Slack mrkdwn (*bold*, _italic_, <url|label> 등)
// ─────────────────────────────────────────────────────────────

export interface PaymentNotifyPayload {
  plName: string;
  campaignName: string;
  employeeId: string;
  accessCode: string;
  /** PL 양식 랜딩 URL (위원회 결과 페이지) */
  formUrl?: string;
  /**
   * 문의 담당자(이홍은) Slack 멘션 마크업.
   *   · 룩업 성공 시: `<@U12345>` — Slack 이 자동으로 멘션으로 렌더
   *   · 룩업 실패 시: undefined — 멘션 자리에 fallback 텍스트
   */
  supportMention?: string;
}

const DEFAULT_FORM_URL = 'https://mobi-incentive.vercel.app/pl';

export function buildPaymentNotifyMessage(p: PaymentNotifyPayload): string {
  const url = p.formUrl ?? DEFAULT_FORM_URL;
  const lines = [
    `안녕하세요, *${p.plName}* 님.`,
    `모비데이즈 수주인센티브 운영 위원회 입니다.`,
    ``,
    `*${p.campaignName}* 에 대한 수주인센티브운영위원회 진행이 완료되었습니다.`,
    `결과는 하기 링크를 통하여 확인 가능합니다.`,
    ``,
    `🔗 <${url}|*수주위원회 진행결과 바로가기*>`,
    `- *${p.plName}* 님의 사번과 개인 고유코드 입력 후 접속이 가능합니다.`,
    `- *${p.plName}* 님의 사번은 *${p.employeeId}* 이며, 개인고유코드는 *${p.accessCode}* 입니다.`,
    `*_※개인고유코드는 보안에 유의해주시기 바랍니다._*`,
    ``,
    ``,
    p.supportMention
      ? `문의사항이 있을 경우 ${p.supportMention} 에게 DM 부탁드립니다.`
      : `문의사항이 있을 경우 HRBP팀 이홍은에게 DM 부탁드립니다.`,
    `감사합니다.`,
  ];
  return lines.join('\n');
}
