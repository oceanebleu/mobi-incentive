'use client';

import { useIncentiveStore } from '@/lib/store';
import {
  getDashboardStats,
  calcMemberSummaries,
  formatKRW,
  formatKRWFull,
} from '@/lib/utils';
import { useLastWorkDates } from '@/lib/useLastWorkDates';
import { ProjectStatus, STATUS_LABELS } from '@/lib/types';
import { Wallet, CreditCard, TrendingUp, CheckCircle, BarChart3, Users } from 'lucide-react';
import clsx from 'clsx';

// 주요 단계 (지급 단계 제외)
const MAIN_STAGES: ProjectStatus[] = [
  'PL_PENDING', 'PL_COMPLETED', 'FUND_CONFIRMED', 'ALL_PAID',
];
// 지급 세부 단계
const PAY_STAGES: ProjectStatus[] = [
  'FIRST_PENDING', 'FIRST_PAID', 'SECOND_PENDING', 'SECOND_PAID',
];

export default function DashboardPage() {
  const { projects, members } = useIncentiveStore();
  const { byName: lastWorkDateByName } = useLastWorkDates();
  const stats = getDashboardStats(projects);
  const memberSummaries = calcMemberSummaries(projects, members, {
    lastWorkDateByName,
  });

  const sortedMembers = [...memberSummaries]
    .filter((m) => m.totalPaid + m.totalPending > 0)
    .sort((a, b) => b.totalPaid + b.totalPending - (a.totalPaid + a.totalPending));

  const kpiCards = [
    {
      label: '누적 지급 완료액',
      value: formatKRW(stats.totalPaid),
      sub: formatKRWFull(stats.totalPaid),
      icon: Wallet,
      colorCls: 'text-blue-700',
      bgCls: 'bg-blue-50',
      iconBg: 'bg-blue-100',
    },
    {
      label: '누적 1차 지급 완료액',
      value: formatKRW(stats.totalFirstPaid),
      sub: formatKRWFull(stats.totalFirstPaid),
      icon: CreditCard,
      colorCls: 'text-indigo-700',
      bgCls: 'bg-indigo-50',
      iconBg: 'bg-indigo-100',
    },
    {
      label: '누적 2차 지급 완료액',
      value: formatKRW(stats.totalSecondPaid),
      sub: formatKRWFull(stats.totalSecondPaid),
      icon: CreditCard,
      colorCls: 'text-violet-700',
      bgCls: 'bg-violet-50',
      iconBg: 'bg-violet-100',
    },
    {
      label: '1차 실지급 비율',
      value: `${stats.firstPayRatio.toFixed(1)}%`,
      sub: `재원확정 이상 ${projects.filter(p => ['FUND_CONFIRMED','FIRST_PENDING','FIRST_PAID','SECOND_PENDING','SECOND_PAID','ALL_PAID'].includes(p.status)).length}건 중`,
      icon: TrendingUp,
      colorCls: 'text-emerald-700',
      bgCls: 'bg-emerald-50',
      iconBg: 'bg-emerald-100',
    },
    {
      label: '2차 실지급 비율',
      value: `${stats.secondPayRatio.toFixed(1)}%`,
      sub: '재원확정 이상 기준',
      icon: TrendingUp,
      colorCls: 'text-teal-700',
      bgCls: 'bg-teal-50',
      iconBg: 'bg-teal-100',
    },
    {
      label: '1~2차 완료 비율',
      value: `${stats.allPayRatio.toFixed(1)}%`,
      sub: '전체 지급 완료 기준',
      icon: CheckCircle,
      colorCls: 'text-sky-700',
      bgCls: 'bg-sky-50',
      iconBg: 'bg-sky-100',
    },
  ];

  return (
    <div className="p-8 space-y-7 fade-in">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">대시보드</h1>
        <p className="text-sm text-gray-400 mt-0.5">수주인센티브 운영 현황 요약</p>
      </div>

      {/* KPI 카드 6개 */}
      <div className="grid grid-cols-3 gap-4">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className={clsx('rounded-xl p-5 border border-white/80', card.bgCls)}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className={clsx('rounded-lg p-2', card.iconBg)}>
                <card.icon size={15} className={card.colorCls} />
              </div>
              <span className="text-xs font-medium text-gray-500">{card.label}</span>
            </div>
            <div className={clsx('text-2xl font-bold leading-none', card.colorCls)}>
              {card.value}
            </div>
            <div className="text-[11px] text-gray-400 mt-1.5">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* 단계별 현황 + 운영위원회 요약 */}
      <div className="grid grid-cols-3 gap-5">
        {/* 단계별 진행 현황 - 2/3 너비 */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-800">단계별 진행 현황</h2>
            <span className="ml-auto text-xs text-gray-400">
              전체 {stats.totalProjects}건
            </span>
          </div>

          <div className="space-y-5">
            {/* 주요 단계 */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
                주요 단계
              </p>
              <div className="space-y-2.5">
                {MAIN_STAGES.map((s) => (
                  <StageBar
                    key={s}
                    name={STATUS_LABELS[s]}
                    value={stats.stageCounts[s]}
                    max={stats.totalProjects}
                    variant="primary"
                  />
                ))}
              </div>
            </div>

            {/* 지급 단계 (sub) */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
                지급 단계
              </p>
              <div className="space-y-2.5">
                {PAY_STAGES.map((s) => (
                  <StageBar
                    key={s}
                    name={STATUS_LABELS[s]}
                    value={stats.stageCounts[s]}
                    max={stats.totalProjects}
                    variant="secondary"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 운영위원회 요약 - 1/3 너비 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-800">운영위원회 진행</h2>
          </div>

          <div className="text-5xl font-bold text-blue-600 mb-1">
            {stats.totalProjects}
          </div>
          <div className="text-sm text-gray-400 mb-5">건 운영 중</div>

          <div className="space-y-3 mt-auto">
            {[
              { label: '전체지급 완료', count: stats.stageCounts.ALL_PAID, color: 'bg-emerald-400' },
              { label: '1차지급 완료', count: stats.stageCounts.FIRST_PAID, color: 'bg-indigo-400' },
              { label: '2차지급 완료', count: stats.stageCounts.SECOND_PAID, color: 'bg-violet-400' },
              {
                label: '지급 진행중',
                count: stats.stageCounts.FIRST_PENDING + stats.stageCounts.SECOND_PENDING,
                color: 'bg-amber-400',
              },
              { label: 'PL 작성중', count: stats.stageCounts.PL_PENDING + stats.stageCounts.PL_COMPLETED, color: 'bg-gray-300' },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={clsx('w-2 h-2 rounded-full', color)} />
                  <span className="text-xs text-gray-500">{label}</span>
                </div>
                <span className="text-sm font-semibold text-gray-800">{count}건</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 개인별 인센티브 지급 현황 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Users size={16} className="text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-800">개인별 인센티브 지급 현황</h2>
          <span className="ml-auto text-xs text-gray-400">지급 총액 기준 내림차순</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['순위', '이름', '팀', '지급 완료액', '수령 예정액', '지급 총액'].map((h, i) => (
                  <th
                    key={h}
                    className={clsx(
                      'pb-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide',
                      i < 3 ? 'text-left pr-4' : 'text-right pr-4 last:pr-0'
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-sm text-gray-400">
                    데이터가 없습니다
                  </td>
                </tr>
              ) : (
                sortedMembers.map((m, i) => {
                  const total = m.totalPaid + m.totalPending;
                  const paidRatio = total > 0 ? (m.totalPaid / total) * 100 : 0;
                  return (
                    <tr
                      key={m.memberId}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 pr-4">
                        <span
                          className={clsx(
                            'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold',
                            i === 0 ? 'bg-blue-600 text-white' :
                            i === 1 ? 'bg-blue-100 text-blue-700' :
                            i === 2 ? 'bg-gray-100 text-gray-600' :
                            'text-gray-400'
                          )}
                        >
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-semibold text-gray-900">{m.memberName}</td>
                      <td className="py-3 pr-4 text-gray-500 text-xs">{m.team || '-'}</td>
                      <td className="py-3 pr-4 text-right">
                        <span className="text-blue-600 font-medium">
                          {formatKRWFull(m.totalPaid)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className="text-amber-600">
                          {formatKRWFull(m.totalPending)}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* 미니 진행 바 */}
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${paidRatio}%` }}
                            />
                          </div>
                          <span className="font-bold text-gray-900">
                            {formatKRWFull(total)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 단계 바 컴포넌트
function StageBar({
  name,
  value,
  max,
  variant,
}: {
  name: string;
  value: number;
  max: number;
  variant: 'primary' | 'secondary';
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-28 flex-shrink-0 truncate">{name}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-500',
            variant === 'primary' ? 'bg-blue-500' : 'bg-blue-300'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-5 text-right">{value}</span>
    </div>
  );
}
