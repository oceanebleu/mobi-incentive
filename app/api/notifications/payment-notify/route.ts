// ─────────────────────────────────────────────────────────────
// POST /api/notifications/payment-notify
//   body: { projectId: string }
//   - 프로젝트의 PL 에게 '재원확정완료' 지급알림 Slack DM 발송
//   - 권한: canManageProjects (ADMIN)
//   - 서버 측 단계 가드: 프로젝트가 실제로 fund_confirmed=true 인지 확인
//   - PL 이메일은 users 테이블(name 매칭)에서 조회 → Slack 멘션
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageProjects, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { sendSlackDmByEmail, lookupSlackUserIdByEmail } from '@/lib/slack';
import { buildPaymentNotifyMessage } from '@/lib/payment-notification-message';

export const dynamic = 'force-dynamic';

const SUPPORT_CONTACT_EMAIL = process.env.SUPPORT_CONTACT_EMAIL ?? 'he_lee@mobidays.com';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageProjects(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const projectId: string = (body?.projectId ?? '').toString().trim();
  if (!projectId) {
    return NextResponse.json({ error: 'projectId가 필요합니다.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // 1) 프로젝트 — fund_confirmed 인지 확인 (UI 가드 우회 방지)
  const { data: project, error: pErr } = await supabase
    .from('projects')
    .select('id, campaign_name, pl, fund_confirmed')
    .eq('id', projectId)
    .maybeSingle();
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (!project.fund_confirmed) {
    return NextResponse.json(
      { error: '재원확정완료 상태의 프로젝트만 지급알림을 보낼 수 있습니다.' },
      { status: 400 }
    );
  }
  const plName: string = (project.pl ?? '').toString().trim();
  if (!plName) {
    return NextResponse.json(
      { error: 'PL 정보가 비어있어 발송할 수 없습니다.' },
      { status: 400 }
    );
  }

  // 2) PL 사용자 — name 으로 users 테이블 매칭 (재직자 한정)
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('employee_id, name, email, access_code, status')
    .eq('name', plName)
    .neq('status', '퇴사')
    .order('synced_at', { ascending: false })
    .limit(1);
  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }
  const plUser = users?.[0];
  if (!plUser) {
    return NextResponse.json(
      { error: `PL "${plName}" 의 사용자 정보를 찾을 수 없습니다. (사용자관리 시트 동기화 확인)` },
      { status: 404 }
    );
  }
  const email: string = (plUser.email ?? '').toString().trim();
  const employeeId: string = (plUser.employee_id ?? '').toString().trim();
  const accessCode: string = (plUser.access_code ?? '').toString().trim();
  if (!email) {
    return NextResponse.json(
      { error: `PL "${plName}" 의 이메일이 비어있습니다.` },
      { status: 400 }
    );
  }
  if (!accessCode) {
    return NextResponse.json(
      {
        error: `PL "${plName}" 의 고유코드가 비어있습니다. 사용자관리에서 고유코드 발급 후 다시 시도해 주세요.`,
      },
      { status: 400 }
    );
  }

  // 3) 문의 담당자(이홍은) Slack 멘션 — 룩업 실패해도 메시지 발송은 계속
  let supportMention: string | undefined;
  try {
    const supportId = await lookupSlackUserIdByEmail(SUPPORT_CONTACT_EMAIL);
    supportMention = `<@${supportId}>`;
  } catch {
    supportMention = undefined;
  }

  // 4) 메시지 생성 + Slack DM 발송
  const text = buildPaymentNotifyMessage({
    plName,
    campaignName: project.campaign_name,
    employeeId,
    accessCode,
    supportMention,
  });

  try {
    await sendSlackDmByEmail(email, text);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    return NextResponse.json(
      {
        error: `Slack 발송 실패: ${msg}`,
        hint: /users_not_found/.test(msg)
          ? '해당 이메일이 Slack 워크스페이스에 등록되어 있지 않거나, 봇이 워크스페이스에 설치되어 있지 않습니다.'
          : /missing_scope|not_allowed_token_type/.test(msg)
          ? '봇 권한(scope) 이 부족합니다. chat:write, users:read.email, im:write 가 필요합니다.'
          : undefined,
      },
      { status: 502 }
    );
  }

  // 발송 성공 시각 기록 — 프로젝트 관리에 "알림완료" 영구 표시
  //   컬럼이 마이그레이션 안 된 환경에서는 update 가 실패하지만 메시지 발송은 성공이므로 warn 후 계속.
  const sentAt = new Date().toISOString();
  try {
    const { error: updErr } = await supabase
      .from('projects')
      .update({ payment_notify_sent_at: sentAt })
      .eq('id', projectId);
    if (updErr) {
      console.warn('[payment-notify] payment_notify_sent_at 기록 실패:', updErr.message);
    }
  } catch (e: any) {
    console.warn('[payment-notify] payment_notify_sent_at 기록 예외:', e?.message ?? e);
  }

  return NextResponse.json({ ok: true, sentTo: email, sentAt });
}
