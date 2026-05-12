// ─────────────────────────────────────────────────────────────
// POST /api/import/truncate
// body: { tables: ('proposals'|'projects'|'project_members')[] }
// — 이미 import한 데이터를 비우고 새로 가져올 때만 사용
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageUsers, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['proposals', 'projects', 'project_members']);

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageUsers(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const tables = (body?.tables ?? []) as string[];
  for (const t of tables) {
    if (!ALLOWED.has(t)) {
      return NextResponse.json({ error: `invalid table: ${t}` }, { status: 400 });
    }
  }
  if (tables.length === 0) {
    return NextResponse.json({ error: 'tables required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  // project_members → projects → proposals 순서로 비우기 (FK 충돌 방지)
  const order = ['project_members', 'projects', 'proposals'];
  const result: Record<string, number | string> = {};
  for (const t of order) {
    if (!tables.includes(t)) continue;
    const { error, count } = await supabase
      .from(t)
      .delete({ count: 'exact' })
      .neq('id', t === 'proposals' ? 0 : '__never_match__'); // delete-all 트릭
    if (error) {
      return NextResponse.json({ error: `${t}: ${error.message}` }, { status: 500 });
    }
    result[t] = count ?? 0;
  }

  return NextResponse.json({ ok: true, deleted: result });
}
