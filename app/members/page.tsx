'use client';

import { useMemo, useState } from 'react';
import { Users, ChevronDown, ChevronRight, Info, Loader2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { formatKRWFull, formatDate } from '@/lib/utils';
import {
  useIncentiveData,
  useUserDirectory,
  calcMemberSummariesV2,
  type MemberSummary,
} from '@/lib/incentive-data';

export default function MembersPage() {
  const { projects, loading, error } = useIncentiveData();
  const { lastWorkDateByName, teamByName, employeeIdByName, statusByName } =
    useUserDirectory();

  const [filterYear, setFilterYear] = useState<number | 'ALL'>('ALL');
  const [filterScope, setFilterScope] = useState<'ALL' | 'INDIVIDUAL' | 'TEAM'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const summaries = useMemo(
    () =>
      calcMemberSummariesV2(projects, {
        lastWorkDateByName,
        teamByName,
        employeeIdByName,
        statusByName,
      }),
    [projects, lastWorkDateByName, teamByName, employeeIdByName, statusByName]
  );

  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const p of projects) {
      if (p.submitted_at) ys.add(parseInt(p.submitted_at.slice(0, 4), 10));
    }
    return [...ys].sort((a, b) => b - a);
  }, [projects]);

  // 필터 적용 + 정렬
  //   - 퇴사자(status==='퇴사')는 명시적으로 제외 (퇴사예정·휴직은 포함)
  //   - 팀 계정은 status 가 없으므로 항상 포함
  const sorted = useMemo(() => {
    return summaries
      .filter(m => m.status !== '퇴사') // 퇴사자 제외 (퇴사예정·휴직·재직은 통과)
      .map(m => {
        if (filterYear === 'ALL') return m;
        const yb = m.yearly_breakdown[filterYear] ?? { paid: 0, pending: 0 };
        return {
          ...m,
          total_paid: yb.paid,
          total_pending: yb.pending,
          projects: m.projects.filter(p => p.year === filterYear),
        };
      })
      .filter(m => {
        if (filterScope === 'INDIVIDUAL' && m.is_team_account) return false;
        if (filterScope === 'TEAM' && !m.is_team_account) return false;
        if (filterYear !== 'ALL' && m.total_paid + m.total_pending === 0) return false;
        return true;
      })
      .sort((a, b) => b.total_paid + b.total_pending - (a.total_paid + a.total_pending));
  }, [summaries, filterYear, filterScope]);

  // 제외 합계는 퇴사자(=화면에서 사라진 사람들)의 마지막근무일 이후 paid_at 분 — 사용자에게 컨텍스트 제공용
  const totalExcluded = useMemo(
    () => summaries.reduce((s, m) => s + m.total_excluded, 0),
    [summaries]
  );

  const aggTotals = useMemo(() => {
    return {
      paid: sorted.reduce((s, m) => s + m.total_paid, 0),
      pending: sorted.reduce((s, m) => s + m.total_pending, 0),
    };
  }, [sorted]);

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
            구성원·팀 계정별 인센티브 지급 내역 및 수령 예정액 (paid_at ≤ 오늘 기준)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterScope}
            onChange={e => setFilterScope(e.target.value as any)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-600"
          >
            <option value="ALL">전체 (개인+팀)</option>
            <option value="INDIVIDUAL">개인만</option>
            <option value="TEAM">팀 계정만</option>
          </select>
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
        </div>
      </div>

      {/* 에러 / 로딩 */}
      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5" />
          <span className="break-all">데이터 조회 실패: {error}</span>
        </div>
      )}

      {/* 제외 안내 배너 */}
      {totalExcluded > 0 && (
        <div className="flex items-start gap-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
          <Info size={14} className="mt-0.5 text-gray-400" />
          <span>
            퇴사자에게 실제로 지급되지 않은 금액 <b>{formatKRWFull(totalExcluded)}</b> 가
            지급 집계에서 제외되었습니다.
          </span>
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="총 지급 완료액" value={formatKRWFull(aggTotals.paid)} color="blue" />
        <SummaryCard label="총 수령 예정액" value={formatKRWFull(aggTotals.pending)} color="amber" />
        <SummaryCard label="대상 인원/팀" value={`${sorted.length}건`} color="gray" />
      </div>

      {/* 멤버 테이블 (아코디언) */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[2rem_1fr_6rem_9rem_9rem_9rem_9rem] gap-2 px-4 py-3 bg-gray-50/70 border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          <div />
          <div>이름 / 팀</div>
          <div className="text-right">참여</div>
          <div className="text-right">지급 완료</div>
          <div className="text-right">수령 예정</div>
          <div className="text-right">지급 총액</div>
          <div className="text-right">연도</div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-sm text-gray-400">
            <Loader2 size={20} className="animate-spin mx-auto mb-2 opacity-50" />
            데이터 불러오는 중...
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">
            <Users size={32} className="mx-auto mb-3 opacity-30" />
            <p>지급 내역이 없습니다</p>
          </div>
        ) : (
          sorted.map((m, i) => (
            <MemberRow
              key={m.member_name}
              summary={m}
              rank={i + 1}
              isExpanded={expandedId === m.member_name}
              onToggle={() => toggle(m.member_name)}
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
  summary: MemberSummary;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
  filterYear: number | 'ALL';
}) {
  const total = summary.total_paid + summary.total_pending;
  const paidRatio = total > 0 ? (summary.total_paid / total) * 100 : 0;

  const yearlyData =
    filterYear === 'ALL'
      ? Object.entries(summary.yearly_breakdown).sort(([a], [b]) => Number(b) - Number(a))
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
              summary.is_team_account
                ? 'bg-emerald-100 text-emerald-700'
                : rank === 1
                ? 'bg-blue-600 text-white'
                : rank === 2
                ? 'bg-blue-100 text-blue-700'
                : rank === 3
                ? 'bg-gray-100 text-gray-600'
                : 'bg-gray-50 text-gray-400'
            )}
          >
            {summary.is_team_account ? 'T' : rank}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-gray-900 truncate">
              {summary.member_name}
              {summary.is_team_account && (
                <span className="ml-1.5 text-[10px] text-emerald-700 font-medium">[팀 계정]</span>
              )}
              {!summary.is_team_account && summary.last_work_date && (
                <span className="ml-1.5 text-[10px] text-gray-400">
                  · 퇴직 {summary.last_work_date}
                </span>
              )}
            </p>
            <p className="text-xs text-gray-400">{summary.team || '-'}</p>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <span className="text-sm text-gray-500">{summary.projects.length}건</span>
        </div>
        <div className="flex items-center justify-end">
          <span className="text-sm font-medium text-blue-700">{formatKRWFull(summary.total_paid)}</span>
        </div>
        <div className="flex items-center justify-end">
          <span className="text-sm text-amber-600">{formatKRWFull(summary.total_pending)}</span>
        </div>
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
        <div className="flex items-center justify-end gap-1 flex-wrap">
          {Object.entries(summary.yearly_breakdown)
            .sort(([a], [b]) => Number(b) - Number(a))
            .slice(0, 2)
            .map(([year]) => (
              <span
                key={year}
                className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded"
              >
                {year}
              </span>
            ))}
        </div>
      </div>

      {/* 펼침: 프로젝트 상세 내역 */}
      {isExpanded && (
        <div className="bg-blue-50/20 border-b border-gray-100 px-6 pb-4 pt-3">
          {filterYear === 'ALL' && yearlyData.length > 0 && (
            <div className="mb-4 flex gap-3 flex-wrap">
              {yearlyData.map(([year, data]) => (
                <div
                  key={year}
                  className="bg-white rounded-lg px-4 py-2.5 border border-gray-200"
                >
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

          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left pb-2 font-medium">캠페인명</th>
                <th className="text-right pb-2 font-medium">기여도</th>
                <th className="text-right pb-2 font-medium">1차 (지급일)</th>
                <th className="text-right pb-2 font-medium">2차 (지급일)</th>
                <th className="text-right pb-2 font-medium">합계</th>
              </tr>
            </thead>
            <tbody>
              {summary.projects.map(p => (
                <tr key={p.project_id} className="border-t border-gray-100/80">
                  <td className="py-2 text-gray-700 font-medium">
                    {p.campaign_name}
                    {(p.first_status === 'excluded' || p.second_status === 'excluded') && (
                      <span
                        title="paid_at 이 마지막 근무일 이후 → 제외"
                        className="ml-2 text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded"
                      >
                        퇴직 제외
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right text-blue-600 font-semibold">
                    {p.contribution}%
                  </td>
                  <td className="py-2 text-right">
                    <PhaseCell amount={p.first_amount} paidAt={p.first_paid_at} status={p.first_status} />
                  </td>
                  <td className="py-2 text-right">
                    <PhaseCell amount={p.second_amount} paidAt={p.second_paid_at} status={p.second_status} />
                  </td>
                  <td className="py-2 text-right font-bold text-gray-800">
                    {formatKRWFull(
                      (p.first_status === 'excluded' ? 0 : p.first_amount) +
                        (p.second_status === 'excluded' ? 0 : p.second_amount)
                    )}
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

function PhaseCell({
  amount,
  paidAt,
  status,
}: {
  amount: number;
  paidAt: string | null;
  status: 'paid' | 'pending' | 'excluded';
}) {
  if (status === 'excluded') {
    return (
      <span className="text-gray-300 line-through" title={`지급예정: ${paidAt}`}>
        {formatKRWFull(amount)}
      </span>
    );
  }
  if (status === 'paid') {
    return (
      <span className="text-emerald-600 font-medium">
        {formatKRWFull(amount)} ✓
        {paidAt && <span className="ml-1 text-[10px] text-gray-400">{formatDate(paidAt)}</span>}
      </span>
    );
  }
  // pending
  return (
    <span className="text-gray-500">
      {formatKRWFull(amount)}
      {paidAt && <span className="ml-1 text-[10px] text-amber-600">{formatDate(paidAt)} 예정</span>}
    </span>
  );
}

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
    blue: { bg: 'bg-blue-50', text: 'text-blue-700' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700' },
    gray: { bg: 'bg-gray-100', text: 'text-gray-700' },
  }[color];
  return (
    <div className={clsx('rounded-xl px-5 py-4 border border-white/80', cls.bg)}>
      <p className="text-xs text-gray-500 mb-2">{label}</p>
      <p className={clsx('text-xl font-bold', cls.text)}>{value}</p>
    </div>
  );
}
