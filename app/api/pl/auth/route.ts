// ─────────────────────────────────────────────────────────────
// POST /api/pl/auth
// Body: { emp_id: string, code: string }
// 사번 + 개인 고유코드 매칭 검증. 둘 다 정확해야 통과.
//   - 응답: { ok, employee_id, name, team }
//   - 사번이 없거나 코드 불일치/퇴사면 4xx
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
  const codeInput: string = (body?.code ?? '').toString().trim().toUpperCase();
  if (!empId) {
    return NextResponse.json({ error: '사번을 입력하세요.' }, { status: 400 });
  }
  if (!codeInput) {
    return NextResponse.json({ error: '개인 고유코드를 입력하세요.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('employee_id, name, affiliation2, status, access_code')
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
  const dbCode = ((data as any).access_code ?? '').toString().trim().toUpperCase();
  if (!dbCode) {
    return NextResponse.json(
      {
        error:
          '아직 고유코드가 발급되지 않았습니다. 운영팀에 문의해 사용자관리에서 코드 발급을 요청해 주세요.',
      },
      { status: 403 }
    );
  }
  if (dbCode !== codeInput) {
    return NextResponse.json(
      { error: '사번과 고유코드가 일치하지 않습니다.' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    employee_id: (data as any).employee_id,
    name: (data as any).name,
    team: (data as any).affiliation2 ?? null,
  });
}
