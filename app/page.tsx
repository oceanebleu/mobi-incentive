'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Wallet,
  CreditCard,
  TrendingUp,
  CheckCircle,
  BarChart3,
  Users,
  Loader2,
  AlertCircle,
  FileText,
  Coins,
  Send,
  ChevronRight,
  CalendarClock,
} from 'lucide-react';
import { effectivePhaseAmount, type SupabaseProject } from '@/lib/incentive-data';
import clsx from 'clsx';
import { formatKRW, formatKRWFull } from '@/lib/utils';
import {
  useIncentiveData,
  useUserDirectory,
  calcMemberSummariesV2,
  getDashboardStatsV2,
  paymentStageOf,
  PAYMENT_STAGE_LABEL,
  ACQUISITION_LABEL,
  type PaymentStage,
} from '@/lib/incentive-data';

export default function DashboardPage() {
  const { projects, loading, error } = useIncentiveData();
  const { lastWorkDateByName, teamByName, employeeIdByName, statusByName } =
    useUserDirectory();

  // 개인별 지급 관리 페이지와 동일 정책으로 합산 (퇴사자 제외 + 마지막 근무일 이후 excluded)
  const stats = useMemo(
    () => getDashboardStatsV2(projects, { lastWorkDateByName, statusByName }),
    [projects, lastWorkDateByName, statusByName]
  );
  const memberSummaries = useMemo(
    () =>
      calcMemberSummariesV2(projects, {
        lastWorkDateByName,
        teamByName,
        employeeIdByName,
        statusByName,
      }),
    [projects, lastWorkDateByName, teamByName, employeeIdByName, statusByName]
  );

  // 개인/팀별 지급 현황 — 정렬 기준 & 명단 필터
  type SortBy = 'TOTAL' | 'PAID';
  type ScopeBy = 'ACTIVE' | 'ALL';
  const [memberSortBy, setMemberSortBy] = useState<SortBy>('TOTAL');
  const [memberScope, setMemberScope] = useState<ScopeBy>('ACTIVE');

  const sortedMembers = useMemo(() => {
    let list = [...memberSummaries].filter(m => m.total_paid + m.total_pending > 0);
    if (memberScope === 'ACTIVE') {
      // 퇴사자 제외 (팀 계정은 status 없음 → 항상 포함)
      list = list.filter(m => m.is_team_account || m.status !== '퇴사');
    }
    list.sort((a, b) => {
      if (memberSortBy === 'PAID') return b.total_paid - a.total_paid;
      // 기본 = TOTAL (지급 총액 = 완료 + 예정)
      return b.total_paid + b.total_pending - (a.total_paid + a.total_pending);
    });
    return list;
  }, [memberSummaries, memberSortBy, memberScope]);

  // 단계별 카운트 + 프로젝트 분류 (PL 작성대기 / 재원확정 필요 리스트용 + 단계 박스 드릴다운용)
  //   · PL 작성대기 : 수주실패·대행종료 제외 (PL 기여도 더 받을 이유 없음)
  //   · 재원확정 필요: 수주성공(WON) 한정 — 재원은 수주가 확정돼야 의미가 있으므로
  const stageGroups = useMemo(() => {
    const c: Record<PaymentStage, number> = {
      PL_PENDING: 0,
      PL_COMPLETED: 0,
      FUND_CONFIRMED: 0,
      FIRST_PAID: 0,
      ALL_PAID: 0,
    };
    // 단계별 전체 프로젝트 — 박스 클릭 시 노출용 (분포 그대로 보여줘야 함, 필터 X)
    const byStage: Record<PaymentStage, SupabaseProject[]> = {
      PL_PENDING: [],
      PL_COMPLETED: [],
      FUND_CONFIRMED: [],
      FIRST_PAID: [],
      ALL_PAID: [],
    };
    const plPending: SupabaseProject[] = [];
    const plDoneFundNeeded: SupabaseProject[] = [];
    const isInactive = (p: SupabaseProject) =>
      p.acquisition_status === 'LOST' || p.acquisition_status === 'CANCELLED';
    for (const p of projects) {
      const stage = paymentStageOf(p);
      c[stage]++;
      byStage[stage].push(p);
      if (stage === 'PL_PENDING' && !isInactive(p)) {
        plPending.push(p);
      } else if (stage === 'PL_COMPLETED' && p.acquisition_status === 'WON') {
        plDoneFundNeeded.push(p);
      }
    }
    // 가장 오래 멈춰있던 순(제출일 오래된 순) 표시 — 처리 압박이 높은 것부터
    const byOldest = (a: SupabaseProject, b: SupabaseProject) =>
      (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '');
    plPending.sort(byOldest);
    plDoneFundNeeded.sort(byOldest);
    for (const s of Object.keys(byStage) as PaymentStage[]) byStage[s].sort(byOldest);
    return { counts: c, byStage, plPending, plDoneFundNeeded };
  }, [projects]);
  const stageCounts = stageGroups.counts;

  // 클릭한 단계(또는 '전체')의 프로젝트를 보여주는 모달
  type DrillKey = PaymentStage | 'ALL';
  const [drillStage, setDrillStage] = useState<DrillKey | null>(null);
  const drillProjects: SupabaseProject[] = useMemo(() => {
    if (!drillStage) return [];
    if (drillStage === 'ALL') {
      return [...projects].sort((a, b) =>
        (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '')
      );
    }
    return stageGroups.byStage[drillStage];
  }, [drillStage, projects, stageGroups]);
  const drillLabel = drillStage === 'ALL' ? '전체 프로젝트' : drillStage ? PAYMENT_STAGE_LABEL[drillStage] : '';

  // 인센티브 지급 예정 — 회차 단위(1차/2차)로 펼쳐서 가까운 일자부터 정렬
  //   · 수주실패·대행종료 프로젝트 제외
  //   · 재원확정(fund_confirmed) 안 된 프로젝트 제외 — 재원이 확정돼야 실제 지급 일정으로 봄
  //   · 명시적 미지급(skipped)·이미 지급 완료(completed) 회차 제외
  //   · 지급예정일(planned date)이 오늘 이전이면 자동으로 사라지도록 미래만 포함
  //
  //  ※ 금액은 그 회차 멤버들의 first_amount(또는 second_amount) 단순 합. 0인 행은 effectivePhaseAmount 로 환산.
  const upcomingPayments = useMemo(() => {
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    type Row = {
      projectId: string;
      campaignName: string;
      phase: 1 | 2;
      plannedDate: string;
      total: number;
    };
    const rows: Row[] = [];
    for (const p of projects) {
      if (p.acquisition_status === 'LOST' || p.acquisition_status === 'CANCELLED') continue;
      if (!p.fund_confirmed) continue;

      const sumFirst = p.members.reduce((s, m) => s + effectivePhaseAmount(m, p, 1), 0);
      const sumSecond = p.members.reduce((s, m) => s + effectivePhaseAmount(m, p, 2), 0);

      // 1차
      if (
        !p.first_payment_completed &&
        !p.first_payment_skipped &&
        p.first_payment_date &&
        p.first_payment_date >= today &&
        sumFirst > 0
      ) {
        rows.push({
          projectId: p.id,
          campaignName: p.campaign_name,
          phase: 1,
          plannedDate: p.first_payment_date,
          total: sumFirst,
        });
      }
      // 2차
      if (
        !p.second_payment_completed &&
        !p.second_payment_skipped &&
        p.second_payment_date &&
        p.second_payment_date >= today &&
        sumSecond > 0
      ) {
        rows.push({
          projectId: p.id,
          campaignName: p.campaign_name,
          phase: 2,
          plannedDate: p.second_payment_date,
          total: sumSecond,
        });
      }
    }
    rows.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    return rows;
  }, [projects]);

  // 수주성공(WON) 내 신규/연장 분포
  const wonBreakdown = useMemo(() => {
    let neu = 0;
    let ext = 0;
    let other = 0;
    for (const p of projects) {
      if (p.acquisition_status !== 'WON') continue;
      const c = (p.category ?? '').trim();
      if (c === '신규') neu++;
      else if (c === '연장') ext++;
      else other++;
    }
    return { 신규: neu, 연장: ext, 기타: other };
  }, [projects]);

  // 기준일 — 사용자 로컬 기준 yyyy. mm. dd
  const baseDateLabel = useMemo(
    () =>
      new Date().toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    []
  );

  // 작성요청 버튼 — Slack 연동은 후속, 일단 클립보드 + 안내
  const [requestedId, setRequestedId] = useState<string | null>(null);
  function requestPL(p: SupabaseProject) {
    const text = `[PL 기여도 작성 요청] ${p.campaign_name} (ID: ${p.id})\n프로젝트 관리 → 해당 카드 → 멤버 기여도 입력 부탁드립니다.`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setRequestedId(p.id);
    setTimeout(() => setRequestedId(prev => (prev === p.id ? null : prev)), 1800);
  }

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
      label: '누적 1차 지급액',
      value: formatKRW(stats.totalFirstPaid),
      sub: formatKRWFull(stats.totalFirstPaid),
      icon: CreditCard,
      colorCls: 'text-indigo-700',
      bgCls: 'bg-indigo-50',
      iconBg: 'bg-indigo-100',
    },
    {
      label: '누적 2차 지급액',
      value: formatKRW(stats.totalSecondPaid),
      sub: formatKRWFull(stats.totalSecondPaid),
      icon: CreditCard,
      colorCls: 'text-violet-700',
      bgCls: 'bg-violet-50',
      iconBg: 'bg-violet-100',
    },
    {
      label: '지급 예정 총액',
      value: formatKRW(stats.totalPending),
      sub: formatKRWFull(stats.totalPending),
      icon: TrendingUp,
      colorCls: 'text-amber-700',
      bgCls: 'bg-amber-50',
      iconBg: 'bg-amber-100',
    },
    {
      label: '1차 지급 완료 비율',
      value: `${stats.firstPayRatio.toFixed(1)}%`,
      sub: `재원확정 ${stats.fundConfirmedCount}건 중 ${stats.firstPaidCount}건 완료 · 전체 ${stats.totalProjects}건`,
      icon: TrendingUp,
      colorCls: 'text-emerald-700',
      bgCls: 'bg-emerald-50',
      iconBg: 'bg-emerald-100',
    },
    {
      label: '1~2차 지급 완료 비율',
      value: `${stats.allPayRatio.toFixed(1)}%`,
      sub: `재원확정 ${stats.fundConfirmedCount}건 중 ${stats.allPaidCount}건 모두 완료 · 전체 ${stats.totalProjects}건`,
      icon: CheckCircle,
      colorCls: 'text-sky-700',
      bgCls: 'bg-sky-50',
      iconBg: 'bg-sky-100',
    },
  ];

  return (
    <div className="p-8 space-y-7 fade-in">
      <div>
        <h1 className="text-xl font-bold text-gray-900">수주인센티브 운영 현황 요약</h1>
        <p className="text-sm text-gray-400 mt-0.5">기준일 · {baseDateLabel}</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5" />
          <span>데이터 조회 실패: {error}</span>
        </div>
      )}
      {loading && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
          <Loader2 size={15} className="animate-spin" />
          데이터 불러오는 중...
        </div>
      )}

      {/* KPI 카드 6개 */}
      <div className="grid grid-cols-3 gap-4">
        {kpiCards.map(card => (
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

      {/* 진행 단계 + 수주여부 분포 */}
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-800">지급 단계별 진행</h2>
          </div>

          {/* 3 × 2 — 전체 / PL작성대기 / PL작성완료 / 재원확정완료 / 1차 지급완료 / 전체 지급완료 */}
          <div className="grid grid-cols-3 gap-3">
            <StageTile
              label="전체"
              value={stats.totalProjects}
              highlight
              onClick={() => setDrillStage('ALL')}
            />
            {(Object.keys(PAYMENT_STAGE_LABEL) as PaymentStage[]).map(stage => (
              <StageTile
                key={stage}
                label={PAYMENT_STAGE_LABEL[stage]}
                value={stageCounts[stage]}
                onClick={() => setDrillStage(stage)}
              />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-800">수주여부 분포</h2>
          </div>

          <div className="text-5xl font-bold text-blue-600 mb-1">
            {stats.totalProjects}
          </div>
          <div className="text-sm text-gray-400 mb-5">건 운영</div>

          <div className="space-y-3 mt-auto">
            {Object.entries(stats.stageCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => (
                <div key={key}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={clsx('w-2 h-2 rounded-full', acqDotColor(key))}
                      />
                      <span className="text-xs text-gray-500">
                        {ACQUISITION_LABEL[key] ?? key}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{count}건</span>
                  </div>
                  {key === 'WON' && count > 0 && (
                    <div className="ml-4 mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                        신규 {wonBreakdown.신규}건
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-300" />
                        연장 {wonBreakdown.연장}건
                      </span>
                      {wonBreakdown.기타 > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                          기타 {wonBreakdown.기타}건
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* 액션이 필요한 프로젝트 + 지급 예정 — 3 × 1 */}
      <div className="grid grid-cols-3 gap-5">
        <ProjectActionList
          icon={FileText}
          tone="amber"
          title="PL 작성대기"
          hint="멤버 기여도가 아직 입력되지 않은 프로젝트"
          projects={stageGroups.plPending}
          actionLabel="작성요청"
          actionIcon={Send}
          onAction={requestPL}
          requestedId={requestedId}
        />
        <ProjectActionList
          icon={Coins}
          tone="indigo"
          title="재원확정 필요"
          hint="수주성공 건 중 PL 작성 완료 건"
          projects={stageGroups.plDoneFundNeeded}
        />
        <UpcomingPaymentsList items={upcomingPayments} />
      </div>

      {/* 개인별 인센티브 지급 현황 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Users size={16} className="text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-800">개인·팀별 인센티브 지급 현황</h2>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={memberSortBy}
              onChange={e => setMemberSortBy(e.target.value as 'TOTAL' | 'PAID')}
              className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-md bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              title="정렬 기준"
            >
              <option value="TOTAL">지급 총액 기준</option>
              <option value="PAID">지급 완료액 기준</option>
            </select>
            <select
              value={memberScope}
              onChange={e => setMemberScope(e.target.value as 'ACTIVE' | 'ALL')}
              className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-md bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              title="명단 범위"
            >
              <option value="ACTIVE">퇴사자 제외</option>
              <option value="ALL">전체 명단</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['순위', '이름', '팀', '지급 완료액', '수령 예정액', '지급 총액'].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={clsx(
                        'pb-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide',
                        i < 3 ? 'text-left pr-4' : 'text-right pr-4 last:pr-0'
                      )}
                    >
                      {h}
                    </th>
                  )
                )}
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
                sortedMembers.slice(0, 20).map((m, i) => {
                  const total = m.total_paid + m.total_pending;
                  const paidRatio = total > 0 ? (m.total_paid / total) * 100 : 0;
                  return (
                    <tr
                      key={m.member_name}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 pr-4">
                        <span
                          className={clsx(
                            'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold',
                            m.is_team_account
                              ? 'bg-emerald-100 text-emerald-700'
                              : i === 0
                              ? 'bg-blue-600 text-white'
                              : i === 1
                              ? 'bg-blue-100 text-blue-700'
                              : i === 2
                              ? 'bg-gray-100 text-gray-600'
                              : 'text-gray-400'
                          )}
                        >
                          {m.is_team_account ? 'T' : i + 1}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-semibold text-gray-900">
                        {m.member_name}
                        {m.is_team_account && (
                          <span className="ml-1.5 text-[10px] text-emerald-700 font-medium">
                            [팀]
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-gray-500 text-xs">{m.team || '-'}</td>
                      <td className="py-3 pr-4 text-right">
                        <span className="text-blue-600 font-medium">
                          {formatKRWFull(m.total_paid)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className="text-amber-600">
                          {formatKRWFull(m.total_pending)}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
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

      {/* 단계 박스 드릴다운 모달 */}
      {drillStage && (
        <StageDrillModal
          title={drillLabel}
          projects={drillProjects}
          onClose={() => setDrillStage(null)}
        />
      )}
    </div>
  );
}

function acqDotColor(key: string): string {
  switch (key) {
    case 'WON':
      return 'bg-emerald-400';
    case 'LOST':
      return 'bg-red-400';
    case 'CANCELLED':
      return 'bg-gray-400';
    case 'PENDING':
    case 'REVIEWING':
      return 'bg-amber-400';
    case 'RESULT_PENDING':
      return 'bg-blue-400';
    default:
      return 'bg-gray-300';
  }
}

// 지급 단계 타일 — 동일 크기로 3×2 그리드에 배치 (클릭 시 해당 단계 프로젝트 모달)
function StageTile({
  label,
  value,
  highlight,
  onClick,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  onClick?: () => void;
}) {
  const clickable = !!onClick && value > 0;
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className={clsx(
        'rounded-lg border px-4 py-3 text-center transition-colors',
        highlight
          ? 'border-blue-100 bg-blue-50/60'
          : 'border-gray-100 bg-gray-50/50',
        clickable
          ? highlight
            ? 'hover:bg-blue-100 cursor-pointer'
            : 'hover:bg-gray-100 cursor-pointer'
          : 'cursor-default'
      )}
    >
      <p className={clsx('text-[11px] truncate', highlight ? 'text-blue-700' : 'text-gray-500')}>
        {label}
      </p>
      <p
        className={clsx(
          'text-xl font-bold mt-1',
          highlight ? 'text-blue-700' : 'text-gray-900'
        )}
      >
        {value}
        {highlight && <span className="text-xs font-semibold ml-0.5">건</span>}
      </p>
    </button>
  );
}

// 단계 박스 클릭 시 뜨는 프로젝트 리스트 모달
function StageDrillModal({
  title,
  projects,
  onClose,
}: {
  title: string;
  projects: SupabaseProject[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{projects.length}건 — 제출일 오래된 순</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {projects.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-10">해당 단계 프로젝트가 없습니다</div>
          ) : (
            <div className="space-y-1">
              {projects.map(p => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50/70 hover:border-gray-200 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-700">
                        {p.campaign_name}
                      </span>
                      {p.acquisition_status && (
                        <span
                          className={clsx(
                            'text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap',
                            p.acquisition_status === 'WON'
                              ? 'bg-emerald-100 text-emerald-700'
                              : p.acquisition_status === 'LOST'
                              ? 'bg-red-100 text-red-700'
                              : p.acquisition_status === 'CANCELLED'
                              ? 'bg-gray-200 text-gray-600'
                              : 'bg-amber-100 text-amber-700'
                          )}
                        >
                          {ACQUISITION_LABEL[p.acquisition_status] ?? p.acquisition_status}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{p.id}</span>
                      {p.team && <span>· {p.team}</span>}
                      {p.pl && <span>· PL {p.pl}</span>}
                      {p.submitted_at && <span>· 제출 {p.submitted_at}</span>}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-400 flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 액션이 필요한 프로젝트 리스트 (PL 작성대기 / 재원확정 필요)
function ProjectActionList({
  icon: Icon,
  tone,
  title,
  hint,
  projects,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
  requestedId,
}: {
  icon: typeof FileText;
  tone: 'amber' | 'indigo';
  title: string;
  hint: string;
  projects: SupabaseProject[];
  actionLabel?: string;
  actionIcon?: typeof Send;
  onAction?: (p: SupabaseProject) => void;
  requestedId?: string | null;
}) {
  const toneCls = tone === 'amber'
    ? { icon: 'text-amber-600', badge: 'bg-amber-100 text-amber-700' }
    : { icon: 'text-indigo-600', badge: 'bg-indigo-100 text-indigo-700' };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className={toneCls.icon} />
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        <span className={clsx('ml-auto text-xs font-semibold px-2 py-0.5 rounded-full', toneCls.badge)}>
          {projects.length}건
        </span>
      </div>
      <p className="text-[11px] text-gray-400 mb-4">{hint}</p>

      {projects.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400 py-10">
          현재 처리 대기 중인 건이 없습니다 ✓
        </div>
      ) : (
        <div className="flex-1 max-h-[320px] overflow-y-auto space-y-1.5 pr-1 -mr-1">
          {projects.map(p => (
            <div
              key={p.id}
              className="group flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50/70 hover:border-gray-200 transition-colors"
            >
              <Link
                href={`/projects/${p.id}`}
                className="flex-1 min-w-0"
                title={`${p.campaign_name} 상세 보기`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-700">
                    {p.campaign_name}
                  </span>
                  <ChevronRight
                    size={12}
                    className="text-gray-300 group-hover:text-blue-400 flex-shrink-0"
                  />
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span>{p.id}</span>
                  {p.team && <span>· {p.team}</span>}
                  {p.pl && <span>· PL {p.pl}</span>}
                  {p.submitted_at && <span>· 제출 {p.submitted_at}</span>}
                </div>
              </Link>
              {actionLabel && onAction && ActionIcon && (
                <button
                  onClick={() => onAction(p)}
                  className={clsx(
                    'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors',
                    requestedId === p.id
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  )}
                >
                  <ActionIcon size={12} />
                  {requestedId === p.id ? '복사됨' : actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 인센티브 지급 예정 — 회차 단위, 가까운 일자부터
function UpcomingPaymentsList({
  items,
}: {
  items: Array<{
    projectId: string;
    campaignName: string;
    phase: 1 | 2;
    plannedDate: string;
    total: number;
  }>;
}) {
  // 오늘 기준 D-N 계산용
  const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const daysBetween = (a: string, b: string) => {
    const dA = new Date(a + 'T00:00:00Z').getTime();
    const dB = new Date(b + 'T00:00:00Z').getTime();
    return Math.round((dA - dB) / 86400000);
  };
  const dLabel = (date: string) => {
    const d = daysBetween(date, todayKst);
    if (d === 0) return '오늘';
    if (d === 1) return '내일';
    if (d < 7) return `D-${d}`;
    if (d < 30) return `D-${d}`;
    return `D-${d}`;
  };
  const dTone = (date: string) => {
    const d = daysBetween(date, todayKst);
    if (d <= 7) return 'bg-rose-50 text-rose-700 border-rose-100';        // 임박 7일 내
    if (d <= 30) return 'bg-amber-50 text-amber-700 border-amber-100';    // 한 달 내
    return 'bg-gray-50 text-gray-600 border-gray-100';                    // 여유
  };
  // YYYY-MM-DD → MM.DD (공백 없이 — 좁은 박스 안에서 줄바꿈 방지)
  const shortDate = (s: string) => {
    if (s.length < 10) return s;
    return `${s.slice(5, 7)}.${s.slice(8, 10)}`;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock size={16} className="text-rose-500" />
        <h2 className="text-sm font-semibold text-gray-800">인센티브 지급 예정</h2>
        <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
          {items.length}건
        </span>
      </div>
      <p className="text-[11px] text-gray-400 mb-4">지급예정일 가까운 순 (지난 일자 자동 제외)</p>

      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400 py-10">
          예정된 지급이 없습니다
        </div>
      ) : (
        <div className="flex-1 max-h-[320px] overflow-y-auto space-y-1.5 pr-1 -mr-1">
          {items.map((r, i) => (
            <Link
              key={`${r.projectId}-${r.phase}-${i}`}
              href={`/projects/${r.projectId}`}
              className="group flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-100 hover:bg-gray-50/70 hover:border-gray-200 transition-colors"
            >
              {/* 좌측 — 날짜 박스 (시각적으로 가장 먼저 읽히도록) */}
              <div
                className={clsx(
                  'flex-shrink-0 w-16 rounded-md border px-1.5 py-1 text-center leading-tight whitespace-nowrap',
                  dTone(r.plannedDate)
                )}
              >
                <div className="text-[10px] font-semibold opacity-80">
                  {dLabel(r.plannedDate)}
                </div>
                <div className="text-sm font-bold tabular-nums">
                  {shortDate(r.plannedDate)}
                </div>
              </div>

              {/* 중앙 — 캠페인명 + 회차 배지 + 연도 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-700">
                    {r.campaignName}
                  </span>
                  <span
                    className={clsx(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap',
                      r.phase === 1
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-emerald-100 text-emerald-700'
                    )}
                  >
                    {r.phase}차
                  </span>
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5 tabular-nums">
                  {r.plannedDate}
                </div>
              </div>

              {/* 우측 — 금액 */}
              <div className="text-right whitespace-nowrap">
                <span className="text-sm font-semibold text-gray-800 tabular-nums">
                  {formatKRWFull(r.total)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
