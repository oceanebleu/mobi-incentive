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
} from 'lucide-react';
import type { SupabaseProject } from '@/lib/incentive-data';
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

  const sortedMembers = useMemo(
    () =>
      [...memberSummaries]
        .filter(m => m.total_paid + m.total_pending > 0)
        .sort(
          (a, b) =>
            b.total_paid + b.total_pending - (a.total_paid + a.total_pending)
        ),
    [memberSummaries]
  );

  // 단계별 카운트 + 프로젝트 분류 (PL 작성대기 / 재원확정 필요 리스트용)
  const stageGroups = useMemo(() => {
    const c: Record<PaymentStage, number> = {
      PL_PENDING: 0,
      PL_COMPLETED: 0,
      FUND_CONFIRMED: 0,
      FIRST_PAID: 0,
      ALL_PAID: 0,
    };
    const plPending: SupabaseProject[] = [];
    const plDoneFundNeeded: SupabaseProject[] = [];
    for (const p of projects) {
      const stage = paymentStageOf(p);
      c[stage]++;
      if (stage === 'PL_PENDING') plPending.push(p);
      else if (stage === 'PL_COMPLETED') plDoneFundNeeded.push(p);
    }
    // 가장 오래 멈춰있던 순(제출일 오래된 순) 표시 — 처리 압박이 높은 것부터
    const byOldest = (a: SupabaseProject, b: SupabaseProject) =>
      (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '');
    plPending.sort(byOldest);
    plDoneFundNeeded.sort(byOldest);
    return { counts: c, plPending, plDoneFundNeeded };
  }, [projects]);
  const stageCounts = stageGroups.counts;

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
      sub: `위원회 진행 ${stats.fundConfirmedCount}건 중 ${stats.firstPaidCount}건`,
      icon: TrendingUp,
      colorCls: 'text-emerald-700',
      bgCls: 'bg-emerald-50',
      iconBg: 'bg-emerald-100',
    },
    {
      label: '1~2차 지급 완료 비율',
      value: `${stats.allPayRatio.toFixed(1)}%`,
      sub: `위원회 진행 ${stats.fundConfirmedCount}건 중 총 ${stats.allPaidCount}건`,
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
            <span className="ml-auto text-xs text-gray-400">전체 {stats.totalProjects}건</span>
          </div>

          <div className="grid grid-cols-5 gap-3">
            {(Object.keys(PAYMENT_STAGE_LABEL) as PaymentStage[]).map(stage => (
              <div
                key={stage}
                className="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-3 text-center"
              >
                <p className="text-[11px] text-gray-500 truncate">{PAYMENT_STAGE_LABEL[stage]}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{stageCounts[stage]}</p>
              </div>
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
                <div key={key} className="flex items-center justify-between">
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
              ))}
          </div>
        </div>
      </div>

      {/* 액션이 필요한 프로젝트 — PL 작성대기 / 재원확정 필요 */}
      <div className="grid grid-cols-2 gap-5">
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
          hint="PL 작성 완료 — 위원회 재원확정만 남음"
          projects={stageGroups.plDoneFundNeeded}
        />
      </div>

      {/* 개인별 인센티브 지급 현황 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Users size={16} className="text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-800">개인·팀별 인센티브 지급 현황</h2>
          <span className="ml-auto text-xs text-gray-400">지급 총액 기준 내림차순</span>
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
