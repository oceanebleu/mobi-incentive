'use client';

// ─────────────────────────────────────────────────────────────
// /archive — 제안 자료 아카이브
// '수주인센티브 대상' 시트의 B열(대상여부)='대상' 행만 DB로 동기화하고,
// 운영위원회 대상으로 선정된 건은 [프로젝트 생성]으로 projects 테이블에 승격한다.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Search,
  X,
  AlertCircle,
  Archive,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  Inbox,
  FileSpreadsheet,
  Trash2,
} from 'lucide-react';
import clsx from 'clsx';

interface ArchiveRow {
  id: number;
  // '수주인센티브 대상' 시트 매핑
  opportunity_id: string | null;   // A 기회ID
  needs_committee: boolean;        // B 대상여부
  client_name: string;             // C 광고주명
  category: string | null;         // D 구분
  industry: string | null;         // E 산업군
  teams: string[] | null;          // F 담당팀
  pl: string | null;               // G PL명
  proposal_types: string[] | null; // I 제품
  proposal_at: string | null;      // K 제출일
  r_value: number | null;          // L 취급고 (R값)
  commission: number | null;       // M 수수료율
  expected_revenue: number | null; // N 영업수익
  bidding_status: string | null;   // Q 결과
  // 구 시트 잔존 데이터 (과거 행에만 값이 있음)
  building_due_at: string | null;
  agency: string | null;
  participants: string[] | null;
  promoted_project_id: string | null;
  promoted_at: string | null;
  promoted_by_email: string | null;
  promoted_by_name: string | null;
  marked_existing: boolean | null;
  marked_existing_at: string | null;
  marked_existing_by_email: string | null;
  marked_existing_by_name: string | null;
  synced_at: string;
  updated_at: string;
}

type Tab = 'PENDING' | 'PROMOTED' | 'LOST';

// 결과(Q열)가 종결 상태인지 — 수주실패 / 제안드랍. 시트 표기 변형 흡수 (공백 제거 후 substring)
const isLostStatus = (s: string | null | undefined) => {
  if (!s) return false;
  const t = s.replace(/\s/g, '');
  return t.includes('수주실패') || t.includes('제안드랍') || t.includes('드랍');
};

const withCommas = (n: number) => {
  const s = String(Math.round(n));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// 운영팀이 직접 편집하는 시트로 바로 이동시키는 외부 링크 ('수주인센티브 대상' 탭)
const ARCHIVE_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/17IBaYyBdfapzAUI9_QRFEaL-Tv75-ykPQ91DMnjMbwI/edit';

export default function ArchivePage() {
  const [items, setItems] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [markingId, setMarkingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastPromote, setLastPromote] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('PENDING');
  const [detail, setDetail] = useState<ArchiveRow | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/proposal-archive', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '조회 실패');
      setItems(json.items as ArchiveRow[]);
    } catch (e: any) {
      setError(e?.message ?? '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }

  async function sync() {
    if (syncing) return;
    setSyncing(true);
    setError(null);
    setLastSync(null);
    setLastPromote(null);
    try {
      const res = await fetch('/api/proposal-archive/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '동기화 실패');
      const stamp = new Date().toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = [`신규 ${json.new ?? 0}건 추가`, `갱신 ${json.updated ?? 0}건`];
      if (json.skippedExistingProject > 0) {
        parts.push(`이미 프로젝트로 관리 중인 ${json.skippedExistingProject}건 제외`);
      }
      setLastSync(`${stamp} · ${parts.join(' · ')}`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? '동기화 중 오류');
    } finally {
      setSyncing(false);
    }
  }

  async function promote(row: ArchiveRow) {
    if (row.promoted_project_id) return;
    if (
      !confirm(
        `[${row.client_name}] 건으로 프로젝트를 생성합니다.\n\n` +
          `생성 후 프로젝트 관리 페이지에서 멤버 기여도·지급 단계를 입력할 수 있습니다.`
      )
    )
      return;
    setPromotingId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/proposal-archive/${row.id}/promote`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '승격 실패');
      setLastPromote(`${json.campaign_name} → ${json.project_id} 등록 완료`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? '승격 중 오류');
    } finally {
      setPromotingId(null);
    }
  }

  async function setMarkExisting(row: ArchiveRow, value: boolean) {
    if (row.promoted_project_id) return; // promote 된 건은 수동 표시 불가
    const message = value
      ? `[${row.client_name}] 건을 '이미 생성됨'으로 표시할까요?\n` +
        `미등록 탭에서 사라지고, 등록 완료 탭에 [수동 표시됨] 으로 분류됩니다.\n` +
        `(언제든 해제 가능)`
      : `[${row.client_name}] 의 수동 '이미 생성됨' 표시를 해제할까요?\n미등록 탭으로 돌아갑니다.`;
    if (!confirm(message)) return;

    setMarkingId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/proposal-archive/${row.id}/mark-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '처리 실패');
      await load();
    } catch (e: any) {
      setError(e?.message ?? '처리 중 오류');
    } finally {
      setMarkingId(null);
    }
  }

  async function deleteRow(row: ArchiveRow) {
    const warn = row.promoted_project_id
      ? `[${row.client_name}] 아카이브 행을 삭제합니다.\n\n` +
        `⚠️ 이미 생성된 프로젝트(${row.promoted_project_id})는 삭제되지 않고, 아카이브 추적 행만 제거됩니다.\n` +
        `시트에 동일 광고주명이 남아있으면 다음 동기화 때 다시 생길 수 있습니다.\n\n계속할까요?`
      : `[${row.client_name}] 아카이브 행을 삭제합니다.\n\n` +
        `시트에 동일 광고주명이 남아있으면 다음 동기화 때 다시 생길 수 있습니다.\n` +
        `(광고주명이 바뀌어 중복으로 끌려온 stale 행 정리용)\n\n계속할까요?`;
    if (!confirm(warn)) return;
    setDeletingId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/proposal-archive/${row.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? '삭제 실패');
      await load();
    } catch (e: any) {
      setError(e?.message ?? '삭제 중 오류');
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // 가장 마지막에 동기화된 시각 — DB의 max(synced_at) (페이지 새로고침·로그인해도 유지)
  const latestSyncedAt = useMemo(() => {
    let max: string | null = null;
    for (const r of items) {
      if (r.synced_at && (!max || r.synced_at > max)) max = r.synced_at;
    }
    return max;
  }, [items]);
  const latestSyncedAtLabel = useMemo(() => {
    if (!latestSyncedAt) return null;
    return new Date(latestSyncedAt).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }, [latestSyncedAt]);

  // 등록 완료 = 정식 promote ∪ 수동 '이미 생성됨' 마크
  const isDone = (r: ArchiveRow) => !!r.promoted_project_id || r.marked_existing === true;
  // 행 카테고리(우선순위): 등록완료 > 수주실패 > 미등록
  //  · 운영위 시트 작성 요청 전에 이미 수주실패가 된 건은 별도 탭으로 분리
  //  · 운영위 등록(promote/수동표시) 후 시트에서 수주실패로 바뀐 경우는 등록완료 그대로 유지
  const tabOf = (r: ArchiveRow): Tab => {
    if (isDone(r)) return 'PROMOTED';
    if (isLostStatus(r.bidding_status)) return 'LOST';
    return 'PENDING';
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(r => {
      if (tabOf(r) !== tab) return false;
      if (!q) return true;
      const hay = [
        r.client_name,
        r.opportunity_id,
        r.industry,
        r.category,
        r.pl,
        (r.teams ?? []).join(' '),
        (r.proposal_types ?? []).join(' '),
        r.bidding_status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, tab]);

  const counts = useMemo(() => {
    let pending = 0;
    let promoted = 0;
    let markedExisting = 0;
    let lost = 0;
    for (const r of items) {
      const t = tabOf(r);
      if (t === 'PROMOTED') {
        if (r.promoted_project_id) promoted++;
        else markedExisting++;
      } else if (t === 'LOST') lost++;
      else pending++;
    }
    return {
      pending,
      promoted,
      markedExisting,
      lost,
      done: promoted + markedExisting,
      total: items.length,
    };
  }, [items]);

  return (
    <div className="p-8 space-y-6 fade-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">제안 자료 아카이브</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            제안 자료 아카이브 시트와 연동되어 있습니다
          </p>
          {latestSyncedAtLabel && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              최근 동기화 · {latestSyncedAtLabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={ARCHIVE_SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <FileSpreadsheet size={15} className="text-emerald-600" />
            아카이브 시트 열기
            <ExternalLink size={12} className="text-gray-400" />
          </a>
          <button
            onClick={sync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            <RefreshCw size={15} className={clsx(syncing && 'animate-spin')} />
            {syncing ? '동기화 중...' : '시트와 동기화'}
          </button>
        </div>
      </div>

      {/* 알림 */}
      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}
      {lastSync && !error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
          <Archive size={15} />
          동기화 완료 — {lastSync}
        </div>
      )}
      {lastPromote && !error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-emerald-700">
          <CheckCircle2 size={15} />
          {lastPromote}
        </div>
      )}

      {/* 통계 — 수동 표시는 '프로젝트로 등록됨'에 합산 */}
      <div className="grid grid-cols-4 gap-3">
        <Stat label="전체" value={counts.total} />
        <Stat label="미등록 (운영위 대상)" value={counts.pending} tone="blue" />
        <Stat
          label="프로젝트로 등록됨"
          value={counts.done}
          tone="emerald"
          sublabel={
            counts.markedExisting > 0
              ? `정식 ${counts.promoted} · 수동 표시 ${counts.markedExisting}`
              : undefined
          }
        />
        <Stat label="수주실패 · 제안드랍" value={counts.lost} tone="red" />
      </div>

      {/* 탭 */}
      <div className="flex items-end gap-1 border-b border-gray-200">
        <TabButton
          active={tab === 'PENDING'}
          onClick={() => setTab('PENDING')}
          label="미등록"
          hint="수주실패·드랍 제외, 아직 운영위 등록 전"
          count={counts.pending}
        />
        <TabButton
          active={tab === 'PROMOTED'}
          onClick={() => setTab('PROMOTED')}
          label="등록 완료"
          hint="정식 등록 + 수동 '이미 생성됨'"
          count={counts.done}
        />
        <TabButton
          active={tab === 'LOST'}
          onClick={() => setTab('LOST')}
          label="수주실패 · 드랍"
          hint="운영위 요청 전에 이미 종결된 건"
          count={counts.lost}
        />
      </div>

      {/* 필터 바 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="광고주, 기회ID, PL, 산업, 팀, 제품, 결과 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X size={13} className="text-gray-400" />
            </button>
          )}
        </div>
        <span className="ml-auto text-xs text-gray-400">{filtered.length}건</span>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {[
                  '광고주',
                  '구분',
                  '제품',
                  'PL',
                  '제출일',
                  'R값',
                  '수수료율',
                  '영업수익',
                  '결과',
                  '액션',
                ].map(h => (
                  <th
                    key={h}
                    className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-sm text-gray-400">
                    불러오는 중...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-16">
                    <Inbox size={28} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-400">
                      {items.length === 0
                        ? '아직 동기화된 데이터가 없습니다. 우측 상단 [시트와 동기화]를 눌러주세요.'
                        : tab === 'PENDING'
                        ? '운영위 대상 미등록 건이 없습니다.'
                        : tab === 'PROMOTED'
                        ? '아직 등록된 프로젝트가 없습니다.'
                        : '수주실패·제안드랍으로 분류된 건이 없습니다.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map(r => (
                  <tr
                    key={r.id}
                    className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors"
                  >
                    <td className="px-4 py-3 align-top">
                      <button
                        onClick={() => setDetail(r)}
                        className="font-medium text-gray-900 hover:text-blue-700 hover:underline underline-offset-2 text-left"
                      >
                        {r.client_name}
                      </button>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <CategoryBadge category={r.category} />
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-700">
                      {/* 'AEO/GEO' 가 1개 제품이므로 콤마로 연결 */}
                      {(r.proposal_types ?? []).join(', ') || '-'}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-700">
                      {r.pl ?? '-'}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-700 whitespace-nowrap">
                      {r.proposal_at ?? r.building_due_at ?? '-'}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-700 whitespace-nowrap">
                      {r.r_value != null ? `${withCommas(r.r_value)}원` : '-'}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-700 whitespace-nowrap">
                      {r.commission != null ? `${(r.commission * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-700 whitespace-nowrap">
                      {r.expected_revenue != null ? `${withCommas(r.expected_revenue)}원` : '-'}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <BiddingBadge status={r.bidding_status} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      {r.promoted_project_id ? (
                        <div className="text-xs">
                          <a
                            href={`/projects/${r.promoted_project_id}`}
                            className="inline-flex items-center gap-1 text-emerald-700 font-medium hover:underline"
                          >
                            <CheckCircle2 size={12} />
                            {r.promoted_project_id}
                          </a>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {r.promoted_by_name ?? r.promoted_by_email ?? ''}
                          </div>
                          <button
                            onClick={() => deleteRow(r)}
                            disabled={deletingId === r.id}
                            title="중복/오류로 끌려온 아카이브 행 제거 (생성된 프로젝트는 삭제되지 않음)"
                            className="mt-1 inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-600 underline-offset-2 hover:underline disabled:opacity-60"
                          >
                            <Trash2 size={10} />
                            {deletingId === r.id ? '삭제 중...' : '아카이브 행 삭제'}
                          </button>
                        </div>
                      ) : r.marked_existing ? (
                        <div className="text-xs">
                          <span className="inline-flex items-center gap-1 text-gray-600 font-medium">
                            <CheckCircle2 size={12} />
                            수동 표시됨
                          </span>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {r.marked_existing_by_name ?? r.marked_existing_by_email ?? ''}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <button
                              onClick={() => setMarkExisting(r, false)}
                              disabled={markingId === r.id || deletingId === r.id}
                              className="text-[10px] text-gray-400 hover:text-gray-700 underline-offset-2 hover:underline disabled:opacity-60"
                            >
                              {markingId === r.id ? '처리 중...' : '표시 해제'}
                            </button>
                            <button
                              onClick={() => deleteRow(r)}
                              disabled={markingId === r.id || deletingId === r.id}
                              title="중복/오류로 끌려온 아카이브 행 제거"
                              className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-600 underline-offset-2 hover:underline disabled:opacity-60"
                            >
                              <Trash2 size={10} />
                              {deletingId === r.id ? '삭제 중...' : '삭제'}
                            </button>
                          </div>
                        </div>
                      ) : isLostStatus(r.bidding_status) ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] text-gray-400">
                            진행 불필요 ({r.bidding_status ?? '종결'})
                          </span>
                          <button
                            onClick={() => deleteRow(r)}
                            disabled={deletingId === r.id}
                            title="중복/오류로 끌려온 아카이브 행 제거"
                            className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-600 underline-offset-2 hover:underline disabled:opacity-60"
                          >
                            <Trash2 size={10} />
                            {deletingId === r.id ? '삭제 중...' : '삭제'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => promote(r)}
                            disabled={promotingId === r.id || markingId === r.id || deletingId === r.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap"
                          >
                            <ArrowRight size={12} />
                            {promotingId === r.id ? '생성 중...' : '프로젝트 생성'}
                          </button>
                          <button
                            onClick={() => setMarkExisting(r, true)}
                            disabled={promotingId === r.id || markingId === r.id || deletingId === r.id}
                            title="다른 경로(직접입력·과거자료 등)로 이미 프로젝트화된 경우에만 사용"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-60 transition-colors whitespace-nowrap"
                          >
                            <CheckCircle2 size={12} />
                            {markingId === r.id ? '처리 중...' : '이미 생성됨'}
                          </button>
                          <button
                            onClick={() => deleteRow(r)}
                            disabled={promotingId === r.id || markingId === r.id || deletingId === r.id}
                            title="광고주명이 바뀌어 중복으로 끌려온 행 등을 아카이브에서 제거"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-100 rounded-md hover:bg-red-50 disabled:opacity-60 transition-colors whitespace-nowrap"
                          >
                            <Trash2 size={12} />
                            {deletingId === r.id ? '삭제 중...' : '삭제'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 상세 모달 */}
      {detail && <DetailModal row={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
  sublabel,
}: {
  label: string;
  value: number;
  tone?: 'default' | 'blue' | 'emerald' | 'gray' | 'red';
  sublabel?: string;
}) {
  const toneCls: Record<string, string> = {
    default: 'text-gray-900',
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    gray: 'text-gray-500',
    red: 'text-red-700',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className={clsx('text-lg font-bold mt-0.5', toneCls[tone])}>{value}</p>
      {sublabel && <p className="text-[10px] text-gray-400 mt-0.5">{sublabel}</p>}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  hint,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-4 py-2.5 -mb-px border-b-2 transition-colors flex items-center gap-2',
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-gray-500 hover:text-gray-800'
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span
        className={clsx(
          'text-[11px] px-1.5 py-0.5 rounded-full font-medium',
          active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
        )}
      >
        {count}
      </span>
      {hint && <span className="text-[10px] text-gray-400">· {hint}</span>}
    </button>
  );
}

// 결과(Q열) 배지 — 수주성공 / 제안드랍 / 수주실패 + 구 시트의 입찰상태 표기도 수용
function BiddingBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-gray-400">-</span>;
  const t = status.replace(/\s/g, '');
  let cls = 'bg-gray-100 text-gray-600';
  if (t.includes('수주성공')) cls = 'bg-emerald-100 text-emerald-700';
  else if (t.includes('수주실패')) cls = 'bg-red-100 text-red-700';
  else if (t.includes('드랍')) cls = 'bg-gray-200 text-gray-600';
  else if (t.includes('대행종료') || t.includes('대행종결') || t.includes('대화종료'))
    cls = 'bg-gray-200 text-gray-600';
  else if (t.includes('결과대기') || t.includes('결과반영')) cls = 'bg-blue-100 text-blue-700';
  else if (
    t.includes('제안진행') ||
    t.includes('검토대기') ||
    t.includes('제안작성') ||
    t.includes('제안대기')
  )
    cls = 'bg-blue-100 text-blue-700';
  return (
    <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap', cls)}>
      {status}
    </span>
  );
}

// 신규/연장/그 외 — 색상 구분 배지
function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return <span className="text-xs text-gray-400">-</span>;
  const t = category.replace(/\s/g, '');
  let cls = 'bg-gray-100 text-gray-600';
  if (t.includes('신규')) cls = 'bg-emerald-100 text-emerald-700';
  else if (t.includes('연장')) cls = 'bg-blue-100 text-blue-700';
  return (
    <span
      className={clsx(
        'inline-block text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap',
        cls
      )}
    >
      {category}
    </span>
  );
}

function DetailModal({ row, onClose }: { row: ArchiveRow; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{row.client_name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {[row.category, row.industry, ...(row.proposal_types ?? [])]
                .filter(Boolean)
                .join(' · ') || '-'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-sm">
          <Section title="기본 정보">
            <Field label="기회ID" value={row.opportunity_id} />
            <Field label="결과" value={row.bidding_status} />
            <Field label="구분" value={row.category} />
            <Field label="산업군" value={row.industry} />
            <Field label="담당팀" value={(row.teams ?? []).join(' / ') || null} />
            <Field label="PL" value={row.pl} />
            <Field label="제품" value={(row.proposal_types ?? []).join(', ') || null} />
            <Field label="제출일" value={row.proposal_at ?? row.building_due_at} />
          </Section>
          <Section title="규모">
            <Field
              label="R값 (취급고)"
              value={row.r_value != null ? `${withCommas(row.r_value)}원` : null}
            />
            <Field
              label="수수료율"
              value={row.commission != null ? `${(row.commission * 100).toFixed(2)}%` : null}
            />
            <Field
              label="영업수익 (수수료)"
              value={row.expected_revenue != null ? `${withCommas(row.expected_revenue)}원` : null}
            />
          </Section>
          {/* 구 '제안서.2025 Ver' 시트에서 넘어온 행에만 값이 있는 항목 */}
          {(row.agency || (row.participants ?? []).length > 0) && (
            <Section title="이전 시트 데이터">
              <Field label="대행사" value={row.agency} />
              <Field label="참여자" value={(row.participants ?? []).join(', ') || null} />
            </Section>
          )}
          {row.promoted_project_id && (
            <Section title="운영위 등록 정보">
              <Field label="프로젝트 ID" value={row.promoted_project_id} />
              <Field
                label="등록 시각"
                value={row.promoted_at ? new Date(row.promoted_at).toLocaleString('ko-KR') : null}
              />
              <Field
                label="등록자"
                value={row.promoted_by_name ?? row.promoted_by_email}
              />
            </Section>
          )}
          <div className="pt-2 text-[11px] text-gray-400">
            마지막 동기화 · {row.synced_at ? new Date(row.synced_at).toLocaleString('ko-KR') : '-'}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-gray-50/50 rounded-lg px-4 py-3">
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  return (
    <div className={clsx(multiline && 'col-span-2')}>
      <p className="text-[10px] text-gray-400 uppercase">{label}</p>
      <p
        className={clsx(
          'text-sm text-gray-800 mt-0.5',
          multiline && 'whitespace-pre-wrap break-words'
        )}
      >
        {value ?? '-'}
      </p>
    </div>
  );
}
