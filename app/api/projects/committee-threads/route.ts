// ─────────────────────────────────────────────────────────────
// POST /api/projects/committee-threads
//   운영위원회 스레드 일괄 생성 (백필)
//
//   대상: 수주성공(WON) + 지급 단계가 'PL 작성대기' 또는 'PL 작성완료' + 스레드 없음
//     · 재원확정 이후 단계는 위원회가 끝난 건이라 스레드를 새로 열 의미가 없음
//     · 지급 회차가 하나라도 완료/미지급(skipped)으로 종결된 건도 제외.
//       skipped 는 '그 회차는 영영 지급되지 않음' 이라 단계상 지급이 끝난 것으로 본다
//       (예: 1·2차 모두 미지급 → 전체지급완료)
//     · committee_thread_ts 가 있는 건은 건너뜀 (중복 생성 방지)
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
// 건수만큼 Slack 호출이 순차로 일어나므로 여유 있게
export const maxDuration = 300;

/** Slack chat.postMessage 는 채널당 초당 1건 수준 — 연속 발송 시 간격을 둔다 */
const POST_INTERVAL_MS = 1200;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function POST() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageProjects(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();

  const { data: targets, error } = await supabase
    .from('projects')
    .select('id, campaign_name')
    .eq('acquisition_status', 'WON')
    .eq('fund_confirmed', false)
    .eq('first_payment_completed', false)
    .eq('first_payment_skipped', false)
    .eq('second_payment_completed', false)
    .eq('second_payment_skipped', false)
    .is('committee_thread_ts', null)
    .order('id');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = targets ?? [];
  const created: Array<{ id: string; campaign_name: string; url: string | null }> = [];
  const failed: Array<{ id: string; campaign_name: string; error: string }> = [];

  for (let i = 0; i < list.length; i++) {
    const p = list[i] as any;
    const r = await ensureCommitteeThread(supabase, p.id);
    if (r.ok) {
      created.push({ id: p.id, campaign_name: p.campaign_name, url: r.url ?? null });
    } else {
      failed.push({ id: p.id, campaign_name: p.campaign_name, error: r.error ?? 'unknown' });
    }
    // 마지막 건 뒤에는 대기하지 않음
    if (i < list.length - 1) await sleep(POST_INTERVAL_MS);
  }

  return NextResponse.json({
    ok: true,
    total: list.length,
    created: created.length,
    failed: failed.length,
    createdList: created,
    failedList: failed,
  });
}
