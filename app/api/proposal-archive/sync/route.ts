// ─────────────────────────────────────────────────────────────
// POST /api/proposal-archive/sync
// '수주인센티브 대상' 시트 → proposal_archive 테이블 동기화.
// 규칙:
//   - B열(대상여부) = '대상' 인 행만 upsert (수주실패/제안드랍 포함 — UI에서 별도 탭으로 분리)
//   - 이미 프로젝트 관리로 진입한 건은 제외 (시트 → archive 덮어쓰기 차단).
//     단 광고주명이 같아도 I열 '제품'이 다르면 별개 건으로 보고 둘 다 가져온다.
//   - A열 기회ID(opportunity_id) 기준 upsert. 같은 기회ID면 덮어쓰기.
//   - 시트에서 '비대상'으로 바뀌었거나 사라진 행은 DB에서 자동 제거하지 않음
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

// 결과(Q열)가 종결 상태 — 수주실패 / 제안드랍
const isClosed = (s: string | null) => {
  if (!s) return false;
  const t = s.replace(/\s/g, '');
  return t.includes('수주실패') || t.includes('제안드랍') || t.includes('드랍');
};

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

  // 2) B='대상' 만 필터 (수주실패/제안드랍도 포함 — UI에서 별도 탭으로 노출)
  const aTrueRows = allRows.filter(r => r.needs_committee === true);
  const skippedFalse = allRows.length - aTrueRows.length;
  const lostCount = aTrueRows.filter(r => isClosed(r.bidding_status)).length;

  const supabase = getSupabaseAdmin();

  // 3) 이미 프로젝트로 관리 중인 건은 동기화 후보에서 제외.
  //    단, 광고주명이 같아도 '제품'(I열) 이 다르면 별개 건이므로 둘 다 가져온다.
  //    제품 비교 기준:
  //      · 아카이브를 통해 프로젝트화된 건(승격 / '이미 생성됨' 수동표시)은
  //        아카이브 행에 제품이 남아있으므로 (광고주명 + 제품) 조합으로 정확히 판정
  //      · 그 외 경로(CSV 임포트·직접입력 등)로 만들어진 프로젝트는 제품을 알 수 없으므로
  //        기존과 동일하게 광고주명 단위로 차단
  const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  // 제품 비교 키 — 순서/표기 차이 흡수 (['옥외광고','퍼포먼스'] 와 ['퍼포먼스','옥외광고'] 동일 취급)
  const productKey = (types: string[] | null | undefined) =>
    (types ?? []).map(normalize).filter(Boolean).sort().join('|');

  const { data: existingProjects } = await supabase
    .from('projects')
    .select('campaign_name');
  const projectNames = new Set(
    (existingProjects ?? [])
      .map(p => (p as any).campaign_name as string | null)
      .filter((n): n is string => !!n && n.trim() !== '')
      .map(normalize)
  );

  // 광고주명 → 이미 프로젝트화된 제품 조합 집합
  const { data: trackedRows } = await supabase
    .from('proposal_archive')
    .select('client_name, proposal_types, promoted_project_id, marked_existing');
  const takenProducts = new Map<string, Set<string>>();
  for (const t of trackedRows ?? []) {
    const row = t as any;
    if (!row.promoted_project_id && row.marked_existing !== true) continue;
    const name = normalize(String(row.client_name ?? ''));
    if (!name) continue;
    if (!takenProducts.has(name)) takenProducts.set(name, new Set());
    takenProducts.get(name)!.add(productKey(row.proposal_types));
  }

  const candidates = aTrueRows.filter(r => {
    const name = normalize(r.client_name);
    const taken = takenProducts.get(name);
    if (taken) {
      // 같은 광고주라도 제품이 다르면 별개 건 — 통과
      return !taken.has(productKey(r.proposal_types));
    }
    // 제품을 알 수 없는 프로젝트가 같은 광고주명으로 존재하면 기존대로 차단
    return !projectNames.has(name);
  });
  const skippedExistingProject = aTrueRows.length - candidates.length;

  // 4) 기회ID 중복 처리 — 같은 기회ID가 시트에 2번 이상 나오면 마지막 행 채택
  const dedupedById = new Map<string, typeof candidates[number]>();
  for (const c of candidates) {
    dedupedById.set(c.opportunity_id, c);
  }
  const toUpsert = Array.from(dedupedById.values());

  // 5) 기존 row 와 비교 — 신규 vs 갱신 카운트
  const { data: existing } = await supabase
    .from('proposal_archive')
    .select('opportunity_id');
  const existingIds = new Set(
    (existing ?? [])
      .map(r => (r as any).opportunity_id as string | null)
      .filter((v): v is string => !!v)
  );
  let newCount = 0;
  let updatedCount = 0;
  for (const r of toUpsert) {
    if (existingIds.has(r.opportunity_id)) updatedCount++;
    else newCount++;
  }

  // 6) Upsert (opportunity_id 기준)
  const now = new Date().toISOString();
  const rows = toUpsert.map(r => ({ ...r, synced_at: now }));

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('proposal_archive')
      .upsert(slice, { onConflict: 'opportunity_id' });
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
    skippedFalse,          // B='비대상'
    skippedExistingProject, // 이미 프로젝트로 관리 중 (광고주명 + 제품 일치) 이라 제외
    lostCount,             // 수주실패 / 제안드랍
    deduped: candidates.length - toUpsert.length,
    new: newCount,
    updated: updatedCount,
  });
}
