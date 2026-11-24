// ─────────────────────────────────────────────────────────────
// POST /api/projects/[id]/committee-thread
//   body: { force?: boolean }
//   프로젝트 1건의 운영위원회 스레드를 생성 / 재생성한다.
//
//   · force 미지정 — 스레드가 없을 때만 생성 (이미 있으면 그대로 반환)
//   · force: true  — 기존 ts 를 비우고 채널에 새 스레드를 만든다.
//                    Slack 에서 스레드를 실수로 삭제한 경우의 복구 경로.
//                    ※ 삭제된 메시지를 되살리는 게 아니라 '새 스레드'를 여는 것이므로
//                      기존 스레드에 달려 있던 답글은 복구되지 않는다.
//
//   권한: canManageProjects (ADMIN)
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageProjects, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { ensureCommitteeThread } from '@/lib/committee-thread';

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
    // 기존 ts 제거 — ensureCommitteeThread 가 새로 만들도록
    const { error: clrErr } = await supabase
      .from('projects')
      .update({ committee_thread_ts: null, committee_thread_url: null })
      .eq('id', params.id);
    if (clrErr) {
      return NextResponse.json(
        { error: `기존 스레드 정보 초기화 실패: ${clrErr.message}` },
        { status: 500 }
      );
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
