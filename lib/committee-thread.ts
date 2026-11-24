// ─────────────────────────────────────────────────────────────
// lib/committee-thread.ts
// 수주인센티브 Slack 채널의 '운영위원회 스레드' 관리
//
//   · 프로젝트당 루트 메시지 1개 (projects.committee_thread_ts 에 보관)
//   · 이후 알럿은 모두 그 스레드의 답글
//
// 설계 원칙 — 기존 DM 알림 로직을 절대 건드리지 않는다.
//   스레드 작업은 전부 "보조"이므로, 실패해도 호출부(프로젝트 생성·DM 발송)의
//   성공/실패에 영향을 주지 않는다. 모든 함수는 throw 하지 않고 결과를 반환한다.
// ─────────────────────────────────────────────────────────────

import {
  postSlackChannelMessage,
  postSlackThreadReply,
  getSlackPermalink,
  lookupSlackUserIdByEmail,
} from './slack';
import {
  buildCommitteeThreadRoot,
  mentionOrName,
} from './committee-thread-message';

/** 수주인센티브 채널 — 기본값은 운영 채널 ID, 환경변수로 교체 가능 */
export function committeeChannelId(): string {
  return (process.env.SLACK_COMMITTEE_CHANNEL_ID ?? 'C0CM7MD8MC0').trim();
}

export interface ThreadResult {
  ok: boolean;
  /** 스레드 루트 ts — 성공 시에만 */
  ts?: string;
  url?: string | null;
  /** 실패 사유 (호출부에서 응답에 참고용으로 실어줄 수 있음) */
  error?: string;
}

/**
 * PL 이름 → Slack 멘션 문자열.
 * users 테이블에서 이메일을 찾아 Slack user_id 로 변환. 실패하면 이름 그대로.
 */
export async function resolvePlMention(
  supabase: any,
  plName: string | null | undefined
): Promise<string> {
  const name = (plName ?? '').toString().trim();
  if (!name) return '-';
  try {
    const { data } = await supabase
      .from('users')
      .select('email, status, synced_at')
      .eq('name', name)
      .neq('status', '퇴사')
      .order('synced_at', { ascending: false })
      .limit(1);
    const email = (data?.[0]?.email ?? '').toString().trim();
    if (!email) return name;
    const id = await lookupSlackUserIdByEmail(email);
    return mentionOrName(id, name);
  } catch {
    return name;
  }
}

/**
 * 운영위원회 스레드 보장 — 없으면 만들고, 이미 있으면 그대로 반환.
 *   프로젝트 생성 직후 호출. 이미 ts 가 있으면 Slack 호출 없이 바로 반환하므로
 *   여러 번 불려도 스레드가 중복 생성되지 않는다.
 */
export async function ensureCommitteeThread(
  supabase: any,
  projectId: string
): Promise<ThreadResult> {
  try {
    const { data: project, error } = await supabase
      .from('projects')
      .select('id, campaign_name, pl, category, product, committee_thread_ts, committee_thread_url')
      .eq('id', projectId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!project) return { ok: false, error: 'project not found' };

    // 이미 생성됨 — 중복 방지
    if (project.committee_thread_ts) {
      return { ok: true, ts: project.committee_thread_ts, url: project.committee_thread_url };
    }

    const channel = committeeChannelId();
    const plMention = await resolvePlMention(supabase, project.pl);
    const text = buildCommitteeThreadRoot({
      projectId: project.id,
      campaignName: project.campaign_name,
      plMention,
      category: project.category,
      product: project.product,
    });

    const { ts } = await postSlackChannelMessage(channel, text);
    const url = await getSlackPermalink(channel, ts);

    // 컬럼 미생성 환경(=마이그레이션 SQL 미실행)에서도 메시지는 이미 올라갔으므로
    // 기록 실패는 로그만 남기고 성공으로 처리한다.
    const { error: updErr } = await supabase
      .from('projects')
      .update({ committee_thread_ts: ts, committee_thread_url: url })
      .eq('id', projectId);
    if (updErr) {
      console.warn('[committee-thread] ts 기록 실패:', updErr.message);
    }

    return { ok: true, ts, url };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.warn('[committee-thread] 스레드 생성 실패:', msg);
    return { ok: false, error: msg };
  }
}

/**
 * 스레드에 답글. 스레드가 아직 없으면 먼저 만들어서 붙인다
 * (기존 프로젝트처럼 스레드 없이 생성된 건도 알럿을 놓치지 않도록).
 */
export async function replyToCommitteeThread(
  supabase: any,
  projectId: string,
  text: string
): Promise<ThreadResult> {
  try {
    const thread = await ensureCommitteeThread(supabase, projectId);
    if (!thread.ok || !thread.ts) return thread;
    await postSlackThreadReply(committeeChannelId(), thread.ts, text);
    return thread;
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.warn('[committee-thread] 답글 실패:', msg);
    return { ok: false, error: msg };
  }
}
