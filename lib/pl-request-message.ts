// ─────────────────────────────────────────────────────────────
// lib/pl-request-message.ts
// PL 작성요청 Slack DM 메시지 포맷터
//   - Slack mrkdwn (단일 *bold*, <url|label>) 사용
//   - 사용자 템플릿의 [ ] 표기:
//       · 값 자리표시자 ([PL이름] / [캠페인이름] / [사번] / [고유코드])
//         → 값으로 치환 + *bold*
//       · 섹션 라벨 / 강조 ([작성방법] / [FAQ] / [Q. …] / [※ …])
//         → 대괄호 유지 + *bold*
// ─────────────────────────────────────────────────────────────

export interface PLRequestPayload {
  plName: string;
  campaignName: string;
  employeeId: string;
  accessCode: string;
  /** PL 양식 랜딩 URL */
  formUrl?: string;
  /**
   * 문의 담당자(이홍은) Slack 멘션 마크업.
   *   · 룩업 성공 시: `<@U12345>` — Slack 이 자동으로 멘션으로 렌더
   *   · 룩업 실패/미설정 시: undefined — 괄호 안 멘션을 자연스럽게 생략
   */
  supportMention?: string;
  /**
   * 작성 마감일 한국어 텍스트 (예: "11월 25일 오후 02시까지").
   * 메시지에서 Bold 처리해 삽입.
   */
  deadlineText?: string;
}

const DEFAULT_FORM_URL = 'https://mobi-incentive.vercel.app/pl';

export function buildPLRequestMessage(p: PLRequestPayload): string {
  const url = p.formUrl ?? DEFAULT_FORM_URL;
  const lines = [
    `안녕하세요, *${p.plName}* 님.`,
    `모비데이즈 수주인센티브 운영위원회 입니다.`,
    ``,
    `*${p.campaignName}* 의 수주인센티브 운영위원회 진행을 위하여`,
    p.deadlineText
      ? `하기 링크를 통하여 *${p.deadlineText}* 프로젝트 정보값 기재를 요청드립니다.`
      : `하기 링크를 통하여 프로젝트 정보값 기재를 요청드립니다.`,
    ``,
    `🔗 <${url}|*캠페인 정보값 작성 바로가기*>`,
    `- *${p.plName}* 님의 사번과 개인 고유 코드 입력 후 접속이 가능합니다.`,
    `- *${p.plName}* 님의 사번은 *${p.employeeId}* 이며, 개인고유코드는 *${p.accessCode}* 입니다.`,
    `*_※개인고유코드는 보안에 유의해주시기 바랍니다._*`,
    ``,
    ``,
    `💌 *[작성방법]*`,
    `- 로그인 → 작성 대기 내 프로젝트 확인 → 프로젝트 클릭`,
    `- 참여 멤버 및 기여도, 캠페인 운영 일정, 총 예산 및 수수료, 인센티브 지급 판단사유 작성 → '저장' 버튼 클릭`,
    `*※ 프로젝트 별 참여자 기여도에 따라 인센티브 배분 비율이 결정됩니다*`,
    ``,
    ``,
    `💡 *[FAQ]*`,
    `*[Q. 제출 직전까지 기여도가 계속 달라질텐데, 어떻게 작성하나요? ]*`,
    `- 배분 비율은 추후 조정 가능하니, 현재 기준 참여 인원 작성 부탁드립니다.`,
    ``,
    `*[Q. 중간에 참여 인원이 바뀌었는데, 어떻게 하나요?]*`,
    `- 시트 내 정보값 업데이트 해주시면 됩니다.`,
    ``,
    `*[Q. 작성한 내용은 어디서 볼 수 있나요?]*`,
    `- 작성이 완료된 건에 한하여 작성 완료 상태로 변경되며, 전달드린 링크 접속 후 로그인하시면 언제든 확인 하실 수 있습니다.`,
    `- 위원회 진행 결과 역시 동일 페이지 내에서 확인 가능합니다.`,
    ``,
    ``,
    p.supportMention
      ? `문의사항이 있을 경우 ${p.supportMention} 에게 DM 부탁드립니다.`
      : `문의사항이 있을 경우 HRBP팀 이홍은에게 DM 부탁드립니다.`,
    `감사합니다.`,
  ];
  return lines.join('\n');
}
