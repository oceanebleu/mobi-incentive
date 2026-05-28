'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  Search,
  X,
  ExternalLink,
  Loader2,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  BellRing,
  CheckCircle2,
} from 'lucide-react';
import clsx from 'clsx';
import { formatKRWFull, formatCommission, formatDate } from '@/lib/utils';
import {
  useIncentiveData,
  paymentStageOf,
  PAYMENT_STAGE_LABEL,
  ACQUISITION_LABEL,
  type PaymentStage,
  type SupabaseProject,
} from '@/lib/incentive-data';
import { canManageProjects, type UserRole } from '@/lib/roles';
import ProjectEditModal from '@/components/projects/ProjectEditModal';

// '진행중'(PENDING) 은 의미가 모호하여 UI 필터 옵션에서 제외 — 데이터는 그대로 유지
const ACQ_OPTIONS = ['WON', 'LOST', 'CANCELLED', 'REVIEWING', 'RESULT_PENDING'] as const;
type AcqFilter = (typeof ACQ_OPTIONS)[number] | 'ALL';
type StageFilter = PaymentStage | 'ALL';

export default function ProjectsPage() {
  const { projects, loading, error, refresh } = useIncentiveData();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as UserRole | undefined;
  const canEdit = canManageProjects(role);

  const [activeTab, setActiveTab] = useState<'WON' | 'ALL'>('WON');
  const [search, setSearch] = useState('');
  const [filterAcq, setFilterAcq] = useState<AcqFilter>('ALL');
  const [filterStage, setFilterStage] = useState<StageFilter>('ALL');
  const [filterYear, setFilterYear] = useState<number | 'ALL'>('ALL');

  // 편집 모달 상태: null = 닫힘, {} = 신규, {...project} = 편집
  const [editing, setEditing] = useState<SupabaseProject | null | 'new'>(null);

  // 지급알림 발송 상태 — 행별 'sending' | 'sent' | 'error'
  const [notifyState, setNotifyState] = useState<Record<string, 'sending' | 'sent' | 'error'>>({});
  const [notifyError, setNotifyError] = useState<string | null>(null);

  async function notifyPayment(p: SupabaseProject) {
    const pl = p.pl?.trim();
    if (!pl) {
      setNotifyError(`"${p.campaign_name}" — PL 정보가 비어있어 발송할 수 없습니다.`);
      return;
    }
    if (!confirm(`PL "${pl}" 님에게 "${p.campaign_name}" 지급알림 DM 을 발송할까요?`)) return;
    setNotifyError(null);
    setNotifyState(prev => ({ ...prev, [p.id]: 'sending' }));
    try {
      const res = await fetch('/api/notifications/payment-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: p.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = [j?.error, j?.hint].filter(Boolean).join(' — ');
        throw new Error(msg || `HTTP ${res.status}`);
      }
      setNotifyState(prev => ({ ...prev, [p.id]: 'sent' }));
      setTimeout(() => {
        setNotifyState(prev => {
          const next = { ...prev };
          if (next[p.id] === 'sent') delete next[p.id];
          return next;
        });
      }, 3500);
    } catch (e: any) {
      setNotifyState(prev => ({ ...prev, [p.id]: 'error' }));
      setNotifyError(e?.message ?? '발송 실패');
      setTimeout(() => {
        setNotifyState(prev => {
          const next = { ...prev };
          if (next[p.id] === 'error') delete next[p.id];
          return next;
        });
      }, 5000);
    }
  }

  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const p of projects) {
      if (p.submitted_at) ys.add(parseInt(p.submitted_at.slice(0, 4), 10));
    }
    return [...ys].sort((a, b) => b - a);
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter(p => {
      // 탭 필터 우선
      if (activeTab === 'WON' && p.acquisition_status !== 'WON') return false;

      const q = search.trim().toLowerCase();
      if (q) {
        const hay = [p.campaign_name, p.pl, p.team, p.id]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterAcq !== 'ALL' && (p.acquisition_status ?? 'PENDING') !== filterAcq) return false;
      if (filterStage !== 'ALL' && paymentStageOf(p) !== filterStage) return false;
      if (filterYear !== 'ALL') {
        const y = p.submitted_at ? parseInt(p.submitted_at.slice(0, 4), 10) : 0;
        if (y !== filterYear) return false;
      }
      return true;
    });
  }, [projects, activeTab, search, filterAcq, filterStage, filterYear]);

  const tabCounts = useMemo(() => {
    const won = projects.filter(p => p.acquisition_status === 'WON').length;
    return { won, all: projects.length };
  }, [projects]);

  async function handleDelete(p: SupabaseProject) {
    if (!confirm(`"${p.campaign_name}" (${p.id}) 프로젝트를 삭제할까요?\n참여 멤버 ${p.members.length}명의 지급 기록도 함께 삭제됩니다.`))
      return;
    const res = await fetch(`/api/projects/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`삭제 실패: ${j?.error ?? res.status}`);
      return;
    }
    refresh();
  }

  return (
    <div className="p-8 space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">프로젝트 관리</h1>
          <p className="text-sm text-gray-400 mt-0.5">수주인센티브 프로젝트 관리</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            <Plus size={15} />
            프로젝트 추가
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5" />
          <span>조회 실패: {error}</span>
        </div>
      )}

      {notifyError && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5" />
          <span>지급알림 발송 실패: {notifyError}</span>
        </div>
      )}

      {/* 상단 탭 — 수주성공 / 전체 프로젝트 */}
      <div className="flex items-end gap-1 border-b border-gray-200">
        <ProjectTab
          active={activeTab === 'WON'}
          onClick={() => setActiveTab('WON')}
          label="수주성공"
          count={tabCounts.won}
          tone="emerald"
        />
        <ProjectTab
          active={activeTab === 'ALL'}
          onClick={() => setActiveTab('ALL')}
          label="전체 프로젝트"
          count={tabCounts.all}
          tone="blue"
        />
      </div>

      {/* 필터 바 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="캠페인명, PL, 팀 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
        <select
          value={filterYear}
          onChange={e =>
            setFilterYear(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
          }
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-600"
        >
          <option value="ALL">전체 연도</option>
          {years.map(y => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <select
          value={filterStage}
          onChange={e => setFilterStage(e.target.value as StageFilter)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-600"
        >
          <option value="ALL">전체 단계</option>
          {(Object.keys(PAYMENT_STAGE_LABEL) as PaymentStage[]).map(s => (
            <option key={s} value={s}>
              {PAYMENT_STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={filterAcq}
          onChange={e => setFilterAcq(e.target.value as AcqFilter)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-600"
        >
          <option value="ALL">전체 수주여부</option>
          {ACQ_OPTIONS.map(a => (
            <option key={a} value={a}>
              {ACQUISITION_LABEL[a]}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-gray-400">{filtered.length}건</span>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {[
                  '캠페인명',
                  '연도',
                  '담당팀',
                  'PL',
                  '구분',
                  '수주여부',
                  '지급 단계',
                  '인센티브 재원',
                  '1차 지급',
                  '2차 지급',
                  ...(canEdit ? ['관리'] : []),
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
                  <td colSpan={canEdit ? 11 : 10} className="text-center py-12 text-sm text-gray-400">
                    <Loader2 size={20} className="animate-spin mx-auto mb-2 opacity-50" />
                    데이터 불러오는 중...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 11 : 10} className="text-center py-12 text-sm text-gray-400">
                    프로젝트가 없습니다
                  </td>
                </tr>
              ) : (
                filtered.map(p => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    canEdit={canEdit}
                    onEdit={() => setEditing(p)}
                    onDelete={() => handleDelete(p)}
                    onNotify={() => notifyPayment(p)}
                    notifyStatus={notifyState[p.id]}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 편집/추가 모달 */}
      {editing !== null && (
        <ProjectEditModal
          project={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ProjectRow({
  project: p,
  canEdit,
  onEdit,
  onDelete,
  onNotify,
  notifyStatus,
}: {
  project: SupabaseProject;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onNotify: () => void;
  notifyStatus?: 'sending' | 'sent' | 'error';
}) {
  const acq = (p.acquisition_status ?? 'PENDING') as keyof typeof ACQUISITION_LABEL;
  const acqCls =
    acq === 'WON'
      ? 'bg-emerald-50 text-emerald-700'
      : acq === 'LOST'
      ? 'bg-red-50 text-red-700'
      : acq === 'CANCELLED'
      ? 'bg-gray-100 text-gray-500'
      : 'bg-amber-50 text-amber-700';

  const stage = paymentStageOf(p);
  const stageCls =
    stage === 'ALL_PAID'
      ? 'bg-emerald-100 text-emerald-800'
      : stage.includes('PAID')
      ? 'bg-blue-100 text-blue-700'
      : stage === 'FUND_CONFIRMED'
      ? 'bg-indigo-50 text-indigo-700'
      : 'bg-gray-100 text-gray-600';

  const year = p.submitted_at ? parseInt(p.submitted_at.slice(0, 4), 10) : '-';

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Link
            href={`/projects/${encodeURIComponent(p.id)}`}
            className="font-medium text-gray-900 hover:text-blue-600 max-w-[240px] truncate"
          >
            {p.campaign_name}
          </Link>
          {p.committee_sheet_link && (
            <a
              href={p.committee_sheet_link}
              target="_blank"
              rel="noreferrer"
              className="text-gray-300 hover:text-blue-500"
            >
              <ExternalLink size={12} />
            </a>
          )}
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5">
          {p.id} · 참여 {p.members.length}명 · R값 {p.r_value ? formatKRWFull(p.r_value) : '-'}
        </div>
      </td>
      <td className="px-4 py-3 text-gray-600">{year}년</td>
      <td className="px-4 py-3 text-gray-600">{p.team ?? '-'}</td>
      <td className="px-4 py-3 text-gray-700 font-medium">{p.pl ?? '-'}</td>
      <td className="px-4 py-3">
        <CategoryBadge category={p.category} />
      </td>
      <td className="px-4 py-3">
        <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded-full', acqCls)}>
          {ACQUISITION_LABEL[acq]}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded-full', stageCls)}>
          {PAYMENT_STAGE_LABEL[stage]}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{formatKRWFull(p.incentive_fund)}</div>
        <div className="text-[11px] text-gray-400">
          {p.commission != null ? formatCommission(p.commission) : '-'}
          {p.category && ` · ${p.category}`}
        </div>
      </td>
      <td className="px-4 py-3">
        <PaymentCell
          date={p.first_payment_date}
          ratio={p.first_payment_ratio}
          completed={p.first_payment_completed}
          skipped={p.first_payment_skipped}
          acquisitionLost={p.acquisition_status === 'LOST'}
        />
      </td>
      <td className="px-4 py-3">
        <PaymentCell
          date={p.second_payment_date}
          ratio={p.second_payment_ratio}
          completed={p.second_payment_completed}
          skipped={p.second_payment_skipped}
          acquisitionLost={p.acquisition_status === 'LOST'}
        />
      </td>
      {canEdit && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              title="편집"
              className="p-1.5 rounded hover:bg-blue-50 text-blue-600 hover:text-blue-800"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={onDelete}
              title="삭제"
              className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
            >
              <Trash2 size={13} />
            </button>
            {/* 지급알림 — 재원확정완료 단계에서만 노출 */}
            {stage === 'FUND_CONFIRMED' && (
              <button
                onClick={onNotify}
                disabled={notifyStatus === 'sending'}
                title="PL 에게 위원회 진행결과 안내 DM 발송"
                className={clsx(
                  'flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors ml-0.5',
                  notifyStatus === 'sent'
                    ? 'bg-emerald-100 text-emerald-700'
                    : notifyStatus === 'error'
                    ? 'bg-red-100 text-red-700'
                    : notifyStatus === 'sending'
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100'
                )}
              >
                {notifyStatus === 'sending' ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : notifyStatus === 'sent' ? (
                  <CheckCircle2 size={11} />
                ) : (
                  <BellRing size={11} />
                )}
                {notifyStatus === 'sending'
                  ? '발송중'
                  : notifyStatus === 'sent'
                  ? '발송완료'
                  : notifyStatus === 'error'
                  ? '실패'
                  : '지급알림'}
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return <span className="text-gray-300 text-xs">-</span>;
  // 신규 / 연장 케이스를 색상 분리. 그 외 (신규(이전경험 X) 등)는 기본 색
  const isNew = category.startsWith('신규');
  const isExt = category.startsWith('연장');
  const cls = isExt
    ? 'bg-amber-50 text-amber-700'
    : isNew
    ? 'bg-blue-50 text-blue-700'
    : 'bg-gray-100 text-gray-600';
  return (
    <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap', cls)}>
      {category}
    </span>
  );
}

function ProjectTab({
  active,
  onClick,
  label,
  hint,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
  count: number;
  tone: 'emerald' | 'blue';
}) {
  const activeColor =
    tone === 'emerald' ? 'border-emerald-600 text-emerald-700' : 'border-blue-600 text-blue-700';
  const badgeColor = active
    ? tone === 'emerald'
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-blue-100 text-blue-700'
    : 'bg-gray-100 text-gray-500';
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-4 py-2.5 -mb-px border-b-2 transition-colors flex items-center gap-2',
        active ? activeColor : 'border-transparent text-gray-500 hover:text-gray-800'
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className={clsx('text-[11px] px-1.5 py-0.5 rounded-full font-medium', badgeColor)}>
        {count}
      </span>
      {hint && <span className="text-[10px] text-gray-400">· {hint}</span>}
    </button>
  );
}

function PaymentCell({
  date,
  ratio,
  completed,
  skipped,
  acquisitionLost,
}: {
  date: string | null;
  ratio: number | null;
  completed: boolean;
  skipped: boolean;
  acquisitionLost?: boolean;
}) {
  if (acquisitionLost) {
    return (
      <div>
        <div className="text-xs font-medium text-red-600">수주실패 미지급</div>
        <div className="text-[11px] text-gray-400">자동 처리</div>
      </div>
    );
  }
  if (skipped) {
    return (
      <div>
        <div className="text-xs font-medium text-amber-700">미지급</div>
        <div className="text-[11px] text-gray-400">
          {ratio != null && `${ratio}%`}
        </div>
      </div>
    );
  }
  if (!date) {
    return <span className="text-gray-300 text-xs">미정</span>;
  }
  return (
    <div>
      <div
        className={clsx(
          'text-xs font-medium',
          completed ? 'text-emerald-600' : 'text-amber-600'
        )}
      >
        {formatDate(date)}
      </div>
      <div className="text-[11px] text-gray-400">
        {ratio != null && `${ratio}%`} · {completed ? '✓ 완료' : '대기'}
      </div>
    </div>
  );
}

