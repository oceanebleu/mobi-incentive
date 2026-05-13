// ─────────────────────────────────────────────────────────────
// POST /api/proposal-archive/[id]/mark-existing
// Body: { value: boolean }
// 광고주가 다른 경로(직접 입력·과거 데이터 등)로 이미 프로젝트화돼서
// 운영위로 보내기는 불필요한 경우 수동으로 '이미 생성됨' 마크 토글.
// 이미 promoted_project_id 가 있는 row 는 거부 (정식 등록과 충돌 방지).
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageUsers, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const value: boolean = body?.value === true;

  const supabase = getSupabaseAdmin();

  const { data: row, error: getErr } = await supabase
    .from('proposal_archive')
    .select('id, promoted_project_id, marked_existing')
    .eq('id', id)
    .maybeSingle();
  if (getErr) {
    return NextResponse.json({ error: getErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if ((row as any).promoted_project_id) {
    return NextResponse.json(
      { error: '이미 운영위 등록(promote)된 항목은 수동 표시할 수 없습니다.' },
      { status: 409 }
    );
  }

  const me = {
    email: (session?.user as any)?.email ?? null,
    name: (session?.user as any)?.name ?? null,
  };

  const patch = value
    ? {
        marked_existing: true,
        marked_existing_at: new Date().toISOString(),
        marked_existing_by_email: me.email,
        marked_existing_by_name: me.name,
      }
    : {
        marked_existing: false,
        marked_existing_at: null,
        marked_existing_by_email: null,
        marked_existing_by_name: null,
      };

  const { error: upErr } = await supabase
    .from('proposal_archive')
    .update(patch)
    .eq('id', id);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, marked_existing: value });
}
