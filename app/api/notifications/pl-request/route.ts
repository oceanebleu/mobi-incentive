// ─────────────────────────────────────────────────────────────
// POST /api/notifications/pl-request
//   body: { projectId: string }
//   - 프로젝트의 PL 에게 작성요청 Slack DM 발송
//   - 권한: canManageProjects (ADMIN)
//   - PL 이메일은 users 테이블(name 매칭)에서 조회
//   - Slack 매핑 실패 / 사번·코드 누락 시 명확한 에러 반환
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageProjects, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { sendSlackDmByEmail } from '@/lib/slack';
import { buildPLRequestMessage } from '@/lib/pl-request-message';

export const dynamic = 'force-dynamic';

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

  // 1) 프로젝트 — PL 이름과 캠페인명
  const { data: project, error: pErr } = await supabase
    .from('projects')
    .select('id, campaign_name, pl')
    .eq('id', projectId)
    .maybeSingle();
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  const plName: string = (project.pl ?? '').toString().trim();
  if (!plName) {
    return NextResponse.json(
      { error: 'PL 정보가 비어있어 발송할 수 없습니다.' },
      { status: 400 }
    );
  }

  // 2) PL 사용자 — name 으로 users 테이블 매칭 (재직자 한정)
  //    동명이인 가능성 — 가장 최근 동기화된 1건 사용
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

  // 3) 메시지 생성 + Slack DM 발송
  const text = buildPLRequestMessage({
    plName,
    campaignName: project.campaign_name,
    employeeId,
    accessCode,
  });

  try {
    await sendSlackDmByEmail(email, text);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    // users_not_found — Slack 워크스페이스에 동일 이메일 사용자가 없는 경우가 대표 케이스
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

  return NextResponse.json({ ok: true, sentTo: email });
}
