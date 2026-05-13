// ─────────────────────────────────────────────────────────────
// POST /api/proposal-archive/[id]/promote
// 제안 자료 아카이브 1건을 projects 테이블에 신규 row 로 생성 ('운영위로 보내기').
// 후속 작업(멤버 기여도 입력)은 프로젝트 관리 페이지에서 진행.
//
// 흐름
//   1) proposal_archive 에서 해당 id 조회
//   2) 이미 promoted_project_id 있으면 거부
//   3) PROPJ 자동 채번 + projects insert
//   4) proposal_archive 에 promoted_project_id / promoted_at / promoted_by_* 기록
//   5) 감사 로그 1건 (audit)
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageUsers, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { logProjectChange } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function mapAcquisitionStatus(biddingStatus: string | null): string | null {
  if (!biddingStatus) return null;
  const t = biddingStatus.replace(/\s/g, '');
  if (t.includes('수주성공')) return 'WON';
  if (t.includes('수주실패')) return 'LOST';
  if (t.includes('대행종료') || t.includes('대화종료') || t.includes('대행종결')) return 'CANCELLED';
  if (t.includes('결과대기') || t.includes('결과반영')) return 'RESULT_PENDING';
  if (t.includes('제안진행') || t.includes('검토대기') || t.includes('제안작성') || t.includes('제안대기')) return 'REVIEWING';
  return 'PENDING';
}

export async function POST(
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

  // 1) 원본 아카이브 row
  const { data: archive, error: getErr } = await supabase
    .from('proposal_archive')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (getErr) {
    return NextResponse.json({ error: getErr.message }, { status: 500 });
  }
  if (!archive) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if ((archive as any).promoted_project_id) {
    return NextResponse.json(
      { error: '이미 승격된 항목입니다.', promoted_project_id: (archive as any).promoted_project_id },
      { status: 409 }
    );
  }

  // 2) PROPJ id 자동 채번
  const { data: maxRow } = await supabase
    .from('projects')
    .select('id')
    .like('id', 'PROPJ%')
    .order('id', { ascending: false })
    .limit(1);
  const last = (maxRow?.[0]?.id as string | undefined) ?? 'PROPJ00000';
  const n = parseInt(last.replace('PROPJ', ''), 10) || 0;
  const newProjectId = 'PROPJ' + String(n + 1).padStart(5, '0');

  // 3) projects insert
  const teams: string[] = (archive as any).teams ?? [];
  const a = archive as any;
  const projectRow = {
    id: newProjectId,
    campaign_name: a.client_name,
    committee_sheet_link: a.workflow_folder ?? null,
    r_value: a.r_value ?? null,
    commission: a.commission ?? null,
    team: teams[0] ?? null,
    pl: a.pl ?? null,
    // 제출일 = 시트 I열 '비딩 제출일자' (building_due_at).
    //   I열이 비어있는 과거 행에 한해 H열(proposal_at)을 폴백으로 사용.
    submitted_at: a.building_due_at ?? a.proposal_at ?? null,
    distributed: false,
    distributed_at: null,
    acquisition_status: mapAcquisitionStatus(a.bidding_status) ?? 'PENDING',
    pl_completed: false,
    fund_confirmed: false,
    incentive_fund: 0,
    first_payment_date: null,
    first_payment_ratio: 60,
    first_payment_completed: false,
    first_payment_skipped: false,
    second_payment_date: null,
    second_payment_ratio: 40,
    second_payment_completed: false,
    second_payment_skipped: false,
    campaign_end_date: null,
    category: a.category ?? null,
    note: a.strategy_note ?? null,
    source_proposal_id: null,
  };

  const { error: insErr } = await supabase.from('projects').insert(projectRow);
  if (insErr) {
    return NextResponse.json(
      { error: `프로젝트 생성 실패: ${insErr.message}` },
      { status: 500 }
    );
  }

  // 4) archive 에 승격 메타 기록
  const changer = {
    email: (session?.user as any)?.email ?? null,
    name: (session?.user as any)?.name ?? null,
  };
  const { error: upErr } = await supabase
    .from('proposal_archive')
    .update({
      promoted_project_id: newProjectId,
      promoted_at: new Date().toISOString(),
      promoted_by_email: changer.email,
      promoted_by_name: changer.name,
    })
    .eq('id', id);
  if (upErr) {
    // 프로젝트는 만들어졌으나 메타 업데이트 실패 — 로그만 남기고 진행
    console.error('[promote] archive update failed:', upErr.message);
  }

  // 5) 감사 로그
  await logProjectChange(
    newProjectId,
    projectRow.campaign_name,
    'create',
    { ...projectRow, _source: 'proposal_archive', _archive_id: id },
    changer
  );

  return NextResponse.json({
    ok: true,
    project_id: newProjectId,
    campaign_name: projectRow.campaign_name,
  });
}
