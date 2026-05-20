// ─────────────────────────────────────────────────────────────
// POST /api/notifications/hrm-payroll-share
//   body: { year: number, month: number, totalAmount: number }
//
//   · 권한: canViewPayroll (ADMIN, PAYROLL)
//   · 동작:
//     1) payDate 는 서버가 canonical 하게 재계산 (payDateForMonth)
//     2) 수신자(안진형 primary, 김형규/안민혁 cc) 를 users 테이블에서
//        name → email 룩업, 다시 Slack lookupByEmail 로 user_id 얻어 멘션 생성
//     3) 매핑 실패한 수신자는 멘션에서 자연스럽게 빠지고 메시지는 발송 계속
//     4) buildHRMShareMessage 로 Slack mrkdwn 본문 생성 → 채널에 발송
//
//   환경변수:
//     · SLACK_BOT_TOKEN          — Slack Bot User OAuth Token
//     · HRM_NOTIFY_CHANNEL_ID    — 발송 대상 채널 ID (없으면 default = C06C1F7383B)
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canViewPayroll, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { sendSlackChannelMessage, lookupSlackUserIdByEmail } from '@/lib/slack';
import { buildHRMShareMessage } from '@/lib/hrm-payroll-message';
import { payDateForMonth } from '@/lib/payroll-date';

export const dynamic = 'force-dynamic';

const DEFAULT_CHANNEL_ID = 'C06C1F7383B';
// 수신자 — name 기준 users 테이블에서 매칭. 동명이인 시 status='재직' 1건 사용.
const PRIMARY_RECIPIENT_NAME = '안진형';
const CC_RECIPIENT_NAMES = ['김형규', '안민혁'];

/**
 * name 으로 users 테이블에서 재직자 이메일 조회.
 * 매칭 없으면 null (Slack 멘션 fallback 처리에 사용).
 */
async function findEmailByName(name: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('users')
    .select('email, status')
    .eq('name', name)
    .neq('status', '퇴사')
    .order('synced_at', { ascending: false })
    .limit(1);
  const email = data?.[0]?.email?.toString().trim();
  return email && email.length > 0 ? email : null;
}

/**
 * 이름 → Slack 멘션 (`<@U...>`).
 * users 테이블 매핑 실패 / Slack 매핑 실패 시 plain text `@이름` 으로 fallback.
 */
async function toMention(name: string): Promise<string> {
  const email = await findEmailByName(name);
  if (!email) return `@${name}`;
  try {
    const userId = await lookupSlackUserIdByEmail(email);
    return `<@${userId}>`;
  } catch {
    return `@${name}`;
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canViewPayroll(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // ─── 입력 검증 ───
  const body = await req.json().catch(() => ({} as any));
  const year = Number(body?.year);
  const month = Number(body?.month);
  const totalAmount = Number(body?.totalAmount);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: 'year 가 유효하지 않습니다.' }, { status: 400 });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'month 가 유효하지 않습니다.' }, { status: 400 });
  }
  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    return NextResponse.json({ error: 'totalAmount 가 유효하지 않습니다.' }, { status: 400 });
  }

  // ─── 지급일 — 서버가 canonical 계산 (클라이언트 입력 신뢰 안 함) ───
  const payDate = payDateForMonth(year, month);

  // ─── 수신자 멘션 매핑 ───
  const [primaryMention, ...ccMentions] = await Promise.all([
    toMention(PRIMARY_RECIPIENT_NAME),
    ...CC_RECIPIENT_NAMES.map(n => toMention(n)),
  ]);

  // ─── 메시지 생성 ───
  const text = buildHRMShareMessage({
    year,
    month,
    payDate,
    totalAmount,
    primaryMention,
    ccMentions,
  });

  // ─── 채널 발송 ───
  const channelId = process.env.HRM_NOTIFY_CHANNEL_ID ?? DEFAULT_CHANNEL_ID;
  try {
    await sendSlackChannelMessage(channelId, text);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    return NextResponse.json(
      {
        error: `Slack 발송 실패: ${msg}`,
        hint: /not_in_channel/.test(msg)
          ? `봇이 채널 ${channelId} 에 초대되어 있지 않습니다. 채널에서 '/invite @수주인센티브운영봇' 를 실행해 주세요.`
          : /channel_not_found/.test(msg)
          ? `채널 ID ${channelId} 를 찾을 수 없습니다. HRM_NOTIFY_CHANNEL_ID 환경변수를 확인해 주세요.`
          : /missing_scope|not_allowed_token_type/.test(msg)
          ? '봇 권한(scope) 이 부족합니다. chat:write 가 필요합니다.'
          : undefined,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    channel: channelId,
    payDate,
    sentAt: new Date().toISOString(),
  });
}
