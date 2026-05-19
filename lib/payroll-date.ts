// ─────────────────────────────────────────────────────────────
// lib/payroll-date.ts
// 급여 지급일 계산
//   · 회사 정책: 당월 급여(N월)를 익월(N+1월) 10일에 지급
//   · 10일이 토/일 또는 한국 공휴일이면 그 전 평일로 당김
//
// 한국 공휴일은 외부 API 없이 코드 내 화이트리스트로 처리.
// 필요 시 yearly 보충.
// ─────────────────────────────────────────────────────────────

// 한국 공휴일 (양력 기준, 대체공휴일 포함 — 매년 업데이트 필요)
const KR_HOLIDAYS: Set<string> = new Set([
  // 2025
  '2025-01-01', // 신정
  '2025-01-28', '2025-01-29', '2025-01-30', // 설날 연휴
  '2025-03-01', // 삼일절
  '2025-05-05', // 어린이날 / 부처님오신날
  '2025-05-06', // 대체공휴일
  '2025-06-06', // 현충일
  '2025-08-15', // 광복절
  '2025-10-03', // 개천절
  '2025-10-06', '2025-10-07', '2025-10-08', // 추석 연휴
  '2025-10-09', // 한글날
  '2025-12-25', // 성탄절
  // 2026
  '2026-01-01',
  '2026-02-16', '2026-02-17', '2026-02-18', // 설날
  '2026-03-01', '2026-03-02', // 삼일절 + 대체
  '2026-05-05',
  '2026-05-24', '2026-05-25', // 부처님오신날 + 대체
  '2026-06-06',
  '2026-08-15', '2026-08-17',
  '2026-09-24', '2026-09-25', '2026-09-26', // 추석
  '2026-10-03', '2026-10-05',
  '2026-10-09',
  '2026-12-25',
  // 2027
  '2027-01-01',
  '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09',
  '2027-03-01',
  '2027-05-05', '2027-05-13',
  '2027-06-06', '2027-06-07',
  '2027-08-15', '2027-08-16',
  '2027-10-03', '2027-10-04', '2027-10-14', '2027-10-15', '2027-10-16',
  '2027-10-09', '2027-10-11',
  '2027-12-25',
]);

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

/**
 * `from` 으로부터 n 영업일(주말·한국 공휴일 제외) 후의 Date 반환.
 *   - 시작일(from) 은 카운트에 포함하지 않음 — "발송일로부터 5 영업일" = 다음 영업일부터 세어 5번째.
 *   - n이 0이면 from 그대로 반환.
 *   - 서버 타임존 영향을 받지 않도록 UTC 메서드로 동작.
 *     KST 기준 계산이 필요하면 호출자가 `new Date(Date.now() + 9h)` 형태로 시프트해서 넘기면 됨.
 */
export function addWorkingDays(from: Date, n: number): Date {
  const d = new Date(from.getTime());
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    const isWeekendUtc = dow === 0 || dow === 6;
    const ymdUtc = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    if (!isWeekendUtc && !KR_HOLIDAYS.has(ymdUtc)) added++;
  }
  return d;
}

/**
 * 당월(year, month, 1~12) 급여의 실제 지급일을 반환
 *   기준: 익월 10일. 그 날이 주말/공휴일이면 직전 평일.
 * @returns YYYY-MM-DD
 */
export function payDateForMonth(year: number, month1to12: number): string {
  // 익월 10일
  const next = new Date(year, month1to12 - 1 + 1, 10);
  // 주말/공휴일이면 하루씩 뒤로 (직전 평일)
  while (isWeekend(next) || KR_HOLIDAYS.has(ymd(next))) {
    next.setDate(next.getDate() - 1);
  }
  return ymd(next);
}

/**
 * 지급일(YYYY-MM-DD) 이 어떤 '급여 월' 에 속하는지 역산
 *   payDateForMonth() 의 역함수에 가까움.
 *   회차의 first_payment_date 또는 second_payment_date 를 받아 그 회차가
 *   어떤 (year, month) 의 급여 사이클인지 매칭하는 데 사용.
 *
 *   규칙: 지급일이 D 인 경우, 그 D를 produce하는 (Y, M) 을 구한다.
 *     payDateForMonth(Y, M) === D 인 (Y, M) 을 찾는다.
 *     일반적으로 D 의 month 의 이전달.
 *     ex) D=2026-06-10 → 2026년 5월 급여
 *     ex) D=2026-06-08 (10일이 공휴일이라 당겨진 경우) → 2026년 5월 급여
 *
 *   구현: D 의 해/달 시작점에서 -1달, 0달, +1달 후보 중 일치하는 것 반환.
 *   없으면 null.
 */
export function payrollMonthFor(payDate: string): { year: number; month: number } | null {
  const m = payDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  // 후보: (yyyy, mm-1), (yyyy, mm) — 보통 mm-1
  const candidates: Array<{ year: number; month: number }> = [];
  if (mm === 1) candidates.push({ year: yyyy - 1, month: 12 });
  else candidates.push({ year: yyyy, month: mm - 1 });
  candidates.push({ year: yyyy, month: mm });
  for (const c of candidates) {
    if (payDateForMonth(c.year, c.month) === payDate) return c;
  }
  return null;
}

/**
 * YYYY-MM-DD 정규화 (시트 다양한 표기 흡수)
 */
export function normalizeYmd(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  const m = t.match(/^(\d{4})[\s.\-\/]+(\d{1,2})[\s.\-\/]+(\d{1,2})\b/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}
