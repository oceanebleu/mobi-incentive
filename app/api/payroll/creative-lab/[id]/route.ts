// DELETE /api/payroll/creative-lab/[id] — 단일 row 삭제
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canViewPayroll, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
};

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canViewPayroll(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_CACHE });
  }
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400, headers: NO_CACHE });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('creative_lab_payouts').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE });
  }
  return NextResponse.json({ ok: true }, { headers: NO_CACHE });
}
