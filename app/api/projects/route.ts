// ─────────────────────────────────────────────────────────────
// /api/projects
//   GET  — projects + project_members 조인 조회
//   POST — 신규 프로젝트 추가 (관리자만)
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canAccessApp, canManageProjects, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { logProjectChange } from '@/lib/audit';

// Vercel CDN / Next.js fetch cache 우회 — 매 요청 fresh
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canAccessApp(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_CACHE });
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
    return NextResponse.json({ error: projectsRes.error.message }, { status: 500, headers: NO_CACHE });
  }
  if (membersRes.error) {
    return NextResponse.json({ error: membersRes.error.message }, { status: 500, headers: NO_CACHE });
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

  return NextResponse.json({ projects }, { headers: NO_CACHE });
}

// ─── POST: 신규 프로젝트 ────────────────────────────────────────
//
// body: { id?, campaign_name, ...projectFields, members?: [...] }
//   - id 가 비어있으면 'PROPJ' + 5자리 자동 채번 (기존 최대값 + 1)
//   - members 가 있으면 함께 insert
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageProjects(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const incomingMembers: any[] = Array.isArray(body?.members) ? body.members : [];
  const { members: _m, ...projectFields } = body ?? {};

  if (!projectFields.campaign_name) {
    return NextResponse.json({ error: 'campaign_name 은 필수입니다.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // id 자동 채번
  let id: string = projectFields.id;
  if (!id) {
    const { data: maxRow } = await supabase
      .from('projects')
      .select('id')
      .like('id', 'PROPJ%')
      .order('id', { ascending: false })
      .limit(1);
    const last = (maxRow?.[0]?.id as string | undefined) ?? 'PROPJ00000';
    const n = parseInt(last.replace('PROPJ', ''), 10) || 0;
    id = 'PROPJ' + String(n + 1).padStart(5, '0');
  }

  const projectRow = {
    ...projectFields,
    id,
    incentive_fund: projectFields.incentive_fund ?? 0,
    distributed: !!projectFields.distributed,
    pl_completed: !!projectFields.pl_completed,
    fund_confirmed: !!projectFields.fund_confirmed,
    first_payment_completed: !!projectFields.first_payment_completed,
    first_payment_skipped: !!projectFields.first_payment_skipped,
    second_payment_completed: !!projectFields.second_payment_completed,
    second_payment_skipped: !!projectFields.second_payment_skipped,
  };

  const { error: insertErr } = await supabase.from('projects').insert(projectRow);
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message, stage: 'projects' }, { status: 500 });
  }

  if (incomingMembers.length > 0) {
    const rows = incomingMembers.map(m => ({
      project_id: id,
      member_name: m.member_name,
      employee_id: m.employee_id ?? null,
      is_team_account: !!m.is_team_account,
      contribution: m.contribution ?? 0,
      incentive_amount: m.incentive_amount ?? 0,
      first_amount: m.first_amount ?? 0,
      first_paid_at: m.first_paid_at ?? null,
      second_amount: m.second_amount ?? 0,
      second_paid_at: m.second_paid_at ?? null,
    }));
    const { error: memErr } = await supabase
      .from('project_members')
      .upsert(rows, { onConflict: 'project_id,member_name' });
    if (memErr) {
      return NextResponse.json(
        { error: memErr.message, stage: 'project_members' },
        { status: 500 }
      );
    }
  }

  // 감사 로그
  await logProjectChange(
    id,
    projectRow.campaign_name,
    'create',
    projectRow,
    {
      email: (session?.user as any)?.email ?? null,
      name: (session?.user as any)?.name ?? null,
    }
  );

  return NextResponse.json({ ok: true, id });
}
