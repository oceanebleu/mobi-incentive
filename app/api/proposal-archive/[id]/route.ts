// ─────────────────────────────────────────────────────────────
// DELETE /api/proposal-archive/[id]
//   제안 자료 아카이브 단일 행 삭제.
//   용도: 시트에서 광고주명이 바뀌어 같은 프로젝트가 (구)이름 + (신)이름 으로
//         두 건 끌려온 경우, 더 이상 유효하지 않은 행을 수동 제거.
//   주의: 시트에 동일 client_name 이 여전히 존재하면 다음 sync 때 재생성될 수 있음.
//         (이름이 바뀐 stale 행은 시트에서 사라졌으므로 재생성되지 않음)
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageUsers, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageUsers(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('proposal_archive').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id });
}
