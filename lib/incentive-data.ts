// ─────────────────────────────────────────────────────────────
// lib/incentive-data.ts
// Supabase 기반 신규 데이터 모델 + 훅 + 집계 함수
//
//   - useIncentiveData()          /api/projects fetch + 자동 재조회
//   - calcMemberSummariesV2()     member-level paid_at(≤오늘) 기준 누적 집계
//   - getDashboardStatsV2()       대시보드용 합계 (member-level 기준)
//   - statusFromBooleans()        4개 boolean → ProjectStatus 라벨 도출
// ─────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState, useCallback } from 'react';

// ─── 타입 (Supabase 행을 그대로 반영) ──────────────────────────

/**
 * 시트에서 들어오는 다양한 날짜 표기를 `YYYY-MM-DD` 로 정규화.
 *   '2026. 5. 4' / '2026.5.4' / '2026/5/4' / '2026-5-4' / '2026-05-04' 등 모두 지원.
 *   파싱 실패 시 null.
 */
export function normalizeDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  // YYYY-MM-DD or YYYY.MM.DD or YYYY/MM/DD (구분자 +공백 허용)
  const m = t.match(/^(\d{4})[\s.\-\/]+(\d{1,2})[\s.\-\/]+(\d{1,2})\b/);
  if (!m) return null;
  const y = m[1];
  const mo = m[2].padStart(2, '0');
  const d = m[3].padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** 한국 기준 오늘(YYYY-MM-DD) */
function todayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 멤버가 퇴사자인지 판단 — 두 조건 중 하나만 만족해도 퇴사자
 *   1) status === '퇴사' (시트 F열 명시적 표기)
 *   2) last_work_date 가 오늘보다 이전 (시트 H열, 마지막 근무일이 지난 사람)
 * 팀 계정(Creative.Lab 등)은 항상 false.
 * last_work_date 는 시트에서 들어온 다양한 표기를 정규화해서 비교.
 */
export function isRetiredMember(m: {
  is_team_account: boolean;
  status?: string | null;
  last_work_date?: string | null;
}): boolean {
  if (m.is_team_account) return false;
  if (m.status === '퇴사') return true;
  const lwd = normalizeDate(m.last_work_date);
  if (lwd && lwd < todayKST()) return true;
  return false;
}

/**
 * 표시용 회차 금액 — 인센티브 정책 정합성 우선:
 *   `incentive_fund × 지급비율(%) × 기여도(%) ÷ 100 ÷ 100` 으로 항상 자동 계산.
 *   DB 의 first_amount / second_amount 는 폴백 (재원이 0이거나 기여도가 0인 경우만 사용).
 *
 * 이전 정책에서는 DB 저장값을 우선했지만, CSV 임포트나 과거 다른 정책으로 들어간 값이
 * 자동 산식과 어긋나는 사례가 있어 항상 산식대로 계산하도록 통일.
 */
export function effectivePhaseAmount(
  m: { first_amount: number; second_amount: number; contribution: number },
  p: { incentive_fund: number; first_payment_ratio: number | null; second_payment_ratio: number | null },
  phase: 1 | 2
): number {
  const ratio = phase === 1
    ? (p.first_payment_ratio ?? 60)
    : (p.second_payment_ratio ?? 40);
  const fund = p.incentive_fund ?? 0;
  const contrib = m.contribution ?? 0;
  if (fund > 0 && contrib > 0) {
    return Math.round((fund * ratio / 100) * (contrib / 100));
  }
  // 폴백 — 재원·기여도가 없는 과거 데이터
  const stored = phase === 1 ? m.first_amount : m.second_amount;
  return stored ?? 0;
}

export interface SupabaseProjectMember {
  project_id: string;
  member_name: string;
  employee_id: string | null;
  is_team_account: boolean;
  contribution: number;
  incentive_amount: number;
  first_amount: number;
  first_paid_at: string | null;
  second_amount: number;
  second_paid_at: string | null;
  // PL 양식에서 입력
  role: string | null;       // 'PL' | 'PJ'
  team_name: string | null;  // 마케팅1팀, Creative.Lab 등
  duty: string | null;       // 담당 업무 상세
  // 지급 대상 여부 (수동 토글) — null 이면 자동 (지급일 기준 재직 중이면 지급)
  first_payable: boolean | null;
  second_payable: boolean | null;
}

export interface SupabaseProject {
  id: string;
  campaign_name: string;
  committee_sheet_link: string | null;
  r_value: number | null;
  commission: number | null;
  team: string | null;
  pl: string | null;
  submitted_at: string | null;
  distributed: boolean;
  distributed_at: string | null;
  acquisition_status: 'WON' | 'LOST' | 'CANCELLED' | 'PENDING' | 'REVIEWING' | 'RESULT_PENDING' | null;
  pl_completed: boolean;
  fund_confirmed: boolean;
  incentive_fund: number;
  first_payment_date: string | null;
  first_payment_ratio: number | null;
  first_payment_completed: boolean;
  first_payment_skipped: boolean;
  second_payment_date: string | null;
  second_payment_ratio: number | null;
  second_payment_completed: boolean;
  second_payment_skipped: boolean;
  campaign_end_date: string | null;
  category: string | null;
  note: string | null;
  fund_rate: number | null; // 0.01 (연장) | 0.02 (신규) — 수정 가능
  /** PL 작성요청 Slack DM 발송 시각 (ISO 8601). null = 아직 발송 안 됨 */
  pl_request_sent_at: string | null;
  /** 지급알림 Slack DM 발송 시각 (ISO 8601). null = 아직 발송 안 됨 */
  payment_notify_sent_at: string | null;
  /** 비딩 리뷰(프로젝트 리뷰) 진행일 — 시트 09 결과 분석(ALL) C5 에서 sync (YYYY-MM-DD). null = 미진행 */
  review_date: string | null;
  /** review_date 를 마지막으로 sync 한 시각 (ISO 8601) */
  review_synced_at: string | null;
  /** 마지막 sync 시 발생한 에러(시트 접근 실패 등) — 사용자에게 안내용 */
  review_sync_error: string | null;
  /** 운영위원회 결과 메모 — 관리자가 작성, PL 위원회결과 화면에서 열람 */
  committee_result: string | null;
  /** 수주확정일자 — PL 양식에서 작성. first_payment_date 와는 별개. */
  won_date: string | null;
  members: SupabaseProjectMember[];
}

// ─── 훅 ────────────────────────────────────────────────────────

interface UseIncentiveData {
  projects: SupabaseProject[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useIncentiveData(): UseIncentiveData {
  const [projects, setProjects] = useState<SupabaseProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/projects?_=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
      .then(r => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then(j => {
        if (cancelled) return;
        setProjects(j.projects ?? []);
        setError(null);
      })
      .catch(e => {
        if (cancelled) return;
        setError(String(e));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const refresh = useCallback(() => setVersion(v => v + 1), []);
  return { projects, loading, error, refresh };
}

// ─── 회차 상태 도출 ────────────────────────────────────────────
//
// 한 회차(1차 또는 2차)의 상태를 결정:
//   - skipped  : 프로젝트 자체에서 미지급으로 표시된 회차 (영영 안 지급)
//   - excluded : paid_at 이 마지막 근무일 이후라 카운트 제외 (퇴직 후 예정된 지급)
//   - paid     : paid_at ≤ today
//   - pending  : paid_at > today, 또는 paid_at 이 NULL (지급일 미정)
//
// amount=0 인 경우는 신경 안 써도 결과적으로 합계에 0이 더해질 뿐.

export type PhaseStatus = 'paid' | 'pending' | 'excluded' | 'skipped';

function todayIso(): string {
  // 한국 시간 기준 YYYY-MM-DD
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * 회차 상태 결정
 *   인자:
 *     paidAt       — 멤버의 실제 지급일 (member.first_paid_at)
 *     plannedDate  — 회차 계획 지급일 (project.first_payment_date)
 *     lastWorkDate — 멤버 마지막 근무일
 *     today        — 오늘 (YYYY-MM-DD)
 *     skipped      — 회차 자체 미지급
 *     payable      — 멤버별 지급 대상 (true=명시적 지급, false=명시적 미지급, null=자동 판단)
 *
 *   우선순위:
 *     1) skipped 면 → skipped
 *     2) payable === false (명시적 미지급) → excluded
 *     3) payable === true (명시적 지급) → lwd 비교 건너뛰고 paid/pending 분류
 *        (사용자가 "퇴직 후라도 지급" 으로 수동 토글한 경우)
 *     4) payable === null/undefined (자동) → lwd 비교 후 excluded/paid/pending 분류
 */
function phaseStatus(
  paidAt: string | null,
  plannedDate: string | null,
  lastWorkDate: string | null | undefined,
  today: string,
  skipped: boolean,
  payable: boolean | null | undefined = null
): PhaseStatus {
  if (skipped) return 'skipped';
  if (payable === false) return 'excluded';
  const lwdN = normalizeDate(lastWorkDate);
  const paidN = normalizeDate(paidAt);
  const effectiveDate = paidN ?? normalizeDate(plannedDate);
  // 명시적 true 가 아니라 자동 판단인 경우에만 lwd 비교
  if (payable !== true && lwdN && effectiveDate && effectiveDate > lwdN) {
    return 'excluded';
  }
  if (paidN && paidN <= today) return 'paid';
  return 'pending';
}

// ─── 멤버별 집계 (개인별 지급 관리 / 대시보드 Top earners) ─────

export interface MemberProjectLine {
  project_id: string;
  campaign_name: string;
  /** 프로젝트 제출일 기준 연도 (UI 표시용 컨텍스트) */
  year: number;
  contribution: number;
  acquisition_status: string | null; // 'WON' | 'LOST' | ... — UI 라벨링용
  first_amount: number;
  first_paid_at: string | null;
  first_status: PhaseStatus;
  /** 1차 지급일(또는 예정일) 기준 연도 — 0 이면 미정 */
  first_year: number;
  second_amount: number;
  second_paid_at: string | null;
  second_status: PhaseStatus;
  /** 2차 지급일(또는 예정일) 기준 연도 — 0 이면 미정 */
  second_year: number;
}

export interface MemberSummary {
  member_name: string;
  is_team_account: boolean;
  employee_id: string | null;
  team: string | null; // users.affiliation2 (소속2)
  last_work_date: string | null;
  status: string | null; // users.status — '재직' | '퇴사' | '휴직' | '퇴사예정' ...
  total_paid: number;
  total_pending: number;
  total_excluded: number;
  total_skipped: number; // 프로젝트 단위로 미지급 처리된 회차들의 합
  yearly_breakdown: Record<number, { paid: number; pending: number }>;
  projects: MemberProjectLine[];
}

export interface MemberSummariesOptions {
  /** 이름 → 마지막 근무일 (퇴사자만 채워짐) */
  lastWorkDateByName?: Record<string, string>;
  /** 이름 → 팀 (users.affiliation2) — 멤버 행 표시용 */
  teamByName?: Record<string, string>;
  /** 이름 → employee_id — 사용자 매칭이 안 된 case 판별용 */
  employeeIdByName?: Record<string, string>;
  /** 이름 → 재직상태 ('재직'/'퇴사'/'휴직'/'퇴사예정' …) */
  statusByName?: Record<string, string>;
  /**
   * Creative.Lab(팀 계정) 실지급 합계 — 월별 인센티브 실지급액(creative_lab_payouts).
   * 팀 계정 summary 의 pending 에서 빼서 paid 로 옮긴다.
   * 개인과 달리 Creative.Lab 은 회차/지급일 기반이 아니라 누적 후 일괄 지급.
   */
  creativeLabPaidTotal?: number;
}

export function calcMemberSummariesV2(
  projects: SupabaseProject[],
  opts: MemberSummariesOptions = {}
): MemberSummary[] {
  const today = todayIso();
  const byName = opts.lastWorkDateByName ?? {};
  const teamByName = opts.teamByName ?? {};
  const empIdByName = opts.employeeIdByName ?? {};
  const statusByName = opts.statusByName ?? {};
  const map = new Map<string, MemberSummary>();

  for (const p of projects) {
    // 재원 미확정 프로젝트는 건너뛴다 (집계 의미 없음)
    if (!p.fund_confirmed && !p.first_payment_completed && !p.second_payment_completed) {
      // 단, 인센티브 금액이 부여된 멤버 행이 있으면 집계에 포함 (예외적 케이스)
      const hasAnyAmount = p.members.some(m => m.first_amount > 0 || m.second_amount > 0);
      if (!hasAnyAmount) continue;
    }

    const year = p.submitted_at ? parseInt(p.submitted_at.slice(0, 4), 10) : 0;

    for (const m of p.members) {
      const key = m.member_name;
      if (!map.has(key)) {
        map.set(key, {
          member_name: m.member_name,
          is_team_account: m.is_team_account,
          employee_id: m.employee_id ?? empIdByName[m.member_name] ?? null,
          team: teamByName[m.member_name] ?? null,
          last_work_date: m.is_team_account ? null : (byName[m.member_name] ?? null),
          status: m.is_team_account ? null : (statusByName[m.member_name] ?? null),
          total_paid: 0,
          total_pending: 0,
          total_excluded: 0,
          total_skipped: 0,
          yearly_breakdown: {},
          projects: [],
        });
      }
      const s = map.get(key)!;

      // 팀 계정(Creative.Lab) — 1차/2차 구분 없이 합산
      //   · 지급일·last_work_date 비교 적용 안 함
      //   · 프로젝트 풀 전체를 pending 으로 누적 — 실지급은 후처리에서 creativeLabPaidTotal 만큼 paid 로 이동
      if (m.is_team_account) {
        const isLost = p.acquisition_status === 'LOST';
        const f = effectivePhaseAmount(m, p, 1);
        const s2 = effectivePhaseAmount(m, p, 2);
        const totalPool = (isLost || p.first_payment_skipped ? 0 : f) +
                          (isLost || p.second_payment_skipped ? 0 : s2);
        if (isLost || p.first_payment_skipped) s.total_skipped += f;
        if (isLost || p.second_payment_skipped) s.total_skipped += s2;
        if (totalPool > 0) s.total_pending += totalPool;
        // 연도 — 프로젝트 제출일 기준 단일 회차로 누적
        if (totalPool > 0 && year > 0) {
          if (!s.yearly_breakdown[year]) s.yearly_breakdown[year] = { paid: 0, pending: 0 };
          s.yearly_breakdown[year].pending += totalPool;
        }
        s.projects.push({
          project_id: p.id,
          campaign_name: p.campaign_name,
          year,
          contribution: m.contribution,
          acquisition_status: p.acquisition_status,
          // 합계를 first_amount 에 담아 표시 (1차/2차 통합)
          first_amount: totalPool,
          first_paid_at: null,
          first_status: totalPool > 0 ? 'pending' : 'skipped',
          first_year: year,
          second_amount: 0,
          second_paid_at: null,
          second_status: 'skipped',
          second_year: 0,
        });
        continue;
      }

      // 회차 상태 결정
      //   - 프로젝트가 LOST(수주실패) 면 두 회차 모두 자동으로 skipped 취급
      //   - 또는 명시적인 first/second_payment_skipped 플래그
      const projectLost = p.acquisition_status === 'LOST';
      // 지급 대상 — DB 값(true/false) 그대로 전달, null/undefined 면 phaseStatus 가 자동 판단
      const firstPayable =
        typeof (m as any).first_payable === 'boolean' ? (m as any).first_payable : null;
      const secondPayable =
        typeof (m as any).second_payable === 'boolean' ? (m as any).second_payable : null;
      const firstStatus = phaseStatus(
        m.first_paid_at,
        p.first_payment_date,
        s.last_work_date,
        today,
        projectLost || !!p.first_payment_skipped,
        firstPayable
      );
      const secondStatus = phaseStatus(
        m.second_paid_at,
        p.second_payment_date,
        s.last_work_date,
        today,
        projectLost || !!p.second_payment_skipped,
        secondPayable
      );

      // 회차 금액 — CSV 임포트로 0 이 들어간 행은 effectivePhaseAmount 로 자동 환산
      const firstAmt = effectivePhaseAmount(m, p, 1);
      const secondAmt = effectivePhaseAmount(m, p, 2);

      // 합계 누적
      const addToBucket = (amt: number, status: PhaseStatus) => {
        if (amt === 0) return;
        if (status === 'paid') s.total_paid += amt;
        else if (status === 'pending') s.total_pending += amt;
        else if (status === 'excluded') s.total_excluded += amt;
        else if (status === 'skipped') s.total_skipped += amt;
      };
      addToBucket(firstAmt, firstStatus);
      addToBucket(secondAmt, secondStatus);

      // 회차별 연도 — 실제 지급일 우선, 없으면 예정일
      //   - 예전: 프로젝트 제출일 연도로 묶음 (2026년 지급도 2025로 잡힘)
      //   - 변경: 각 회차의 paid_at(또는 planned_date) 기준
      const yearOfPhase = (paidAt: string | null, plannedDate: string | null): number => {
        const d = paidAt ?? plannedDate;
        if (!d || d.length < 4) return 0;
        const y = parseInt(d.slice(0, 4), 10);
        return Number.isFinite(y) ? y : 0;
      };
      const firstYear = yearOfPhase(m.first_paid_at, p.first_payment_date);
      const secondYear = yearOfPhase(m.second_paid_at, p.second_payment_date);

      // 연도별 buckets — 회차별로 독립적인 연도에 누적
      const bucket = (yr: number) => {
        if (yr <= 0) return null;
        if (!s.yearly_breakdown[yr]) s.yearly_breakdown[yr] = { paid: 0, pending: 0 };
        return s.yearly_breakdown[yr];
      };
      const b1 = bucket(firstYear);
      if (b1) {
        if (firstStatus === 'paid') b1.paid += firstAmt;
        else if (firstStatus === 'pending') b1.pending += firstAmt;
      }
      const b2 = bucket(secondYear);
      if (b2) {
        if (secondStatus === 'paid') b2.paid += secondAmt;
        else if (secondStatus === 'pending') b2.pending += secondAmt;
      }

      // 프로젝트 단위 명세 — 환산된 금액으로 표시
      s.projects.push({
        project_id: p.id,
        campaign_name: p.campaign_name,
        year,
        contribution: m.contribution,
        acquisition_status: p.acquisition_status,
        first_amount: firstAmt,
        first_paid_at: m.first_paid_at,
        first_status: firstStatus,
        first_year: firstYear,
        second_amount: secondAmt,
        second_paid_at: m.second_paid_at,
        second_status: secondStatus,
        second_year: secondYear,
      });
    }
  }

  // Creative.Lab(팀 계정) 실지급 보정 — paidTotal 만큼 pending → paid 로 이동
  //   · 팀 계정이 여러 개일 가능성은 낮지만, 만약 있다면 첫 번째 팀 계정에 모두 적용
  //   · 초과 지급된 경우 pending 이 음수로 가지 않도록 보호
  const clPaid = Math.max(0, opts.creativeLabPaidTotal ?? 0);
  if (clPaid > 0) {
    for (const s of map.values()) {
      if (!s.is_team_account) continue;
      const offset = Math.min(clPaid, s.total_pending);
      s.total_pending -= offset;
      s.total_paid += offset;
      // 연도별 — 단순화: 가장 최근 연도에서 차감 (UI 의 연도별 카드 정합성)
      const years = Object.keys(s.yearly_breakdown)
        .map(Number)
        .filter(n => n > 0)
        .sort((a, b) => b - a);
      let remain = offset;
      for (const yr of years) {
        if (remain <= 0) break;
        const bucket = s.yearly_breakdown[yr];
        const take = Math.min(remain, bucket.pending);
        bucket.pending -= take;
        bucket.paid += take;
        remain -= take;
      }
      break;
    }
  }

  return Array.from(map.values());
}

// ─── 대시보드 KPI 계산 ─────────────────────────────────────────

export interface DashboardStatsV2 {
  totalPaid: number;            // 멤버 합산 paid (paid_at ≤ today)
  totalFirstPaid: number;
  totalSecondPaid: number;
  totalPending: number;         // 멤버 합산 pending
  firstPayRatio: number;        // % — 재원확정 프로젝트 중 1차 완료된 비율
  secondPayRatio: number;
  allPayRatio: number;          // 1·2차 모두 완료
  // 분자/분모 카운트 (위원회 진행 N건 중 N건 식 노출용)
  fundConfirmedCount: number;   // 분모 = 재원확정 이상 (= 위원회 진행)
  firstPaidCount: number;
  secondPaidCount: number;
  allPaidCount: number;
  // 1차 지급 후 대행종료된 건 — 운영 중단 리스크 추적용
  firstPaidThenCancelledCount: number;
  totalProjects: number;
  stageCounts: Record<string, number>;
}

const FUND_CONFIRMED_OR_LATER = (p: SupabaseProject) =>
  p.fund_confirmed || p.first_payment_completed || p.second_payment_completed;

export function getDashboardStatsV2(
  projects: SupabaseProject[],
  /**
   * 디렉토리 정보 (옵션). 주어지면 개인별 지급 관리 페이지와 동일한 정책으로 합산.
   */
  directory?: {
    lastWorkDateByName: Record<string, string | null | undefined>;
    statusByName: Record<string, string | null | undefined>;
  },
  /**
   * Creative.Lab 정책 (옵션) — 별도 정산:
   *   · 프로젝트 관리의 Creative.Lab(팀 계정) 회차 금액은 모두 totalPending 으로 누적
   *   · creativeLabPaidTotal = 월별 인센티브 실지급액(creative_lab_payouts) 합계
   *     → 그 금액만큼 pending 에서 빼고 paid 로 옮김
   */
  creativeLab?: { paidTotal: number }
): DashboardStatsV2 {
  const today = todayIso();
  let totalFirstPaid = 0;
  let totalSecondPaid = 0;
  let totalPending = 0;

  for (const p of projects) {
    const projectLost = p.acquisition_status === 'LOST';
    for (const m of p.members) {
      // Creative.Lab(팀 계정) — 프로젝트 풀은 모두 pending 으로 누적 (paid 분류 안 함)
      //   실지급은 별도로 creativeLab.paidTotal 에서 흡수
      if (m.is_team_account) {
        if (projectLost) continue;
        const f = effectivePhaseAmount(m, p, 1);
        const s = effectivePhaseAmount(m, p, 2);
        if (!p.first_payment_skipped) totalPending += f;
        if (!p.second_payment_skipped) totalPending += s;
        continue;
      }

      // 디렉토리가 있을 땐 퇴사자 회차 통째로 스킵
      if (directory) {
        if (
          isRetiredMember({
            is_team_account: false,
            status: directory.statusByName[m.member_name],
            last_work_date: directory.lastWorkDateByName[m.member_name],
          })
        ) {
          continue;
        }
      }
      const lwdRaw = directory ? directory.lastWorkDateByName[m.member_name] ?? null : null;
      const lwd = normalizeDate(lwdRaw);
      const afterLwd = (paidAt: string | null) => {
        if (!lwd || !paidAt) return false;
        const pn = normalizeDate(paidAt) ?? paidAt;
        return pn > lwd;
      };

      // 회차 금액 — CSV 임포트로 0 이 들어간 행은 자동 환산
      const firstAmt = effectivePhaseAmount(m, p, 1);
      const secondAmt = effectivePhaseAmount(m, p, 2);

      // 1차
      if (projectLost || p.first_payment_skipped) {
        // 수주실패 또는 명시적 미지급 → paid/pending 어디에도 안 더해짐
      } else if (afterLwd(m.first_paid_at)) {
        // 마지막 근무일 이후 지급 예정 → excluded
      } else if (m.first_paid_at && m.first_paid_at <= today) {
        totalFirstPaid += firstAmt;
      } else if (firstAmt > 0) {
        totalPending += firstAmt;
      }
      // 2차
      if (projectLost || p.second_payment_skipped) {
        // 수주실패 또는 명시적 미지급 → 합계 무시
      } else if (afterLwd(m.second_paid_at)) {
        // excluded
      } else if (m.second_paid_at && m.second_paid_at <= today) {
        totalSecondPaid += secondAmt;
      } else if (secondAmt > 0) {
        totalPending += secondAmt;
      }
    }
  }

  // Creative.Lab 보정 — 월별 실지급액 합계만큼 pending 에서 빼고 paid 에 더함
  //   초과 지급(pool 보다 더 많이 지급)된 경우엔 pending 이 음수로 가지 않도록 보호
  const clPaid = Math.max(0, creativeLab?.paidTotal ?? 0);
  if (clPaid > 0) {
    const offset = Math.min(clPaid, totalPending);
    totalPending -= offset;
    totalFirstPaid += clPaid; // 실지급은 1차로 분류
  }

  const totalPaid = totalFirstPaid + totalSecondPaid;

  const base = projects.filter(FUND_CONFIRMED_OR_LATER);
  const firstPaid = base.filter(p => p.first_payment_completed);
  const secondPaid = base.filter(p => p.second_payment_completed);
  const allPaid = base.filter(p => p.first_payment_completed && p.second_payment_completed);

  // 1차 지급은 완료됐는데 그 뒤 대행종료된 건 — 운영 중단 리스크
  const firstPaidThenCancelled = projects.filter(
    p => p.first_payment_completed && p.acquisition_status === 'CANCELLED'
  );

  const firstPayRatio = base.length ? (firstPaid.length / base.length) * 100 : 0;
  const secondPayRatio = base.length ? (secondPaid.length / base.length) * 100 : 0;
  const allPayRatio = base.length ? (allPaid.length / base.length) * 100 : 0;

  // 단계별 카운트 (acquisition_status 분포)
  const stageCounts: Record<string, number> = {};
  for (const p of projects) {
    const key = p.acquisition_status ?? 'PENDING';
    stageCounts[key] = (stageCounts[key] ?? 0) + 1;
  }

  return {
    totalPaid,
    totalFirstPaid,
    totalSecondPaid,
    totalPending,
    firstPayRatio,
    secondPayRatio,
    allPayRatio,
    fundConfirmedCount: base.length,
    firstPaidCount: firstPaid.length,
    secondPaidCount: secondPaid.length,
    allPaidCount: allPaid.length,
    firstPaidThenCancelledCount: firstPaidThenCancelled.length,
    totalProjects: projects.length,
    stageCounts,
  };
}

// ─── 프로젝트 진행 상태 라벨 (4개 boolean → 단계명) ────────────

export type PaymentStage =
  | 'PL_PENDING'
  | 'PL_COMPLETED'
  | 'FUND_CONFIRMED'
  | 'FIRST_PAID'
  | 'ALL_PAID';

export const PAYMENT_STAGE_LABEL: Record<PaymentStage, string> = {
  PL_PENDING: 'PL 작성대기',
  PL_COMPLETED: 'PL 작성완료',
  FUND_CONFIRMED: '재원확정완료',
  FIRST_PAID: '1차지급완료',
  ALL_PAID: '전체지급완료',
};

export function paymentStageOf(p: SupabaseProject): PaymentStage {
  // skipped 도 "해당 회차는 더 이상 발생하지 않음" 이라는 의미에서 done 취급
  const firstDone = p.first_payment_completed || p.first_payment_skipped;
  const secondDone = p.second_payment_completed || p.second_payment_skipped;
  // ALL_PAID 는 1차·2차 모두 done 일 때만
  //   (예: 1차 대기 + 2차 미지급(skipped) 같은 케이스는 1차가 아직 안 끝난 상태 → ALL_PAID 아님)
  if (firstDone && secondDone) return 'ALL_PAID';
  if (firstDone) return 'FIRST_PAID';
  if (p.fund_confirmed) return 'FUND_CONFIRMED';
  if (p.pl_completed) return 'PL_COMPLETED';
  return 'PL_PENDING';
}

// 수주여부 라벨 (사용자 정의)
export const ACQUISITION_LABEL: Record<string, string> = {
  WON: '수주성공',
  LOST: '수주실패',
  CANCELLED: '대행종료',
  PENDING: '진행중',
  REVIEWING: '제안진행',
  RESULT_PENDING: '결과대기',
};

// ─── 사용자 디렉터리 훅 ─────────────────────────────────────────
// /api/users/directory 를 fetch 해서 이름 → {팀, 사번, 마지막근무일} 맵 반환

export interface UserDirectory {
  lastWorkDateByName: Record<string, string>;
  teamByName: Record<string, string>;
  employeeIdByName: Record<string, string>;
  statusByName: Record<string, string>; // '재직', '퇴사', '휴직', '퇴사예정' 등
  loading: boolean;
}

export function useUserDirectory(): UserDirectory {
  const [state, setState] = useState<Omit<UserDirectory, 'loading'>>({
    lastWorkDateByName: {},
    teamByName: {},
    employeeIdByName: {},
    statusByName: {},
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/users/directory', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(j => {
        if (cancelled) return;
        setState({
          lastWorkDateByName: j.lastWorkDateByName ?? {},
          teamByName: j.teamByName ?? {},
          employeeIdByName: j.employeeIdByName ?? {},
          statusByName: j.statusByName ?? {},
        });
      })
      .catch(() => {
        /* silent — 빈 맵 유지 */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...state, loading };
}
