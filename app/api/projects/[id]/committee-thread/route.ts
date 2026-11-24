// ─────────────────────────────────────────────────────────────
// POST /api/projects/[id]/committee-thread
//   body: { force?: boolean }
//   프로젝트 1건의 운영위원회 스레드를 생성 / 재생성한다.
//
//   · force 미지정 — 스레드가 없을 때만 생성 (이미 있으면 그대로 반환)
//   · force: true  — 기존 스레드를 Slack 에서 지우고 채널에 새 스레드를 만든다.
//                    ※ 새 스레드를 여는 것이므로 기존 답글은 복구되지 않는다.
//
// DELETE /api/projects/[id]/committee-thread
//   스레드를 Slack 에서 삭제하고 DB 기록도 비운다 (잘못 올라간 스레드 정리용).
//   봇이 올린 메시지라 Slack UI 에서는 일반 멤버가 지울 수 없으므로 여기서 처리한다.
//
//   권한: canManageProjects (ADMIN)
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageProjects, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { ensureCommitteeThread, deleteCommitteeThread } from '@/lib/committee-thread';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageProjects(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const force = body?.force === true;

  const supabase = getSupabaseAdmin();

  const { data: project, error } = await supabase
    .from('projects')
    .select('id, campaign_name, committee_thread_ts')
    .eq('id', params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }

  const had = !!(project as any).committee_thread_ts;

  if (force && had) {
    // 기존 스레드를 Slack 에서 지우고 DB 도 비운다.
    //   Slack 삭제가 실패해도(이미 수동 삭제됨 등) DB 는 정리되므로 재생성은 진행한다.
    const del = await deleteCommitteeThread(supabase, params.id);
    if (!del.ok) {
      console.warn('[committee-thread] 재생성 중 기존 스레드 삭제 실패:', del.error);
    }
  }

  const r = await ensureCommitteeThread(supabase, params.id);
  if (!r.ok) {
    return NextResponse.json(
      {
        error: `스레드 생성 실패: ${r.error}`,
        hint: /not_in_channel/.test(r.error ?? '')
          ? '봇이 수주인센티브 채널에 초대되어 있지 않습니다. 채널에서 /invite 해주세요.'
          : undefined,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    recreated: force && had,
    url: r.url ?? null,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageProjects(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const r = await deleteCommitteeThread(supabase, params.id);
  if (!r.ok) {
    return NextResponse.json(
      {
        error: `스레드 삭제 실패: ${r.error}`,
        hint: /cant_delete_message|message_not_found/.test(r.error ?? '')
          ? '봇이 올린 메시지가 아니거나 이미 삭제된 메시지입니다.'
          : undefined,
      },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
