// ─────────────────────────────────────────────────────────────
// POST /api/import/commit
//
// preview에서 받은 parsed 데이터를 그대로 본문으로 받아 Supabase에 upsert.
// body: { proposals, projects, members }
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageUsers, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CHUNK = 200;

async function chunkedUpsert(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  rows: any[],
  conflictKey: string
): Promise<string | null> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from(table)
      .upsert(slice, { onConflict: conflictKey });
    if (error) {
      return `${table}: ${error.message} (chunk start=${i})`;
    }
  }
  return null;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageUsers(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const proposals = (body?.proposals ?? []) as any[];
  const projects = (body?.projects ?? []) as any[];
  const members = (body?.members ?? []) as any[];

  const supabase = getSupabaseAdmin();

  // 1) projects (먼저 — members가 FK 참조)
  if (projects.length > 0) {
    const rows = projects.map(p => ({
      id: p.id,
      campaign_name: p.campaign_name,
      committee_sheet_link: p.committee_sheet_link,
      r_value: p.r_value,
      commission: p.commission,
      team: p.team,
      pl: p.pl,
      submitted_at: p.submitted_at,
      distributed: p.distributed,
      distributed_at: p.distributed_at,
      acquisition_status: p.acquisition_status,
      pl_completed: p.pl_completed,
      fund_confirmed: p.fund_confirmed,
      incentive_fund: p.incentive_fund,
      first_payment_date: p.first_payment_date,
      first_payment_ratio: p.first_payment_ratio,
      first_payment_completed: p.first_payment_completed,
      second_payment_date: p.second_payment_date,
      second_payment_ratio: p.second_payment_ratio,
      second_payment_completed: p.second_payment_completed,
      campaign_end_date: p.campaign_end_date,
      category: p.category,
      note: p.note,
    }));
    const err = await chunkedUpsert(supabase, 'projects', rows, 'id');
    if (err) return NextResponse.json({ error: err, stage: 'projects' }, { status: 500 });
  }

  // 2) project_members — preview 결과의 project_id / employee_id / is_team_account 사용
  let memberSkipped = 0;
  if (members.length > 0) {
    const rows = members
      .filter(m => {
        if (!m.project_id) {
          memberSkipped++;
          return false;
        }
        return true;
      })
      .map(m => ({
        project_id: m.project_id,
        member_name: m.member_name,
        employee_id: m.employee_id,
        is_team_account: m.is_team_account,
        contribution: m.contribution,
        incentive_amount: m.incentive_amount,
        first_amount: m.first_amount,
        first_paid_at: m.first_paid_at,
        second_amount: m.second_amount,
        second_paid_at: m.second_paid_at,
      }));
    const err = await chunkedUpsert(supabase, 'project_members', rows, 'project_id,member_name');
    if (err) return NextResponse.json({ error: err, stage: 'project_members' }, { status: 500 });
  }

  // 3) proposals — proposals는 id가 bigserial이고 client_name + submitted_at 정도가 자연키
  //    중복 방지를 위해 (client_name, submitted_at) 매칭으로 upsert 흉내내기는 복잡하므로,
  //    단순히 insert만 하고, 기존 proposals 전체 삭제 후 재삽입 옵션은 별도 truncate 엔드포인트로.
  //    여기서는 그냥 insert (중복 호출 시 row가 늘어남 — 첫 import 용도)
  let proposalsInserted = 0;
  if (proposals.length > 0) {
    const rows = proposals.map(p => ({
      is_archived: p.is_archived,
      post_status: p.post_status,
      promote_to_project: p.promote_to_project,
      bidding_status: p.bidding_status,
      client_name: p.client_name,
      agency: p.agency,
      submitted_at: p.submitted_at,
      pt_at: p.pt_at,
      result_at: p.result_at,
      category: p.category,
      team: p.team,
      pl: p.pl,
      r_value: p.r_value,
      commission: p.commission,
      pre_review_marked: p.pre_review_marked,
      progress_note: p.progress_note,
    }));
    // 중복 방지: 같은 client_name + submitted_at 조합이 이미 있으면 스킵
    // (간단히 한 번에 처리하기 위해 client측에서 truncate 옵션 별도 권장)
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error, count } = await supabase
        .from('proposals')
        .insert(slice, { count: 'exact' });
      if (error) {
        return NextResponse.json(
          { error: `proposals: ${error.message}`, stage: 'proposals' },
          { status: 500 }
        );
      }
      proposalsInserted += count ?? slice.length;
    }
  }

  return NextResponse.json({
    ok: true,
    projects: projects.length,
    proposals: proposalsInserted,
    members: members.length - memberSkipped,
    memberSkipped,
  });
}
