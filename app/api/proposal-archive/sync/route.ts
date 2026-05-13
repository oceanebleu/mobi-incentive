// ─────────────────────────────────────────────────────────────
// POST /api/proposal-archive/sync
// '제안서.2025 Ver' 시트 → proposal_archive 테이블 동기화.
// 규칙:
//   - A열(needs_committee) = TRUE 인 행만 upsert
//   - 단, 입찰상태가 '수주실패'인 행은 운영위 대상에서 제외
//   - 또한 projects.campaign_name 에 이미 존재하는 광고주는 제외
//     (이미 프로젝트 관리로 진입한 건은 시트 동기화로 덮어쓰지 않음)
//   - 광고주(client_name) 기준 upsert. 같은 client_name이면 덮어쓰기.
//   - 시트에서 false로 바뀌었거나 사라진 행은 DB에서 자동 제거하지 않음
//     (이력 보존; UI에서 수동 삭제 가능하도록 별도 엔드포인트로)
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageUsers, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { fetchProposalArchive } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageUsers(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 1) 시트 fetch
  let allRows;
  try {
    allRows = await fetchProposalArchive();
  } catch (e: any) {
    return NextResponse.json(
      { error: `시트 조회 실패: ${e?.message ?? e}` },
      { status: 502 }
    );
  }

  // 2) A=TRUE 만 필터 + 수주실패 행 제외
  const aTrueRows = allRows.filter(r => r.needs_committee === true);
  const skippedFalse = allRows.length - aTrueRows.length;
  const isLost = (s: string | null) =>
    !!s && s.replace(/\s/g, '').includes('수주실패');
  const afterLost = aTrueRows.filter(r => !isLost(r.bidding_status));
  const skippedLost = aTrueRows.length - afterLost.length;

  const supabase = getSupabaseAdmin();

  // 3) projects.campaign_name 에 이미 있는 광고주는 동기화 후보에서 제외
  //    (이미 프로젝트로 관리 중인 건은 시트 → archive 덮어쓰기 차단)
  const { data: existingProjects } = await supabase
    .from('projects')
    .select('campaign_name');
  const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const existingProjectNames = new Set(
    (existingProjects ?? [])
      .map(p => (p as any).campaign_name as string | null)
      .filter((n): n is string => !!n && n.trim() !== '')
      .map(normalize)
  );
  const candidates = afterLost.filter(
    r => !existingProjectNames.has(normalize(r.client_name))
  );
  const skippedExistingProject = afterLost.length - candidates.length;

  // 4) client_name 중복 처리 — 같은 광고주가 시트에 2번 이상 나오면 마지막 행 채택
  const dedupedByName = new Map<string, typeof candidates[number]>();
  for (const c of candidates) {
    dedupedByName.set(c.client_name, c);
  }
  const toUpsert = Array.from(dedupedByName.values());

  // 5) 기존 row 와 비교 — 신규 vs 갱신 카운트
  const { data: existing } = await supabase
    .from('proposal_archive')
    .select('client_name');
  const existingNames = new Set((existing ?? []).map(r => (r as any).client_name as string));
  let newCount = 0;
  let updatedCount = 0;
  for (const r of toUpsert) {
    if (existingNames.has(r.client_name)) updatedCount++;
    else newCount++;
  }

  // 6) Upsert (client_name 기준)
  const now = new Date().toISOString();
  const rows = toUpsert.map(r => ({ ...r, synced_at: now }));

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('proposal_archive')
      .upsert(slice, { onConflict: 'client_name' });
    if (error) {
      return NextResponse.json(
        { error: `upsert 실패: ${error.message}`, processedChunk: i },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    fetched: allRows.length,
    skippedFalse,
    skippedLost,
    skippedExistingProject,
    deduped: candidates.length - toUpsert.length,
    new: newCount,
    updated: updatedCount,
  });
}
