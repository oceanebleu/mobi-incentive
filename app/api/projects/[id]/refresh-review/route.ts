// ─────────────────────────────────────────────────────────────
// POST /api/projects/[id]/refresh-review
//   관리자가 프로젝트 상세에서 [리뷰 동기화] 를 누르면 호출.
//   서버가 Apps Script Web App 프록시로 요청 → 프록시가 @mobidays.com 도메인 권한으로
//   PL이 등록한 시트를 열어 '09 결과 분석 (ALL)' C5 값을 반환 → projects.review_date 업데이트.
//
//   Apps Script Web App: bot@mobidays.com 계정으로 소유·배포됨.
//     · '나로 실행 (Execute as: Me)' + '접근: 모든 사용자'
//     · 시트가 mobidays 도메인 공유 상태라 봇 계정이 자동 접근 가능
//     · 요청 body 의 secret 으로 인증 (환경변수 REVIEW_SYNC_SECRET 과 일치해야 통과)
//
//   환경변수:
//     · REVIEW_APPS_SCRIPT_URL — Apps Script Web App URL
//     · REVIEW_SYNC_SECRET     — Apps Script 코드 안의 SHARED_SECRET 과 동일해야 함
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageProjects, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { normalizeYmd } from '@/lib/payroll-date';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageProjects(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const projectId = params.id;
  if (!projectId) {
    return NextResponse.json({ error: 'projectId 가 필요합니다.' }, { status: 400 });
  }

  const webAppUrl = process.env.REVIEW_APPS_SCRIPT_URL;
  const secret = process.env.REVIEW_SYNC_SECRET;
  if (!webAppUrl || !secret) {
    return NextResponse.json(
      { error: 'REVIEW_APPS_SCRIPT_URL / REVIEW_SYNC_SECRET 환경변수가 설정되어 있지 않습니다.' },
      { status: 500 }
    );
  }

  const supabase = getSupabaseAdmin();

  // 1) PL 이 등록한 비딩 준비 시트 URL 조회
  const { data: form, error: fErr } = await supabase
    .from('project_pl_forms')
    .select('bidding_review_sheet_link')
    .eq('project_id', projectId)
    .maybeSingle();
  if (fErr && !/bidding_review_sheet_link/.test(fErr.message ?? '')) {
    return NextResponse.json({ error: fErr.message }, { status: 500 });
  }
  const sheetUrl = (form as any)?.bidding_review_sheet_link?.toString().trim();
  if (!sheetUrl) {
    return NextResponse.json(
      { error: 'PL 이 비딩 준비 시트 링크를 아직 등록하지 않았습니다.' },
      { status: 400 }
    );
  }

  const syncedAt = new Date().toISOString();

  // 2) Apps Script Web App 호출 (프록시)
  //    Apps Script 는 항상 HTTP 200 을 반환하고 body 에 error 필드로 실패를 표현.
  //    Google 리다이렉트를 자동으로 따라가야 응답 body 가 온다.
  let asResp: Response;
  try {
    asResp = await fetch(webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        spreadsheet_url: sheetUrl,
      }),
      cache: 'no-store',
      redirect: 'follow',
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    await recordSyncError(supabase, projectId, syncedAt, `Apps Script 호출 실패: ${msg}`);
    return NextResponse.json(
      { ok: false, error: '시트 조회 실패', error_message: `Apps Script 호출 실패: ${msg}`, synced_at: syncedAt },
      { status: 200 }
    );
  }

  // 3) 응답 파싱
  let asJson: any;
  try {
    asJson = await asResp.json();
  } catch {
    const text = await asResp.text().catch(() => '');
    await recordSyncError(supabase, projectId, syncedAt, `Apps Script 응답 파싱 실패: ${text.slice(0, 300)}`);
    return NextResponse.json(
      {
        ok: false,
        error: '시트 조회 실패',
        error_message: 'Apps Script 응답 형식이 올바르지 않습니다.',
        synced_at: syncedAt,
      },
      { status: 200 }
    );
  }

  if (!asJson?.ok) {
    const msg = mapAppsScriptError(asJson?.error);
    await recordSyncError(supabase, projectId, syncedAt, msg);
    return NextResponse.json(
      { ok: false, error: '시트 조회 실패', error_message: msg, synced_at: syncedAt },
      { status: 200 }
    );
  }

  // 4) 성공 → review_date 갱신
  const reviewDate = normalizeYmd(asJson.raw_value ?? '');
  const { error: upErr } = await supabase
    .from('projects')
    .update({
      review_date: reviewDate,
      review_synced_at: syncedAt,
      review_sync_error: null,
    })
    .eq('id', projectId);
  if (upErr && /review_date|review_synced_at|review_sync_error/.test(upErr.message ?? '')) {
    return NextResponse.json(
      {
        error:
          'projects 테이블에 review_date / review_synced_at / review_sync_error 컬럼이 없습니다. schema 마이그레이션 필요.',
      },
      { status: 500 }
    );
  }
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    project_id: projectId,
    review_date: reviewDate,
    raw_value: asJson.raw_value,
    matched_sheet: asJson.sheet_name,
    synced_at: syncedAt,
  });
}

function mapAppsScriptError(code: string | undefined): string {
  switch (code) {
    case 'forbidden':
      return 'Apps Script secret 이 일치하지 않습니다. REVIEW_SYNC_SECRET 환경변수와 Apps Script 상단 SHARED_SECRET 이 같은 값인지 확인해 주세요.';
    case 'cannot_open_sheet':
      return '시트를 열 수 없습니다. URL 이 올바른지, 그리고 시트가 mobidays.com 도메인에 공유되어 있는지 확인해 주세요.';
    case 'target_sheet_not_found':
      return '「09 결과 분석 (ALL)」 탭을 찾을 수 없습니다. 탭 이름이 바뀌었는지 확인해 주세요.';
    case 'missing_url':
      return 'spreadsheet_url 이 누락되었습니다. (서버 버그)';
    case 'internal':
      return 'Apps Script 내부 오류가 발생했습니다.';
    default:
      return `Apps Script 오류: ${code ?? 'unknown'}`;
  }
}

async function recordSyncError(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  projectId: string,
  syncedAt: string,
  message: string
) {
  try {
    await supabase
      .from('projects')
      .update({ review_synced_at: syncedAt, review_sync_error: message })
      .eq('id', projectId);
  } catch {
    /* 무시 — 어차피 상위에서 error_message 반환 */
  }
}
