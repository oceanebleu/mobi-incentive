// ─────────────────────────────────────────────────────────────
// GET /api/pl/projects?emp=<employee_id>
// 사번으로 본인에게 배정된 (= projects.pl 과 이름 일치) 프로젝트 리스트 반환.
// 응답: { name, projects: [{ id, campaign_name, submitted_at, pl_completed, acquisition_status }] }
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const empId = (searchParams.get('emp') ?? '').trim();
  if (!empId) {
    return NextResponse.json({ error: 'emp 쿼리 파라미터가 필요합니다.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // 1) 사번 → 이름
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('employee_id, name, status')
    .eq('employee_id', empId)
    .maybeSingle();
  if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 });
  if (!user) {
    return NextResponse.json({ error: '사번을 찾을 수 없습니다.' }, { status: 404 });
  }
  if ((user as any).status === '퇴사') {
    return NextResponse.json({ error: '퇴사한 사용자 사번입니다.' }, { status: 403 });
  }
  const userName: string = (user as any).name;
  const userNameKey = normalize(userName);

  // 2) projects 전체에서 pl 이름이 매칭되는 것만 추림 (PL 이름은 자유 텍스트라 정규화 비교)
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, campaign_name, submitted_at, pl, pl_completed, acquisition_status')
    .order('submitted_at', { ascending: false });
  if (projErr) return NextResponse.json({ error: projErr.message }, { status: 500 });

  const mine = (projects ?? []).filter(p => {
    const plName: string | null = (p as any).pl ?? null;
    if (!plName) return false;
    return normalize(plName) === userNameKey;
  });

  return NextResponse.json({
    employee_id: (user as any).employee_id,
    name: userName,
    projects: mine.map(p => ({
      id: (p as any).id,
      campaign_name: (p as any).campaign_name,
      submitted_at: (p as any).submitted_at,
      pl_completed: (p as any).pl_completed,
      acquisition_status: (p as any).acquisition_status,
    })),
  });
}
