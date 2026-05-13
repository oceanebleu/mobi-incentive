'use client';

// ─────────────────────────────────────────────────────────────
// /archive — 제안 자료 아카이브
// '제안서.2025 Ver' 시트의 A열 TRUE 행만 DB로 동기화하고,
// 운영위원회 대상으로 선정된 건은 [운영위로 보내기]로 projects 테이블에 승격한다.
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
} from 'lucide-react';
import clsx from 'clsx';

interface ArchiveRow {
  id: number;
  needs_committee: boolean;
  bidding_status: string | null;
  category: string | null;
  industry: string | null;
  proposal_types: string[] | null;
  client_name: string;
  workflow_note: string | null;
  proposal_at: string | null;
  building_due_at: string | null;
  pt_at: string | null;
  result_at: string | null;
  agency: string | null;
  pl: string | null;
  teams: string[] | null;
  participants: string[] | null;
  r_value: number | null;
  commission: number | null;
  region: string | null;
  kpis: string[] | null;
  kpi_detail: string | null;
  media_scope: string[] | null;
  workflow_folder: string | null;
  ppt_url: string | null;
  pdf_url: string | null;
  presentation_url: string | null;
  factbook_folder: string | null;
  rfp_folder: string | null;
  mix_folder: string | null;
  expected_revenue: number | null;
  pre_review_marked: boolean | null;
  strategy_note: string | null;
  planning_note: string | null;
  coaching_done: boolean | null;
  coaching_at: string | null;
  coaching_note: string | null;
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

// 입찰상태가 수주실패인지 — 시트 표기 변형 흡수 (공백 제거 후 substring)
const isLostStatus = (s: string | null | undefined) =>
  !!s && s.replace(/\s/g, '').includes('수주실패');

const withCommas = (n: number) => {
  const s = String(Math.round(n));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// 운영팀이 직접 편집하는 시트로 바로 이동시키는 외부 링크
const ARCHIVE_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1LscohDN8Di-RRz1UJyjFx7xVmgbJrPc6cgD8iQW7Fp8/edit';

export default function ArchivePage() {
  const [items, setItems] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [markingId, setMarkingId] = useState<number | null>(null);
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
      setLastSync(`${stamp} · 신규 ${json.new ?? 0}건 추가`);
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

  useEffect(() => {
    load();
  }, []);

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
        r.industry,
        r.category,
        r.pl,
        r.agency,
        (r.teams ?? []).join(' '),
        (r.participants ?? []).join(' '),
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
        <Stat label="미등록 (운영위 대상)" value={counts.pending} tone="amber" />
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
        <Stat label="수주실패" value={counts.lost} tone="red" />
      </div>

      {/* 탭 */}
      <div className="flex items-end gap-1 border-b border-gray-200">
        <TabButton
          active={tab === 'PENDING'}
          onClick={() => setTab('PENDING')}
          label="미등록"
          hint="수주실패 제외, 아직 운영위 등록 전"
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
          label="수주실패"
          hint="운영위 요청 전에 이미 실패된 건"
          count={counts.lost}
        />
      </div>

      {/* 필터 바 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="광고주, PL, 산업, 팀, 입찰상태 검색..."
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
                  '산업',
                  '팀',
                  'PL',
                  '제출일',
                  'R값',
                  '수수료',
                  '입찰상태',
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
                        : '수주실패로 분류된 건이 없습니다.'}
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
                      {r.industry ?? '-'}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-700">
                      {(r.teams ?? []).join(' / ') || '-'}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-700">
                      {r.pl ?? '-'}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-700 whitespace-nowrap">
                      {r.building_due_at ?? '-'}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-700 whitespace-nowrap">
                      {r.r_value != null ? `${withCommas(r.r_value)}원` : '-'}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-700 whitespace-nowrap">
                      {r.commission != null ? `${(r.commission * 100).toFixed(1)}%` : '-'}
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
                          <button
                            onClick={() => setMarkExisting(r, false)}
                            disabled={markingId === r.id}
                            className="mt-1 text-[10px] text-gray-400 hover:text-gray-700 underline-offset-2 hover:underline disabled:opacity-60"
                          >
                            {markingId === r.id ? '처리 중...' : '표시 해제'}
                          </button>
                        </div>
                      ) : isLostStatus(r.bidding_status) ? (
                        <span className="text-[11px] text-gray-400">진행 불필요 (수주실패)</span>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => promote(r)}
                            disabled={promotingId === r.id || markingId === r.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap"
                          >
                            <ArrowRight size={12} />
                            {promotingId === r.id ? '생성 중...' : '프로젝트 생성'}
                          </button>
                          <button
                            onClick={() => setMarkExisting(r, true)}
                            disabled={promotingId === r.id || markingId === r.id}
                            title="다른 경로(직접입력·과거자료 등)로 이미 프로젝트화된 경우에만 사용"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-60 transition-colors whitespace-nowrap"
                          >
                            <CheckCircle2 size={12} />
                            {markingId === r.id ? '처리 중...' : '이미 생성됨'}
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
  tone?: 'default' | 'amber' | 'emerald' | 'gray' | 'red';
  sublabel?: string;
}) {
  const toneCls: Record<string, string> = {
    default: 'text-gray-900',
    amber: 'text-amber-700',
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

function BiddingBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-gray-400">-</span>;
  const t = status.replace(/\s/g, '');
  let cls = 'bg-gray-100 text-gray-600';
  if (t.includes('수주성공')) cls = 'bg-emerald-100 text-emerald-700';
  else if (t.includes('수주실패')) cls = 'bg-red-100 text-red-700';
  else if (t.includes('대행종료') || t.includes('대행종결') || t.includes('대화종료'))
    cls = 'bg-gray-200 text-gray-600';
  else if (t.includes('결과대기') || t.includes('결과반영')) cls = 'bg-amber-100 text-amber-700';
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
            <Field label="입찰 상태" value={row.bidding_status} />
            <Field label="대행사" value={row.agency} />
            <Field label="PL" value={row.pl} />
            <Field label="팀" value={(row.teams ?? []).join(' / ') || null} />
            <Field label="참여자" value={(row.participants ?? []).join(', ') || null} />
            <Field label="지역" value={row.region} />
          </Section>
          <Section title="일정">
            <Field label="제안일" value={row.proposal_at} />
            <Field label="빌딩 마감" value={row.building_due_at} />
            <Field label="PT일" value={row.pt_at} />
            <Field label="결과일" value={row.result_at} />
          </Section>
          <Section title="규모">
            <Field
              label="R값"
              value={row.r_value != null ? `${withCommas(row.r_value)}원` : null}
            />
            <Field
              label="예상 매출"
              value={row.expected_revenue != null ? `${withCommas(row.expected_revenue)}원` : null}
            />
            <Field
              label="수수료"
              value={row.commission != null ? `${(row.commission * 100).toFixed(2)}%` : null}
            />
          </Section>
          <Section title="KPI / 매체">
            <Field label="KPI" value={(row.kpis ?? []).join(', ') || null} />
            <Field label="KPI 상세" value={row.kpi_detail} multiline />
            <Field label="매체 범위" value={(row.media_scope ?? []).join(', ') || null} />
          </Section>
          <Section title="자료 링크">
            <LinkField label="워크플로 폴더" url={row.workflow_folder} />
            <LinkField label="PPT" url={row.ppt_url} />
            <LinkField label="PDF" url={row.pdf_url} />
            <LinkField label="발표자료" url={row.presentation_url} />
            <LinkField label="팩트북" url={row.factbook_folder} />
            <LinkField label="RFP" url={row.rfp_folder} />
            <LinkField label="믹스" url={row.mix_folder} />
          </Section>
          <Section title="코칭 / 메모">
            <Field label="사전 리뷰" value={row.pre_review_marked == null ? null : row.pre_review_marked ? 'O' : 'X'} />
            <Field label="코칭 완료" value={row.coaching_done == null ? null : row.coaching_done ? 'O' : 'X'} />
            <Field label="코칭 일시" value={row.coaching_at} />
            <Field label="코칭 메모" value={row.coaching_note} multiline />
            <Field label="전략 메모" value={row.strategy_note} multiline />
            <Field label="기획 메모" value={row.planning_note} multiline />
            <Field label="워크플로 메모" value={row.workflow_note} multiline />
          </Section>
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

function LinkField({ label, url }: { label: string; url: string | null }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase">{label}</p>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline truncate max-w-full"
        >
          <ExternalLink size={11} />
          <span className="truncate">{url}</span>
        </a>
      ) : (
        <p className="text-sm text-gray-400 mt-0.5">-</p>
      )}
    </div>
  );
}
