// ─────────────────────────────────────────────────────────────
// POST /api/pl/auth
// Body: { emp_id: string }
// 사번을 받아 users 테이블에서 매칭되는 (재직) 사용자 정보를 반환.
// 로그인 없이 호출 가능한 PL 양식 페이지용 — '본인 확인' 수준.
//   - 응답: { ok, employee_id, name, team }
//   - 사번이 없거나 퇴사면 404
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const empId: string = (body?.emp_id ?? '').toString().trim();
  if (!empId) {
    return NextResponse.json({ error: '사번을 입력하세요.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('employee_id, name, affiliation2, status')
    .eq('employee_id', empId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: '사번을 찾을 수 없습니다.' }, { status: 404 });
  }
  if ((data as any).status === '퇴사') {
    return NextResponse.json({ error: '퇴사한 사용자 사번입니다.' }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    employee_id: (data as any).employee_id,
    name: (data as any).name,
    team: (data as any).affiliation2 ?? null,
  });
}
