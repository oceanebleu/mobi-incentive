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
    fetch('/api/projects', { cache: 'no-store' })
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

function phaseStatus(
  paidAt: string | null,
  lastWorkDate: string | null | undefined,
  today: string,
  skipped: boolean
): PhaseStatus {
  if (skipped) return 'skipped';
  if (lastWorkDate && paidAt && paidAt > lastWorkDate) return 'excluded';
  if (paidAt && paidAt <= today) return 'paid';
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

      // 회차 상태 결정
      //   - 프로젝트가 LOST(수주실패) 면 두 회차 모두 자동으로 skipped 취급
      //   - 또는 명시적인 first/second_payment_skipped 플래그
      const projectLost = p.acquisition_status === 'LOST';
      const firstStatus = phaseStatus(
        m.first_paid_at,
        s.last_work_date,
        today,
        projectLost || !!p.first_payment_skipped
      );
      const secondStatus = phaseStatus(
        m.second_paid_at,
        s.last_work_date,
        today,
        projectLost || !!p.second_payment_skipped
      );

      // 합계 누적
      const addToBucket = (amt: number, status: PhaseStatus) => {
        if (amt === 0) return;
        if (status === 'paid') s.total_paid += amt;
        else if (status === 'pending') s.total_pending += amt;
        else if (status === 'excluded') s.total_excluded += amt;
        else if (status === 'skipped') s.total_skipped += amt;
      };
      addToBucket(m.first_amount, firstStatus);
      addToBucket(m.second_amount, secondStatus);

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
        if (firstStatus === 'paid') b1.paid += m.first_amount;
        else if (firstStatus === 'pending') b1.pending += m.first_amount;
      }
      const b2 = bucket(secondYear);
      if (b2) {
        if (secondStatus === 'paid') b2.paid += m.second_amount;
        else if (secondStatus === 'pending') b2.pending += m.second_amount;
      }

      // 프로젝트 단위 명세
      s.projects.push({
        project_id: p.id,
        campaign_name: p.campaign_name,
        year,
        contribution: m.contribution,
        acquisition_status: p.acquisition_status,
        first_amount: m.first_amount,
        first_paid_at: m.first_paid_at,
        first_status: firstStatus,
        first_year: firstYear,
        second_amount: m.second_amount,
        second_paid_at: m.second_paid_at,
        second_status: secondStatus,
        second_year: secondYear,
      });
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
  totalProjects: number;
  stageCounts: Record<string, number>;
}

const FUND_CONFIRMED_OR_LATER = (p: SupabaseProject) =>
  p.fund_confirmed || p.first_payment_completed || p.second_payment_completed;

export function getDashboardStatsV2(
  projects: SupabaseProject[],
  /**
   * 디렉토리 정보 (옵션). 주어지면 개인별 지급 관리 페이지와 동일한 정책으로 합산:
   *   - status === '퇴사' 인 멤버 회차는 합계 자체에서 제외
   *   - paid_at > last_work_date 회차는 excluded 로 분류되어 paid/pending 모두에서 제외
   * 주어지지 않으면 종전(모든 멤버·전 기간) 합산.
   */
  directory?: {
    lastWorkDateByName: Record<string, string | null | undefined>;
    statusByName: Record<string, string | null | undefined>;
  }
): DashboardStatsV2 {
  const today = todayIso();
  let totalFirstPaid = 0;
  let totalSecondPaid = 0;
  let totalPending = 0;

  for (const p of projects) {
    const projectLost = p.acquisition_status === 'LOST';
    for (const m of p.members) {
      // 디렉토리가 있을 땐 퇴사자(팀 계정은 제외 대상 아님) 회차 통째로 스킵
      if (directory && !m.is_team_account) {
        const status = directory.statusByName[m.member_name];
        if (status === '퇴사') continue;
      }
      const lwd = directory && !m.is_team_account
        ? directory.lastWorkDateByName[m.member_name] ?? null
        : null;
      const afterLwd = (paidAt: string | null) =>
        !!(lwd && paidAt && paidAt > lwd);

      // 1차
      if (projectLost || p.first_payment_skipped) {
        // 수주실패 또는 명시적 미지급 → paid/pending 어디에도 안 더해짐
      } else if (afterLwd(m.first_paid_at)) {
        // 마지막 근무일 이후 지급 예정 → excluded
      } else if (m.first_paid_at && m.first_paid_at <= today) {
        totalFirstPaid += m.first_amount;
      } else if (m.first_amount > 0) {
        totalPending += m.first_amount;
      }
      // 2차
      if (projectLost || p.second_payment_skipped) {
        // 수주실패 또는 명시적 미지급 → 합계 무시
      } else if (afterLwd(m.second_paid_at)) {
        // excluded
      } else if (m.second_paid_at && m.second_paid_at <= today) {
        totalSecondPaid += m.second_amount;
      } else if (m.second_amount > 0) {
        totalPending += m.second_amount;
      }
    }
  }
  const totalPaid = totalFirstPaid + totalSecondPaid;

  const base = projects.filter(FUND_CONFIRMED_OR_LATER);
  const firstPaid = base.filter(p => p.first_payment_completed);
  const secondPaid = base.filter(p => p.second_payment_completed);
  const allPaid = base.filter(p => p.first_payment_completed && p.second_payment_completed);

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
  // 2차만 완료 = 사실상 전체완료(실무상 1차 없이 2차만 완료되는 케이스는 거의 없음)
  if (secondDone) return 'ALL_PAID';
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
