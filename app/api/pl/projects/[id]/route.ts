// ─────────────────────────────────────────────────────────────
// GET  /api/pl/projects/[id]?emp=<employee_id>
// PUT  /api/pl/projects/[id]?emp=<employee_id>
//   PL 본인이 양식(멤버 기여도 + 9가지 판단 사유 + 위원회 구성) 조회/저장.
//   인증: 사번 → users.name === projects.pl 일 때만 허용.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { logProjectChange } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

// 사번 → { name } 조회 + 권한 검증 (projects.pl 이름과 매칭되는지)
async function authorize(empId: string, projectId: string) {
  const supabase = getSupabaseAdmin();

  const [userRes, projRes] = await Promise.all([
    supabase
      .from('users')
      .select('employee_id, name, status')
      .eq('employee_id', empId)
      .maybeSingle(),
    supabase
      .from('projects')
      .select('id, campaign_name, pl')
      .eq('id', projectId)
      .maybeSingle(),
  ]);
  if (userRes.error) return { error: userRes.error.message, status: 500 };
  if (!userRes.data) return { error: '사번을 찾을 수 없습니다.', status: 404 };
  if ((userRes.data as any).status === '퇴사') {
    return { error: '퇴사한 사용자 사번입니다.', status: 403 };
  }
  if (projRes.error) return { error: projRes.error.message, status: 500 };
  if (!projRes.data) return { error: '프로젝트를 찾을 수 없습니다.', status: 404 };

  const userName = (userRes.data as any).name as string;
  const plName = (projRes.data as any).pl as string | null;
  if (!plName || normalize(plName) !== normalize(userName)) {
    return {
      error: '이 프로젝트에 본인으로 배정되어 있지 않습니다.',
      status: 403,
    };
  }
  return {
    supabase,
    user: { employee_id: (userRes.data as any).employee_id, name: userName },
    project: projRes.data as any,
  } as const;
}

const FORM_FIELDS = [
  'profit_judgment',
  'commission_judgment',
  'client_importance',
  'rfp_route',
  'prep_effort',
  'bidding_difficulty',
  'proposal_resource',
  'external_expert',
  'stop_risk',
  'committee_division_head',
  'committee_co1',
] as const;

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url);
  const empId = (searchParams.get('emp') ?? '').trim();
  if (!empId) return NextResponse.json({ error: 'emp 필요' }, { status: 400 });

  const r = await authorize(empId, params.id);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const { supabase } = r;

  // 프로젝트 본체 + 멤버 + PL 양식
  const [projRes, memRes, formRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, campaign_name, submitted_at, r_value, commission, team, pl, category, pl_completed')
      .eq('id', params.id)
      .single(),
    supabase
      .from('project_members')
      .select('*')
      .eq('project_id', params.id)
      .order('contribution', { ascending: false }),
    supabase
      .from('project_pl_forms')
      .select('*')
      .eq('project_id', params.id)
      .maybeSingle(),
  ]);
  if (projRes.error) return NextResponse.json({ error: projRes.error.message }, { status: 500 });
  if (memRes.error) return NextResponse.json({ error: memRes.error.message }, { status: 500 });
  if (formRes.error) return NextResponse.json({ error: formRes.error.message }, { status: 500 });

  return NextResponse.json({
    project: projRes.data,
    members: memRes.data ?? [],
    form: formRes.data ?? null,
  });
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url);
  const empId = (searchParams.get('emp') ?? '').trim();
  if (!empId) return NextResponse.json({ error: 'emp 필요' }, { status: 400 });

  const r = await authorize(empId, params.id);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const { supabase, user, project } = r;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const members: any[] = Array.isArray(body?.members) ? body.members : [];
  const formInput = body?.form ?? {};

  // 1) project_members 통째 교체 — 관리자 모달과 동일 정책
  const { error: delErr } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', params.id);
  if (delErr) return NextResponse.json({ error: delErr.message, stage: 'members-delete' }, { status: 500 });

  if (members.length > 0) {
    const rows = members
      .map((m: any) => ({
        project_id: params.id,
        member_name: String(m?.member_name ?? '').trim(),
        is_team_account: !!m?.is_team_account,
        contribution: Number(m?.contribution) || 0,
        first_amount: Number(m?.first_amount) || 0,
        first_paid_at: m?.first_paid_at || null,
        second_amount: Number(m?.second_amount) || 0,
        second_paid_at: m?.second_paid_at || null,
      }))
      .filter(r => r.member_name !== '');
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('project_members').insert(rows);
      if (insErr) return NextResponse.json({ error: insErr.message, stage: 'members-insert' }, { status: 500 });
    }
  }

  // 2) project_pl_forms 업서트 — 9개 판단사유 + 위원회 구성
  const formRow: any = { project_id: params.id };
  for (const f of FORM_FIELDS) {
    const v = formInput?.[f];
    formRow[f] = typeof v === 'string' && v.trim() !== '' ? v : null;
  }
  // 작성 추적
  const now = new Date().toISOString();
  formRow.last_saved_at = now;
  formRow.last_saved_by_emp = user.employee_id;
  formRow.last_saved_by_name = user.name;

  // 처음 저장일 때만 submitted_at 설정
  const { data: existing } = await supabase
    .from('project_pl_forms')
    .select('submitted_at')
    .eq('project_id', params.id)
    .maybeSingle();
  if (!existing) formRow.submitted_at = now;

  const { error: formErr } = await supabase
    .from('project_pl_forms')
    .upsert(formRow, { onConflict: 'project_id' });
  if (formErr) return NextResponse.json({ error: formErr.message, stage: 'pl-form' }, { status: 500 });

  // 3) projects.pl_completed = true 로 자동 토글
  const { error: updErr } = await supabase
    .from('projects')
    .update({ pl_completed: true })
    .eq('id', params.id);
  if (updErr) return NextResponse.json({ error: updErr.message, stage: 'pl-completed' }, { status: 500 });

  // 4) 감사 로그 — PL 셀프 작성 추적
  await logProjectChange(
    params.id,
    project.campaign_name,
    'update',
    {
      _pl_form_saved: { by_emp: user.employee_id, by_name: user.name, member_count: members.length },
      pl_completed: { from: false, to: true },
    },
    { email: null, name: user.name }
  );

  return NextResponse.json({ ok: true });
}
