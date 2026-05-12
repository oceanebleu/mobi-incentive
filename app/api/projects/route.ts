// ─────────────────────────────────────────────────────────────
// GET /api/projects
// Supabase의 projects + project_members 를 한 번에 조회해 조인 형태로 반환.
// 각 project 객체에 members[] 배열이 임베드됨.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canAccessApp, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canAccessApp(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const [projectsRes, membersRes] = await Promise.all([
    supabase
      .from('projects')
      .select('*')
      .order('submitted_at', { ascending: false, nullsFirst: false }),
    supabase.from('project_members').select('*'),
  ]);

  if (projectsRes.error) {
    return NextResponse.json({ error: projectsRes.error.message }, { status: 500 });
  }
  if (membersRes.error) {
    return NextResponse.json({ error: membersRes.error.message }, { status: 500 });
  }

  const byProject = new Map<string, any[]>();
  for (const m of membersRes.data ?? []) {
    const pid = (m as any).project_id as string;
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid)!.push(m);
  }

  const projects = (projectsRes.data ?? []).map(p => ({
    ...p,
    members: byProject.get(p.id) ?? [],
  }));

  return NextResponse.json({ projects });
}
