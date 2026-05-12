'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  X,
  ExternalLink,
  Info,
  Loader2,
  AlertCircle,
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

const ACQ_OPTIONS = ['WON', 'LOST', 'CANCELLED', 'PENDING', 'REVIEWING', 'RESULT_PENDING'] as const;
type AcqFilter = (typeof ACQ_OPTIONS)[number] | 'ALL';
type StageFilter = PaymentStage | 'ALL';

export default function ProjectsPage() {
  const { projects, loading, error } = useIncentiveData();

  const [search, setSearch] = useState('');
  const [filterAcq, setFilterAcq] = useState<AcqFilter>('ALL');
  const [filterStage, setFilterStage] = useState<StageFilter>('ALL');
  const [filterYear, setFilterYear] = useState<number | 'ALL'>('ALL');

  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const p of projects) {
      if (p.submitted_at) ys.add(parseInt(p.submitted_at.slice(0, 4), 10));
    }
    return [...ys].sort((a, b) => b - a);
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter(p => {
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
  }, [projects, search, filterAcq, filterStage, filterYear]);

  return (
    <div className="p-8 space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">프로젝트 관리</h1>
          <p className="text-sm text-gray-400 mt-0.5">수주인센티브 운영위원회 프로젝트 목록</p>
        </div>
      </div>

      {/* 안내 배너: CRUD는 곧 추가 */}
      <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
        <Info size={14} className="mt-0.5 flex-shrink-0" />
        <span>
          현재는 <b>조회 전용</b>입니다. 데이터 수정은 시트에서 변경 후{' '}
          <Link href="/admin/import" className="underline font-semibold">
            데이터 Import
          </Link>{' '}
          메뉴에서 "기존 데이터 초기화 후 import"로 재반영해주세요. (웹 직접 편집 기능은 곧 추가)
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5" />
          <span>조회 실패: {error}</span>
        </div>
      )}

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
                  '수주여부',
                  '지급 단계',
                  '인센티브 재원',
                  '1차 지급예정',
                  '2차 지급예정',
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
                  <td colSpan={9} className="text-center py-12 text-sm text-gray-400">
                    <Loader2 size={20} className="animate-spin mx-auto mb-2 opacity-50" />
                    데이터 불러오는 중...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-sm text-gray-400">
                    프로젝트가 없습니다
                  </td>
                </tr>
              ) : (
                filtered.map(p => <ProjectRow key={p.id} project={p} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProjectRow({ project: p }: { project: SupabaseProject }) {
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
        {p.first_payment_date ? (
          <div>
            <div
              className={clsx(
                'text-xs font-medium',
                p.first_payment_completed ? 'text-emerald-600' : 'text-amber-600'
              )}
            >
              {formatDate(p.first_payment_date)}
            </div>
            <div className="text-[11px] text-gray-400">
              {p.first_payment_ratio != null && `${p.first_payment_ratio}%`}{' '}
              · {p.first_payment_completed ? '✓ 완료' : '대기중'}
            </div>
          </div>
        ) : (
          <span className="text-gray-300 text-xs">미정</span>
        )}
      </td>
      <td className="px-4 py-3">
        {p.second_payment_date ? (
          <div>
            <div
              className={clsx(
                'text-xs font-medium',
                p.second_payment_completed ? 'text-emerald-600' : 'text-amber-600'
              )}
            >
              {formatDate(p.second_payment_date)}
            </div>
            <div className="text-[11px] text-gray-400">
              {p.second_payment_ratio != null && `${p.second_payment_ratio}%`}{' '}
              · {p.second_payment_completed ? '✓ 완료' : '대기중'}
            </div>
          </div>
        ) : (
          <span className="text-gray-300 text-xs">미정</span>
        )}
      </td>
    </tr>
  );
}
