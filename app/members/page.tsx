'use client';

import { useState, useMemo } from 'react';
import { useIncentiveStore } from '@/lib/store';
import { calcMemberSummaries, formatKRWFull, formatDate } from '@/lib/utils';
import { MemberPaymentSummary } from '@/lib/types';
import { Users, ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

export default function MembersPage() {
  const { projects, members } = useIncentiveStore();
  const [filterYear, setFilterYear] = useState<number | 'ALL'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const summaries = useMemo(
    () => calcMemberSummaries(projects, members),
    [projects, members]
  );

  const years = useMemo(() => {
    const ys = [...new Set(projects.map(p => p.year))].sort((a, b) => b - a);
    return ys;
  }, [projects]);

  // 필터 적용 후 정렬
  const sorted = useMemo(() => {
    return [...summaries]
      .map(m => {
        if (filterYear === 'ALL') return m;
        const yb = m.yearlyBreakdown[filterYear] ?? { paid: 0, pending: 0 };
        return {
          ...m,
          totalPaid: yb.paid,
          totalPending: yb.pending,
          projects: m.projects.filter(p => p.year === filterYear),
        };
      })
      .filter(m => m.totalPaid + m.totalPending > 0 || filterYear === 'ALL')
      .sort((a, b) => b.totalPaid + b.totalPending - (a.totalPaid + a.totalPending));
  }, [summaries, filterYear]);

  function toggle(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  return (
    <div className="p-8 space-y-6 fade-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">개인별 지급 관리</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            구성원별 인센티브 지급 내역 및 수령 예정액 관리
          </p>
        </div>
        <select
          value={filterYear}
          onChange={e =>
            setFilterYear(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
          }
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-gray-600"
        >
          <option value="ALL">전체 연도</option>
          {years.map(y => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard
          label="총 지급 완료액"
          value={formatKRWFull(sorted.reduce((s, m) => s + m.totalPaid, 0))}
          color="blue"
        />
        <SummaryCard
          label="총 수령 예정액"
          value={formatKRWFull(sorted.reduce((s, m) => s + m.totalPending, 0))}
          color="amber"
        />
        <SummaryCard
          label="인원 수"
          value={`${sorted.length}명`}
          color="gray"
        />
      </div>

      {/* 멤버 테이블 (아코디언) */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* 테이블 헤더 */}
        <div className="grid grid-cols-[2rem_1fr_6rem_9rem_9rem_9rem_9rem] gap-2 px-4 py-3 bg-gray-50/70 border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          <div />
          <div>이름 / 팀</div>
          <div className="text-right">참여</div>
          <div className="text-right">지급 완료</div>
          <div className="text-right">수령 예정</div>
          <div className="text-right">지급 총액</div>
          <div className="text-right">연도별 내역</div>
        </div>

        {sorted.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">
            <Users size={32} className="mx-auto mb-3 opacity-30" />
            <p>지급 내역이 없습니다</p>
          </div>
        ) : (
          sorted.map((m, i) => (
            <MemberRow
              key={m.memberId}
              summary={m}
              rank={i + 1}
              isExpanded={expandedId === m.memberId}
              onToggle={() => toggle(m.memberId)}
              filterYear={filterYear}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 개별 멤버 행 (아코디언)
// ─────────────────────────────────────────────
function MemberRow({
  summary,
  rank,
  isExpanded,
  onToggle,
  filterYear,
}: {
  summary: MemberPaymentSummary;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
  filterYear: number | 'ALL';
}) {
  const total = summary.totalPaid + summary.totalPending;
  const paidRatio = total > 0 ? (summary.totalPaid / total) * 100 : 0;

  const yearlyData =
    filterYear === 'ALL'
      ? Object.entries(summary.yearlyBreakdown)
          .sort(([a], [b]) => Number(b) - Number(a))
      : [];

  return (
    <>
      <div
        className={clsx(
          'grid grid-cols-[2rem_1fr_6rem_9rem_9rem_9rem_9rem] gap-2 px-4 py-3.5 border-b border-gray-50 cursor-pointer transition-colors',
          isExpanded ? 'bg-blue-50/30' : 'hover:bg-gray-50/70'
        )}
        onClick={onToggle}
      >
        {/* 토글 아이콘 */}
        <div className="flex items-center justify-center">
          {isExpanded ? (
            <ChevronDown size={14} className="text-blue-500" />
          ) : (
            <ChevronRight size={14} className="text-gray-300" />
          )}
        </div>

        {/* 이름 / 팀 */}
        <div className="flex items-center gap-3">
          <div
            className={clsx(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
              rank === 1 ? 'bg-blue-600 text-white' :
              rank === 2 ? 'bg-blue-100 text-blue-700' :
              rank === 3 ? 'bg-gray-100 text-gray-600' :
              'bg-gray-50 text-gray-400'
            )}
          >
            {rank}
          </div>
          <div>
            <p className="font-semibold text-sm text-gray-900">{summary.memberName}</p>
            <p className="text-xs text-gray-400">{summary.team || '-'}</p>
          </div>
        </div>

        {/* 참여 프로젝트 수 */}
        <div className="flex items-center justify-end">
          <span className="text-sm text-gray-500">{summary.projects.length}건</span>
        </div>

        {/* 지급 완료 */}
        <div className="flex items-center justify-end">
          <span className="text-sm font-medium text-blue-700">
            {formatKRWFull(summary.totalPaid)}
          </span>
        </div>

        {/* 수령 예정 */}
        <div className="flex items-center justify-end">
          <span className="text-sm text-amber-600">
            {formatKRWFull(summary.totalPending)}
          </span>
        </div>

        {/* 총액 */}
        <div className="flex items-center justify-end">
          <div className="text-right">
            <p className="text-sm font-bold text-gray-900">{formatKRWFull(total)}</p>
            <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden mt-1 ml-auto">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${paidRatio}%` }}
              />
            </div>
          </div>
        </div>

        {/* 연도별 내역 미리보기 */}
        <div className="flex items-center justify-end gap-1">
          {Object.entries(summary.yearlyBreakdown)
            .sort(([a], [b]) => Number(b) - Number(a))
            .slice(0, 2)
            .map(([year, data]) => (
              <span
                key={year}
                className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded"
              >
                {year}년
              </span>
            ))}
        </div>
      </div>

      {/* 펼침: 프로젝트 상세 내역 */}
      {isExpanded && (
        <div className="bg-blue-50/20 border-b border-gray-100 px-6 pb-4 pt-3">
          {/* 연도별 요약 */}
          {filterYear === 'ALL' && yearlyData.length > 0 && (
            <div className="mb-4 flex gap-3 flex-wrap">
              {yearlyData.map(([year, data]) => (
                <div key={year} className="bg-white rounded-lg px-4 py-2.5 border border-gray-200">
                  <p className="text-[11px] text-gray-400 mb-1">{year}년</p>
                  <p className="text-sm font-bold text-gray-900">
                    {formatKRWFull(data.paid + data.pending)}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    완료 {formatKRWFull(data.paid)} · 예정 {formatKRWFull(data.pending)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* 프로젝트 목록 */}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left pb-2 font-medium">캠페인명</th>
                <th className="text-right pb-2 font-medium">연도</th>
                <th className="text-right pb-2 font-medium">기여도</th>
                <th className="text-right pb-2 font-medium">1차 지급액</th>
                <th className="text-right pb-2 font-medium">2차 지급액</th>
                <th className="text-right pb-2 font-medium">합계</th>
              </tr>
            </thead>
            <tbody>
              {summary.projects.map((p) => (
                <tr key={p.projectId} className="border-t border-gray-100/80">
                  <td className="py-2 text-gray-700 font-medium">{p.campaignName}</td>
                  <td className="py-2 text-right text-gray-500">{p.year}년</td>
                  <td className="py-2 text-right">
                    <span className="text-blue-600 font-semibold">{p.contribution}%</span>
                  </td>
                  <td className="py-2 text-right">
                    <span className={p.firstPaid ? 'text-emerald-600 font-medium' : 'text-gray-500'}>
                      {formatKRWFull(p.firstPayment)}
                      {p.firstPaid && ' ✓'}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <span className={p.secondPaid ? 'text-emerald-600 font-medium' : 'text-gray-500'}>
                      {formatKRWFull(p.secondPayment)}
                      {p.secondPaid && ' ✓'}
                    </span>
                  </td>
                  <td className="py-2 text-right font-bold text-gray-800">
                    {formatKRWFull(p.firstPayment + p.secondPayment)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// 요약 카드
// ─────────────────────────────────────────────
function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'blue' | 'amber' | 'gray';
}) {
  const cls = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', sub: 'text-blue-400' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', sub: 'text-amber-400' },
    gray: { bg: 'bg-gray-100', text: 'text-gray-700', sub: 'text-gray-400' },
  }[color];

  return (
    <div className={clsx('rounded-xl px-5 py-4 border border-white/80', cls.bg)}>
      <p className="text-xs text-gray-500 mb-2">{label}</p>
      <p className={clsx('text-xl font-bold', cls.text)}>{value}</p>
    </div>
  );
}
