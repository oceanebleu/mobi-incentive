// ─────────────────────────────────────────────────────────────
// PATCH /api/users/[employee_id]
// 사용자의 역할(role)을 수동으로 변경 → role_overridden=true 로 마킹
//   body: { role: 'EXEC' | 'ADMIN' | 'NORMAL', clearOverride?: boolean }
//   - clearOverride=true 면 override 해제 + role은 무시 (다음 sync 때 기본 규칙으로 복귀)
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageUsers, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const VALID_ROLES: UserRole[] = ['EXEC', 'ADMIN', 'NORMAL'];

export async function PATCH(
  req: Request,
  { params }: { params: { employee_id: string } }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageUsers(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const empId = params.employee_id;
  if (!empId) {
    return NextResponse.json({ error: 'missing employee_id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({} as any));
  const newRole = body?.role as UserRole | undefined;
  const clearOverride = body?.clearOverride === true;

  const supabase = getSupabaseAdmin();

  // 수정 대상 존재 확인 + 퇴사자 보호
  const { data: target, error: getErr } = await supabase
    .from('users')
    .select('employee_id, status')
    .eq('employee_id', empId)
    .maybeSingle();
  if (getErr) {
    return NextResponse.json({ error: getErr.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (target.status === '퇴사') {
    return NextResponse.json(
      { error: '퇴사자의 권한은 변경할 수 없습니다.' },
      { status: 400 }
    );
  }

  const patch: Record<string, any> = {};
  if (clearOverride) {
    patch.role_overridden = false;
  } else {
    if (!newRole || !VALID_ROLES.includes(newRole)) {
      return NextResponse.json(
        { error: `role은 ${VALID_ROLES.join('|')} 중 하나여야 합니다.` },
        { status: 400 }
      );
    }
    patch.role = newRole;
    patch.role_overridden = true;
  }

  const { data, error } = await supabase
    .from('users')
    .update(patch)
    .eq('employee_id', empId)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ user: data });
}
