// ─────────────────────────────────────────────────────────────
// GET /api/pl/projects?emp=<employee_id>&code=<access_code>
// 사번 + 고유코드 검증 후 본인에게 배정된 (= projects.pl 과 이름 일치) 프로젝트 리스트 반환.
// 응답: { name, projects: [{ id, campaign_name, submitted_at, pl_completed, acquisition_status }] }
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';

// Vercel CDN/Next.js fetch cache 모두 우회 — 매 요청 fresh
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const empId = (searchParams.get('emp') ?? '').trim();
  const codeInput = (searchParams.get('code') ?? '').trim().toUpperCase();
  if (!empId) {
    return NextResponse.json(
      { error: 'emp 쿼리 파라미터가 필요합니다.' },
      { status: 400, headers: NO_CACHE }
    );
  }
  if (!codeInput) {
    return NextResponse.json(
      { error: 'code 쿼리 파라미터가 필요합니다.' },
      { status: 400, headers: NO_CACHE }
    );
  }

  const supabase = getSupabaseAdmin();

  // 1) 사번 + 고유코드 매칭
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('employee_id, name, status, access_code')
    .eq('employee_id', empId)
    .maybeSingle();
  if (userErr)
    return NextResponse.json({ error: userErr.message }, { status: 500, headers: NO_CACHE });
  if (!user) {
    return NextResponse.json(
      { error: '사번을 찾을 수 없습니다.' },
      { status: 404, headers: NO_CACHE }
    );
  }
  if ((user as any).status === '퇴사') {
    return NextResponse.json(
      { error: '퇴사한 사용자 사번입니다.' },
      { status: 403, headers: NO_CACHE }
    );
  }
  const dbCode = ((user as any).access_code ?? '').toString().trim().toUpperCase();
  if (!dbCode) {
    return NextResponse.json(
      { error: '아직 고유코드가 발급되지 않았습니다. 운영팀에 문의해 주세요.' },
      { status: 403, headers: NO_CACHE }
    );
  }
  if (dbCode !== codeInput) {
    return NextResponse.json(
      { error: '사번과 고유코드가 일치하지 않습니다.' },
      { status: 401, headers: NO_CACHE }
    );
  }
  const userName: string = (user as any).name;
  const userNameKey = normalize(userName);

  // 2) projects 전체에서 pl 이름이 매칭되는 것만 추림 (PL 이름은 자유 텍스트라 정규화 비교)
  //    위원회 결과 노출에 필요한 컬럼들 모두 포함.
  //    committee_result 컬럼이 아직 마이그레이션 안 된 환경에서도 동작하도록 폴백 적용.
  const FULL_COLS =
    'id, campaign_name, submitted_at, pl, pl_completed, acquisition_status, fund_confirmed, first_payment_date, first_payment_ratio, second_payment_date, second_payment_ratio, first_payment_completed, second_payment_completed, first_payment_skipped, second_payment_skipped, incentive_fund, committee_result, won_date, campaign_end_date';
  // committee_result / won_date 컬럼이 마이그레이션 안 된 환경에서도 동작하도록 폴백
  const FALLBACK_COLS = FULL_COLS.replace(', committee_result', '').replace(', won_date', '');
  let projects: any[] | null = null;
  {
    const r1 = await supabase.from('projects').select(FULL_COLS).order('submitted_at', { ascending: false });
    if (r1.error && /committee_result|won_date/.test(r1.error.message ?? '')) {
      const r2 = await supabase.from('projects').select(FALLBACK_COLS).order('submitted_at', { ascending: false });
      if (r2.error) {
        return NextResponse.json({ error: r2.error.message }, { status: 500, headers: NO_CACHE });
      }
      projects = r2.data ?? [];
    } else if (r1.error) {
      return NextResponse.json({ error: r1.error.message }, { status: 500, headers: NO_CACHE });
    } else {
      projects = r1.data ?? [];
    }
  }

  const mine = (projects ?? []).filter(p => {
    const plName: string | null = (p as any).pl ?? null;
    if (!plName) return false;
    if (normalize(plName) !== userNameKey) return false;
    // 1차 지급 완료 전에 대행종료된 건은 PL 페이지에서 노출하지 않음
    //   (1차 지급 완료 후 대행종료된 건은 결과 확인 위해 그대로 노출)
    if (
      (p as any).acquisition_status === 'CANCELLED' &&
      !(p as any).first_payment_completed
    ) {
      return false;
    }
    return true;
  });

  // 위원회 결과 표시용 — 재원확정 이상 단계의 멤버 데이터 한 번에 로드
  const committeeIds = mine
    .filter(
      (p: any) => p.fund_confirmed || p.first_payment_completed || p.second_payment_completed
    )
    .map((p: any) => p.id);

  let membersByProject = new Map<string, any[]>();
  if (committeeIds.length > 0) {
    const { data: memRows } = await supabase
      .from('project_members')
      .select('project_id, member_name, contribution, first_amount, second_amount, is_team_account, team_name, role')
      .in('project_id', committeeIds)
      .order('contribution', { ascending: false });
    for (const m of memRows ?? []) {
      const pid = (m as any).project_id;
      if (!membersByProject.has(pid)) membersByProject.set(pid, []);
      membersByProject.get(pid)!.push(m);
    }
  }

  return NextResponse.json(
    {
      employee_id: (user as any).employee_id,
      name: userName,
      projects: mine.map(p => ({
        id: (p as any).id,
        campaign_name: (p as any).campaign_name,
        submitted_at: (p as any).submitted_at,
        pl_completed: (p as any).pl_completed,
        acquisition_status: (p as any).acquisition_status,
        fund_confirmed: (p as any).fund_confirmed,
        first_payment_date: (p as any).first_payment_date,
        first_payment_ratio: (p as any).first_payment_ratio,
        second_payment_date: (p as any).second_payment_date,
        second_payment_ratio: (p as any).second_payment_ratio,
        first_payment_completed: (p as any).first_payment_completed,
        second_payment_completed: (p as any).second_payment_completed,
        first_payment_skipped: (p as any).first_payment_skipped,
        second_payment_skipped: (p as any).second_payment_skipped,
        incentive_fund: (p as any).incentive_fund,
        committee_result: (p as any).committee_result ?? null,
        won_date: (p as any).won_date ?? null,
        campaign_end_date: (p as any).campaign_end_date ?? null,
        members: membersByProject.get((p as any).id) ?? [],
      })),
    },
    { headers: NO_CACHE }
  );
}
