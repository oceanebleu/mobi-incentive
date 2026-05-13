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
  const userEmp = (userRes.data as any).employee_id as string;
  const plName = (projRes.data as any).pl as string | null;
  let allowed = !!plName && normalize(plName) === normalize(userName);

  // Fallback ① — 본인이 이 프로젝트의 양식을 저장한 적이 있으면 권한 인정
  //   (PL이 양식에서 자기 이름을 살짝 다르게 수정해도 다시 들어올 수 있도록)
  if (!allowed) {
    const { data: priorForm } = await supabase
      .from('project_pl_forms')
      .select('last_saved_by_emp')
      .eq('project_id', projectId)
      .maybeSingle();
    if (priorForm && (priorForm as any).last_saved_by_emp === userEmp) {
      allowed = true;
    }
  }

  if (!allowed) {
    return {
      error: '이 프로젝트에 본인으로 배정되어 있지 않습니다.',
      status: 403,
    };
  }
  return {
    supabase,
    user: { employee_id: userEmp, name: userName },
    project: projRes.data as any,
  } as const;
}

// 의견 텍스트 필드 (자유 입력)
const FORM_TEXT_FIELDS = [
  'client_importance',
  'rfp_route',
  'prep_effort',
  'bidding_difficulty',
  'proposal_resource',
  'external_expert',
  'stop_risk',
  'budget_note',
] as const;

// 정형 케이스 필드 (smallint or text)
const FORM_CASE_INT_FIELDS = [
  'client_importance_case',
  'rfp_route_case',
  'prep_effort_case',
  'bidding_difficulty_case',
  'proposal_resource_case',
  'stop_risk_case',
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
    // fund_rate 컬럼이 없을 수 있는 환경 보호 — '*' select로 받아 누락 컬럼은 undefined 로 처리
    supabase
      .from('projects')
      .select('*')
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
        role: typeof m?.role === 'string' && m.role.trim() !== '' ? m.role.trim() : null,
        team_name:
          typeof m?.team_name === 'string' && m.team_name.trim() !== ''
            ? m.team_name.trim()
            : null,
        duty: typeof m?.duty === 'string' && m.duty.trim() !== '' ? m.duty : null,
      }))
      .filter(r => r.member_name !== '');
    if (rows.length > 0) {
      // 1차 시도 — 전체 컬럼 포함
      let { error: insErr } = await supabase.from('project_members').insert(rows);
      // 새 컬럼(role/team_name/duty)이 DB에 없으면 그 컬럼 빼고 재시도 (마이그레이션 미실행 환경 보호)
      if (insErr && /role|team_name|duty/.test(insErr.message ?? '')) {
        const stripped = rows.map(({ role, team_name, duty, ...rest }) => rest);
        const retry = await supabase.from('project_members').insert(stripped);
        insErr = retry.error;
      }
      if (insErr) {
        return NextResponse.json(
          {
            error: insErr.message,
            stage: 'members-insert',
            hint: 'project_members 테이블에 role/team_name/duty 컬럼을 추가하는 alter SQL이 필요합니다.',
          },
          { status: 500 }
        );
      }
    }
  }

  // 2) project_pl_forms 업서트 — 케이스 + 의견 + 메모 + (위원회 구성: 고정값)
  const formRow: any = { project_id: params.id };
  for (const f of FORM_TEXT_FIELDS) {
    const v = formInput?.[f];
    formRow[f] = typeof v === 'string' && v.trim() !== '' ? v : null;
  }
  for (const f of FORM_CASE_INT_FIELDS) {
    const v = formInput?.[f];
    const num = typeof v === 'number' ? v : v != null && v !== '' ? Number(v) : null;
    formRow[f] = Number.isFinite(num as number) ? (num as number) : null;
  }
  // 외부 전문가 케이스는 문자열 — '해당없음' | '해당됨'
  {
    const v = formInput?.external_expert_case;
    formRow.external_expert_case =
      typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  }
  // 위원회 구성 — 현재 정책상 고정값 (스키마는 향후 변경 대비 보존)
  formRow.committee_division_head = '이광수';
  formRow.committee_co1 = '안민혁';

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

  // 1차 시도 — 전체 컬럼 포함
  let { error: formErr } = await supabase
    .from('project_pl_forms')
    .upsert(formRow, { onConflict: 'project_id' });
  // 새 컬럼(*_case, budget_note) 미존재 환경 보호 — 누락된 컬럼만 빼고 재시도
  if (formErr) {
    const msg = formErr.message ?? '';
    const knownNewCols = [
      'budget_note',
      'client_importance_case',
      'rfp_route_case',
      'prep_effort_case',
      'bidding_difficulty_case',
      'proposal_resource_case',
      'external_expert_case',
      'stop_risk_case',
    ];
    const missing = knownNewCols.filter(c => msg.includes(c));
    if (missing.length > 0) {
      const stripped: any = { ...formRow };
      for (const c of missing) delete stripped[c];
      const retry = await supabase
        .from('project_pl_forms')
        .upsert(stripped, { onConflict: 'project_id' });
      formErr = retry.error;
    }
  }
  if (formErr) {
    return NextResponse.json(
      {
        error: formErr.message,
        stage: 'pl-form',
        hint: 'project_pl_forms 에 *_case / budget_note 컬럼을 추가하는 alter SQL이 필요합니다.',
      },
      { status: 500 }
    );
  }

  // 3) projects 업데이트 — PL 이름·일정·R값·수수료 동기화 + pl_completed=true
  //    PL이 양식에서 수정한 값이 진실의 원천.
  const projectsPatch: any = { pl_completed: true };

  // PL 이름 — 비어있지 않을 때만 반영
  if (typeof formInput?.pl_name === 'string' && formInput.pl_name.trim() !== '') {
    projectsPatch.pl = formInput.pl_name.trim();
  }
  // 수주 확정 일자 → first_payment_date / 캠페인 운영 종료 예상일 → second_payment_date
  //   빈 문자열 또는 null 이면 NULL 로 클리어
  if ('won_date' in (formInput ?? {})) {
    projectsPatch.first_payment_date = formInput.won_date || null;
  }
  if ('campaign_end_date' in (formInput ?? {})) {
    projectsPatch.second_payment_date = formInput.campaign_end_date || null;
  }
  // R값 — 숫자
  if (formInput?.r_value !== undefined && formInput.r_value !== null && formInput.r_value !== '') {
    const rv = Number(formInput.r_value);
    if (Number.isFinite(rv) && rv >= 0) projectsPatch.r_value = Math.round(rv);
  }
  // 수수료 (% → fraction)
  if (
    formInput?.commission_pct !== undefined &&
    formInput.commission_pct !== null &&
    formInput.commission_pct !== ''
  ) {
    const cp = Number(formInput.commission_pct);
    if (Number.isFinite(cp) && cp >= 0)
      projectsPatch.commission = Math.round(cp * 100) / 10000; // 5.25% → 0.0525
  }

  // 인센티브 재원 자동 계산 = R값 × 수수료 × fund_rate
  //   r_value/commission 은 위에서 갱신했거나 기존 값을 사용
  //   fund_rate 컬럼이 DB에 없을 수 있으니 안전하게 select (없으면 category로 fallback)
  let curR: number | null = null;
  let curC: number | null = null;
  let curFr: number | null = null;
  let curCat: string | null = null;
  {
    const sel = await supabase
      .from('projects')
      .select('r_value, commission, fund_rate, category')
      .eq('id', params.id)
      .maybeSingle();
    if (sel.error && /fund_rate/.test(sel.error.message ?? '')) {
      // fund_rate 컬럼 미존재 — 빼고 재시도
      const sel2 = await supabase
        .from('projects')
        .select('r_value, commission, category')
        .eq('id', params.id)
        .maybeSingle();
      curR = (sel2.data as any)?.r_value ?? null;
      curC = (sel2.data as any)?.commission ?? null;
      curCat = (sel2.data as any)?.category ?? null;
    } else {
      curR = (sel.data as any)?.r_value ?? null;
      curC = (sel.data as any)?.commission ?? null;
      curFr = (sel.data as any)?.fund_rate ?? null;
      curCat = (sel.data as any)?.category ?? null;
    }
  }
  const rvFinal = projectsPatch.r_value ?? curR;
  const cmFinal = projectsPatch.commission ?? curC;
  const frFinal = curFr ?? (curCat === '신규' ? 0.02 : 0.01);
  if (rvFinal != null && cmFinal != null && Number.isFinite(frFinal)) {
    projectsPatch.incentive_fund = Math.round(rvFinal * cmFinal * frFinal);
  }

  // 1차 시도 — 전체 patch
  let { error: updErr } = await supabase
    .from('projects')
    .update(projectsPatch)
    .eq('id', params.id);
  // 일부 컬럼이 DB에 없으면 안전한 최소집합(pl_completed만)으로라도 갱신해서
  // 다음 진입 시 '작성 완료' 로 분류되도록 보장
  if (updErr) {
    const retry = await supabase
      .from('projects')
      .update({ pl_completed: true })
      .eq('id', params.id);
    updErr = retry.error;
  }
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
