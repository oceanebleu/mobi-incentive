// ─────────────────────────────────────────────────────────────
// POST /api/users/[employee_id]/access-code
// 관리자(=canManageUsers)가 특정 사용자의 PL 고유코드를 재발급
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageUsers, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { generateAccessCode } from '@/lib/access-code';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: { employee_id: string } }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageUsers(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const empId = decodeURIComponent(params.employee_id);
  if (!empId) {
    return NextResponse.json({ error: 'invalid employee_id' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const newCode = generateAccessCode();

  const { data, error } = await supabase
    .from('users')
    .update({ access_code: newCode })
    .eq('employee_id', empId)
    .select('employee_id, access_code')
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, access_code: (data as any).access_code });
}
