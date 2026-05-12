// ─────────────────────────────────────────────────────────────
// /api/projects/[id]
//   PATCH  — 프로젝트 필드 부분 수정 (+ members 통째 교체 옵션)
//   DELETE — 프로젝트 삭제 (project_members 는 ON DELETE CASCADE)
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageUsers, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { logProjectChange, computeDiff } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// 수정 허용 필드 화이트리스트
const ALLOWED_FIELDS = new Set([
  'campaign_name',
  'committee_sheet_link',
  'r_value',
  'commission',
  'team',
  'pl',
  'submitted_at',
  'distributed',
  'distributed_at',
  'acquisition_status',
  'pl_completed',
  'fund_confirmed',
  'incentive_fund',
  'first_payment_date',
  'first_payment_ratio',
  'first_payment_completed',
  'first_payment_skipped',
  'second_payment_date',
  'second_payment_ratio',
  'second_payment_completed',
  'second_payment_skipped',
  'campaign_end_date',
  'category',
  'note',
]);

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageUsers(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const id = decodeURIComponent(params.id);
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({} as any));
  const replaceMembers: any[] | undefined = Array.isArray(body?.members)
    ? body.members
    : undefined;

  // 화이트리스트 필터링
  const patch: Record<string, any> = {};
  for (const k of Object.keys(body ?? {})) {
    if (ALLOWED_FIELDS.has(k)) patch[k] = body[k];
  }

  const supabase = getSupabaseAdmin();

  // 변경 전 스냅샷 (감사용 + campaign_name 라벨링용)
  const { data: beforeRow } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('projects').update(patch).eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message, stage: 'projects' }, { status: 500 });
    }
  }

  // members 가 전달되면 통째로 교체 (delete-all-then-upsert)
  if (replaceMembers) {
    const { error: delErr } = await supabase
      .from('project_members')
      .delete()
      .eq('project_id', id);
    if (delErr) {
      return NextResponse.json({ error: delErr.message, stage: 'members-delete' }, { status: 500 });
    }
    if (replaceMembers.length > 0) {
      const rows = replaceMembers.map(m => ({
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
      const { error: insErr } = await supabase.from('project_members').insert(rows);
      if (insErr) {
        return NextResponse.json(
          { error: insErr.message, stage: 'members-insert' },
          { status: 500 }
        );
      }
    }
  }

  // 감사 로그 — 변경된 필드만 (members 통째 교체는 별도 표기)
  if (beforeRow) {
    const diff: any = computeDiff(beforeRow, patch);
    if (replaceMembers) {
      diff._members_replaced = { count: replaceMembers.length };
    }
    if (Object.keys(diff).length > 0) {
      await logProjectChange(
        id,
        (beforeRow as any).campaign_name ?? '',
        'update',
        diff,
        {
          email: (session?.user as any)?.email ?? null,
          name: (session?.user as any)?.name ?? null,
        }
      );
    }
  }

  return NextResponse.json({ ok: true, id });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageUsers(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const id = decodeURIComponent(params.id);
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // 삭제 전 스냅샷 — 감사 로그에 풀 레코드 보존
  const { data: beforeRow } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  // project_members 는 ON DELETE CASCADE 로 자동 삭제됨
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (beforeRow) {
    await logProjectChange(
      id,
      (beforeRow as any).campaign_name ?? '',
      'delete',
      beforeRow,
      {
        email: (session?.user as any)?.email ?? null,
        name: (session?.user as any)?.name ?? null,
      }
    );
  }

  return NextResponse.json({ ok: true, id });
}
