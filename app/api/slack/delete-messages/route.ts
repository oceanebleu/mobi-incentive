// ─────────────────────────────────────────────────────────────
// POST /api/slack/delete-messages
//   body: { links: string[] }
//   봇이 올린 Slack 메시지를 링크로 지정해 삭제한다.
//
//   · 봇 토큰은 '봇 자신이 올린 메시지' 만 지울 수 있다. 다른 사람이 쓴 메시지를
//     지정하면 Slack 이 cant_delete_message 로 거절하므로, 잘못 붙여넣어도
//     남의 메시지가 삭제될 수 없다.
//   · 스레드 루트를 지우면 그 스레드의 답글도 함께 사라진다 (Slack 동작).
//   · 프로젝트에 연결된 스레드를 지운 경우, 해당 프로젝트의 committee_thread_ts 도
//     함께 비워 '스레드가 있는 것처럼' 남지 않도록 한다.
//
//   권한: canManageProjects (ADMIN)
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageProjects, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { deleteSlackMessage, parseSlackLink } from '@/lib/slack';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageProjects(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const links: string[] = Array.isArray(body?.links)
    ? body.links.map((v: any) => String(v ?? '').trim()).filter(Boolean)
    : [];
  if (links.length === 0) {
    return NextResponse.json({ error: '삭제할 메시지 링크가 없습니다.' }, { status: 400 });
  }
  if (links.length > 50) {
    return NextResponse.json({ error: '한 번에 최대 50건까지 처리합니다.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const deleted: string[] = [];
  const failed: Array<{ link: string; error: string }> = [];

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const parsed = parseSlackLink(link);
    if (!parsed) {
      failed.push({ link, error: 'Slack 메시지 링크 형식이 아닙니다' });
      continue;
    }
    try {
      await deleteSlackMessage(parsed.channel, parsed.ts);
      deleted.push(link);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      // 이미 지워진 메시지는 결과 상태가 같으므로 성공으로 본다
      if (/message_not_found/.test(msg)) {
        deleted.push(link);
      } else {
        failed.push({
          link,
          error: /cant_delete_message/.test(msg)
            ? '봇이 올린 메시지가 아닙니다 (봇은 자기 메시지만 삭제 가능)'
            : msg,
        });
        if (i < links.length - 1) await sleep(300);
        continue;
      }
    }

    // 프로젝트에 연결된 스레드였다면 DB 기록도 정리
    try {
      await supabase
        .from('projects')
        .update({ committee_thread_ts: null, committee_thread_url: null })
        .eq('committee_thread_ts', parsed.ts);
    } catch (e: any) {
      console.warn('[slack-delete] 프로젝트 ts 정리 실패:', e?.message ?? e);
    }

    if (i < links.length - 1) await sleep(300);
  }

  return NextResponse.json({
    ok: true,
    total: links.length,
    deleted: deleted.length,
    failed: failed.length,
    failedList: failed,
  });
}
