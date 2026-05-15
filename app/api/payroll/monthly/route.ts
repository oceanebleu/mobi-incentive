// ─────────────────────────────────────────────────────────────
// GET /api/payroll/monthly
// 월별 인센티브 실지급액 데이터 조회.
//   응답: { months: [ { year, month, payDate, total, byPerson: [...], campaigns: [...] }, ... ] }
//
// 정책:
//   · 단계가 '재원확정완료(FUND_CONFIRMED)' 또는 '1차 지급완료(FIRST_PAID)' 인 프로젝트만 대상
//   · 회차의 지급일(first_payment_date / second_payment_date)을 payrollMonthFor() 로 역산
//     → 어느 (year, month) 급여 사이클에 속하는지 결정
//   · 각 멤버의 회차 금액은 effectivePhaseAmount 공식 사용 (CSV 임포트로 0인 행도 환산)
//   · skipped 회차 / first_payable=false / second_payable=false 인 회차는 제외
//   · 1차가 이미 지급 완료(first_payment_completed=true) 면 1차는 다시 안 잡힘
//     → 2차 예정만 잡힘
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canViewPayroll, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { normalizeYmd, payrollMonthFor, payDateForMonth } from '@/lib/payroll-date';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

interface MemberRow {
  member_name: string;
  contribution: number;
  first_amount: number;
  second_amount: number;
  first_payable: boolean | null;
  second_payable: boolean | null;
  is_team_account: boolean;
}

interface ProjectRow {
  id: string;
  campaign_name: string;
  acquisition_status: string | null;
  category: string | null;
  r_value: number | null;
  commission: number | null;
  fund_rate: number | null;
  incentive_fund: number;
  fund_confirmed: boolean;
  first_payment_date: string | null;
  first_payment_ratio: number | null;
  first_payment_completed: boolean;
  first_payment_skipped: boolean;
  second_payment_date: string | null;
  second_payment_ratio: number | null;
  second_payment_completed: boolean;
  second_payment_skipped: boolean;
}

function memberAmountFor(
  m: MemberRow,
  p: ProjectRow,
  phase: 1 | 2
): number {
  const stored = phase === 1 ? m.first_amount : m.second_amount;
  if (stored && stored > 0) return stored;
  const ratio =
    phase === 1
      ? p.first_payment_ratio ?? 60
      : p.second_payment_ratio ?? 40;
  const fund = p.incentive_fund ?? 0;
  if (fund <= 0) return 0;
  return Math.round((fund * ratio) / 100 * ((m.contribution ?? 0) / 100));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canViewPayroll(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_CACHE });
  }

  const supabase = getSupabaseAdmin();
  const [projRes, memRes] = await Promise.all([
    supabase.from('projects').select('*'),
    supabase.from('project_members').select('*'),
  ]);
  if (projRes.error) {
    return NextResponse.json({ error: projRes.error.message }, { status: 500, headers: NO_CACHE });
  }
  if (memRes.error) {
    return NextResponse.json({ error: memRes.error.message }, { status: 500, headers: NO_CACHE });
  }

  // project_id → members
  const membersByPid = new Map<string, MemberRow[]>();
  for (const m of memRes.data ?? []) {
    const pid = (m as any).project_id as string;
    if (!membersByPid.has(pid)) membersByPid.set(pid, []);
    membersByPid.get(pid)!.push(m as any);
  }

  // 월별 버킷 — key: "YYYY-MM"
  type MonthBucket = {
    year: number;
    month: number;
    payDate: string; // YYYY-MM-DD
    byPerson: Map<string, { name: string; total: number; lines: any[] }>;
    campaigns: any[];
    total: number;
  };
  const buckets = new Map<string, MonthBucket>();

  const ensureBucket = (year: number, month: number): MonthBucket => {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        year,
        month,
        payDate: payDateForMonth(year, month),
        byPerson: new Map(),
        campaigns: [],
        total: 0,
      });
    }
    return buckets.get(key)!;
  };

  for (const p of (projRes.data ?? []) as ProjectRow[]) {
    // 재원 확정 이상 + 전체 지급 완료 전 — 전체 지급 완료된 건은 더 이상 표시할 필요 없음
    if (!p.fund_confirmed) continue;
    if (p.acquisition_status === 'LOST') continue;

    const members = membersByPid.get(p.id) ?? [];

    // phase 별 처리
    const phases: Array<{
      n: 1 | 2;
      date: string | null;
      completed: boolean;
      skipped: boolean;
      ratio: number;
    }> = [
      {
        n: 1,
        date: p.first_payment_date,
        completed: p.first_payment_completed,
        skipped: p.first_payment_skipped,
        ratio: p.first_payment_ratio ?? 60,
      },
      {
        n: 2,
        date: p.second_payment_date,
        completed: p.second_payment_completed,
        skipped: p.second_payment_skipped,
        ratio: p.second_payment_ratio ?? 40,
      },
    ];

    for (const ph of phases) {
      if (ph.skipped) continue;
      if (ph.completed) continue; // 이미 지급된 회차는 월별 예정에서 제외
      const dN = normalizeYmd(ph.date);
      if (!dN) continue;
      const target = payrollMonthFor(dN);
      if (!target) continue;
      const bucket = ensureBucket(target.year, target.month);

      // 캠페인 카드 단위 멤버 라인
      const memberLines: any[] = [];
      let campaignSubtotal = 0;
      for (const m of members) {
        const payable = ph.n === 1 ? m.first_payable : m.second_payable;
        if (payable === false) continue;
        const amt = memberAmountFor(m, p, ph.n);
        if (amt <= 0) continue;
        memberLines.push({
          name: m.member_name,
          contribution: m.contribution,
          amount: amt,
          is_team_account: m.is_team_account,
        });
        campaignSubtotal += amt;
        // byPerson 합산
        const key = m.member_name;
        if (!bucket.byPerson.has(key)) {
          bucket.byPerson.set(key, { name: key, total: 0, lines: [] });
        }
        const personEntry = bucket.byPerson.get(key)!;
        personEntry.total += amt;
        personEntry.lines.push({
          campaign_name: p.campaign_name,
          phase: ph.n,
          amount: amt,
        });
      }
      if (memberLines.length === 0) continue;

      bucket.campaigns.push({
        project_id: p.id,
        campaign_name: p.campaign_name,
        phase: ph.n,
        phase_ratio: ph.ratio,
        category: p.category,
        r_value: p.r_value,
        commission: p.commission,
        fund_rate: p.fund_rate,
        incentive_fund: p.incentive_fund,
        pay_date: ph.date,
        subtotal: campaignSubtotal,
        members: memberLines.sort((a, b) => b.amount - a.amount),
      });
      bucket.total += campaignSubtotal;
    }
  }

  // 최종 직렬화 — Map → Array
  const months = Array.from(buckets.values())
    .sort((a, b) => {
      // 빠른 월 우선
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    })
    .map(b => ({
      year: b.year,
      month: b.month,
      pay_date: b.payDate,
      total: b.total,
      campaigns: b.campaigns.sort((a, c) =>
        (a.pay_date ?? '').localeCompare(c.pay_date ?? '')
      ),
      by_person: Array.from(b.byPerson.values())
        .sort((a, c) => c.total - a.total),
    }));

  return NextResponse.json({ months }, { headers: NO_CACHE });
}
