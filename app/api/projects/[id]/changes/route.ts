// ─────────────────────────────────────────────────────────────
// GET /api/projects/[id]/changes
// 특정 프로젝트의 변경 이력(최신순 50건)을 반환.
// 앱 접근 권한이 있는 모든 사용자가 조회 가능.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canAccessApp, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canAccessApp(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const id = decodeURIComponent(params.id);
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('project_changes')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ changes: data ?? [] });
}
