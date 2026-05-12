// ─────────────────────────────────────────────────────────────
// lib/utils.ts — 공통 포매터 (금액/날짜/%/Boolean)
//
// 도메인 로직(calcMemberSummaries 등)은 [lib/incentive-data.ts] 로 이동됨.
// 이 파일은 단순 표시 포매터만 유지.
// ─────────────────────────────────────────────────────────────

// 천 단위 콤마 (Intl/ICU 미탑재 환경에서도 동작하도록 정규식으로 직접 삽입)
export function withCommas(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(n));
  return sign + String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 금액 축약 포맷 (억/만 단위)
export function formatKRW(amount: number): string {
  if (amount >= 100_000_000) {
    const eok = amount / 100_000_000;
    if (eok % 1 === 0) return `${withCommas(eok)}억`;
    const intPart = withCommas(Math.trunc(eok));
    const decPart = eok.toFixed(1).split('.')[1];
    return `${intPart}.${decPart}억`;
  }
  if (amount >= 10_000) {
    const man = Math.round(amount / 10_000);
    return `${withCommas(man)}만`;
  }
  return `${withCommas(amount)}원`;
}

// 금액 전체 포맷 (원 단위 콤마)
export function formatKRWFull(amount: number): string {
  return `${withCommas(amount)}원`;
}

// 날짜 포맷 (YYYY-MM-DD → YYYY.MM.DD)
export function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  return dateStr.replace(/-/g, '.');
}

// 수수료 퍼센트 포맷
export function formatCommission(commission: number): string {
  return `${(commission * 100).toFixed(1)}%`;
}
