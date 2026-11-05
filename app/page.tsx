'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  Wallet,
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
import { effectivePhaseAmount, isRetiredMember, type SupabaseProject } from '@/lib/incentive-data';
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
import { canManageProjects, type UserRole } from '@/lib/roles';

export default function DashboardPage() {
  const { projects, loading, error, refresh } = useIncentiveData();
  const { lastWorkDateByName, teamByName, employeeIdByName, statusByName } =
    useUserDirectory();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as UserRole | undefined;
  // 경영진(EXEC) 은 대시보드를 열람할 수 있지만 'PL 작성요청' 같은 운영 액션은 ADMIN 전용
  const canTakeAction = canManageProjects(role);

  // Creative.Lab 실지급 합계 — 월별 인센티브 실지급액 페이지에 입력된 금액
  const [creativeLabPaidTotal, setCreativeLabPaidTotal] = useState(0);
  useEffect(() => {
    fetch(`/api/payroll/creative-lab?_=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (!j || !Array.isArray(j.items)) return;
        const sum = j.items.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
        setCreativeLabPaidTotal(sum);
      })
      .catch(() => {});
  }, []);

  // 개인별 지급 관리 페이지와 동일 정책으로 합산 (퇴사자 제외 + 마지막 근무일 이후 excluded)
  // + Creative.Lab 실지급 분리 정책 적용
  const stats = useMemo(
    () =>
      getDashboardStatsV2(
        projects,
        { lastWorkDateByName, statusByName },
        { paidTotal: creativeLabPaidTotal }
      ),
    [projects, lastWorkDateByName, statusByName, creativeLabPaidTotal]
  );
  const memberSummaries = useMemo(
    () =>
      calcMemberSummariesV2(projects, {
        lastWorkDateByName,
        teamByName,
        employeeIdByName,
        statusByName,
        creativeLabPaidTotal,
      }),
    [projects, lastWorkDateByName, teamByName, employeeIdByName, statusByName, creativeLabPaidTotal]
  );

  // 개인/팀별 지급 현황 — 정렬 기준 & 명단 필터
  type SortBy = 'TOTAL' | 'PAID';
  type ScopeBy = 'ACTIVE' | 'ALL';
  const [memberSortBy, setMemberSortBy] = useState<SortBy>('TOTAL');
  const [memberScope, setMemberScope] = useState<ScopeBy>('ACTIVE');

  const sortedMembers = useMemo(() => {
    let list = [...memberSummaries].filter(m => m.total_paid + m.total_pending > 0);
    if (memberScope === 'ACTIVE') {
      // 퇴사자 제외 — status==='퇴사' 또는 last_work_date < 오늘
      list = list.filter(m => !isRetiredMember(m));
    }
    list.sort((a, b) => {
      if (memberSortBy === 'PAID') return b.total_paid - a.total_paid;
      // 기본 = TOTAL (지급 총액 = 완료 + 예정)
      return b.total_paid + b.total_pending - (a.total_paid + a.total_pending);
    });
    return list;
  }, [memberSummaries, memberSortBy, memberScope]);

  // 단계별 카운트 + 프로젝트 분류
  //   · 수주실패·대행종료 프로젝트는 단계별 보드에서 일반적으로 제외 (운영 진행 의미)
  //   · 단, 1차 지급 완료 후 대행종료된 건은 1차 지급 완료 단계 리스트에 포함 — 이미 지급이 발생했으므로
  //   · 재원확정 필요 리스트는 추가로 수주성공(WON) 한정
  const stageGroups = useMemo(() => {
    const c: Record<PaymentStage, number> = {
      PL_PENDING: 0,
      PL_COMPLETED: 0,
      FUND_CONFIRMED: 0,
      FIRST_PAID: 0,
      ALL_PAID: 0,
    };
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
    // 비활성이라도 '1차 지급 완료' 단계까지 진행됐다면 단계별 보드에는 노출
    const isInactiveButPaidAtLeastOnce = (p: SupabaseProject) =>
      isInactive(p) &&
      (p.first_payment_completed || p.second_payment_completed);
    let activeTotal = 0;
    for (const p of projects) {
      if (isInactive(p) && !isInactiveButPaidAtLeastOnce(p)) continue;
      // 기본 분류 — paymentStageOf 는 second_payment_skipped 도 done 취급해 ALL_PAID 로 보내므로,
      // '1차만 실제로 지급되고 그 후 대행종료된 건' 은 1차 지급 완료 단계로 강제 보정
      let stage = paymentStageOf(p);
      if (
        p.acquisition_status === 'CANCELLED' &&
        p.first_payment_completed &&
        !p.second_payment_completed
      ) {
        stage = 'FIRST_PAID';
      }
      c[stage]++;
      byStage[stage].push(p);
      activeTotal++;
      if (stage === 'PL_PENDING') {
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
    return { counts: c, byStage, plPending, plDoneFundNeeded, activeTotal };
  }, [projects]);
  const stageCounts = stageGroups.counts;

  // 클릭한 단계(또는 '전체')의 프로젝트를 보여주는 모달 — 모든 단계 활성만
  type DrillKey = PaymentStage | 'ALL';
  const [drillStage, setDrillStage] = useState<DrillKey | null>(null);
  const drillProjects: SupabaseProject[] = useMemo(() => {
    if (!drillStage) return [];
    if (drillStage === 'ALL') {
      // 활성 프로젝트만 — 타일 합과 일치
      const all: SupabaseProject[] = [];
      for (const s of Object.keys(stageGroups.byStage) as PaymentStage[]) {
        all.push(...stageGroups.byStage[s]);
      }
      return all.sort((a, b) =>
        (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '')
      );
    }
    return stageGroups.byStage[drillStage];
  }, [drillStage, stageGroups]);
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

  // 작성요청 버튼 — 수주인센티브운영봇으로 PL 본인 Slack DM 발송
  //   상태값: 'idle' | 'sending' | 'sent' | 'error'
  const [requestState, setRequestState] = useState<Record<string, 'sending' | 'sent' | 'error'>>(
    {}
  );
  const [requestError, setRequestError] = useState<string | null>(null);

  async function requestPL(p: SupabaseProject) {
    const pl = p.pl?.trim();
    if (!pl) {
      setRequestError(`"${p.campaign_name}" — PL 정보가 비어있어 발송할 수 없습니다.`);
      return;
    }
    if (!confirm(`PL "${pl}" 님에게 "${p.campaign_name}" 작성요청 DM 을 발송할까요?`)) return;

    setRequestError(null);
    setRequestState(prev => ({ ...prev, [p.id]: 'sending' }));
    try {
      const res = await fetch('/api/notifications/pl-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: p.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = [j?.error, j?.hint].filter(Boolean).join(' — ');
        throw new Error(msg || `HTTP ${res.status}`);
      }
      setRequestState(prev => ({ ...prev, [p.id]: 'sent' }));
      // 발송 시각이 projects 데이터에 반영되도록 재조회 — 행에 "요청완료 yyyy.mm.dd HH:MM" 노출
      refresh();
      // 성공 표시는 잠시 유지 후 제거 (다음 작성요청을 다시 보낼 수 있도록)
      setTimeout(() => {
        setRequestState(prev => {
          const next = { ...prev };
          if (next[p.id] === 'sent') delete next[p.id];
          return next;
        });
      }, 3500);
    } catch (e: any) {
      setRequestState(prev => ({ ...prev, [p.id]: 'error' }));
      setRequestError(e?.message ?? '발송 실패');
      setTimeout(() => {
        setRequestState(prev => {
          const next = { ...prev };
          if (next[p.id] === 'error') delete next[p.id];
          return next;
        });
      }, 3500);
    }
  }

  // 누적 지급 완료액 = 1차 + 2차. 히어로 카드에서 구성비를 함께 보여준다.
  const paidSplit = (() => {
    const total = stats.totalFirstPaid + stats.totalSecondPaid;
    if (total <= 0) return { first: 0, second: 0 };
    return {
      first: (stats.totalFirstPaid / total) * 100,
      second: (stats.totalSecondPaid / total) * 100,
    };
  })();

  // 히어로 오른쪽에 들어갈 보조 지표 — 금액 3종 + 완료 비율 2종
  const kpiRows = (() => {
    const cancelled = stats.firstPaidThenCancelledCount;
    const cancelledPct =
      stats.totalProjects > 0 ? ((cancelled / stats.totalProjects) * 100).toFixed(1) : '0.0';
    return {
      amounts: [
        {
          label: '누적 1차 지급액',
          value: formatKRW(stats.totalFirstPaid),
          sub: formatKRWFull(stats.totalFirstPaid),
        },
        {
          label: '누적 2차 지급액',
          value: formatKRW(stats.totalSecondPaid),
          sub: formatKRWFull(stats.totalSecondPaid),
        },
        {
          label: '지급 예정 총액',
          value: formatKRW(stats.totalPending),
          sub: formatKRWFull(stats.totalPending),
        },
      ],
      ratios: [
        {
          label: '1차 지급 완료 비율',
          value: `${stats.firstPayRatio.toFixed(1)}%`,
          sub: `재원확정 ${stats.fundConfirmedCount}건 중 ${stats.firstPaidCount}건 완료`,
          warn: cancelled > 0 ? `1차 지급 후 대행종료 ${cancelled}건 (${cancelledPct}%)` : null,
          done: true,
        },
        {
          label: '1~2차 지급 완료 비율',
          value: `${stats.allPayRatio.toFixed(1)}%`,
          sub: `재원확정 ${stats.fundConfirmedCount}건 중 ${stats.allPaidCount}건 모두 완료`,
          warn: null,
          done: false,
        },
      ],
    };
  })();

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

      {/* 요약 — 좌: 누적 지급 완료액 강조 / 우: 보조 지표를 텍스트로 */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-7 py-6">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-stretch lg:gap-8">
          {/* 좌 — 핵심 지표 */}
          <div className="lg:w-[340px] lg:flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-blue-100 p-2">
                <Wallet size={16} className="text-blue-700" />
              </div>
              <span className="text-sm font-semibold text-gray-600">누적 지급 완료액</span>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-1">
              <span className="text-[44px] leading-none font-bold tracking-tight text-blue-700">
                {formatKRW(stats.totalPaid)}
              </span>
              <span className="text-sm text-gray-400 pb-1">{formatKRWFull(stats.totalPaid)}</span>
            </div>

            {/* 1차 / 2차 구성비 */}
            {stats.totalPaid > 0 && (
              <div className="mt-5">
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
                  <div className="bg-blue-600" style={{ width: `${paidSplit.first}%` }} />
                  <div className="bg-blue-300" style={{ width: `${paidSplit.second}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                    1차 {paidSplit.first.toFixed(1)}%
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-300" />
                    2차 {paidSplit.second.toFixed(1)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 세로 구분선 — 좁은 화면에서는 가로선 */}
          <div className="border-t border-blue-100 lg:border-l lg:border-t-0" />

          {/* 우 — 보조 지표 */}
          <div className="flex-1 min-w-0 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {kpiRows.amounts.map(r => (
              <div key={r.label} className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-gray-500 whitespace-nowrap">{r.label}</span>
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className="text-base font-bold text-blue-700">{r.value}</span>
                  <span className="text-[11px] text-gray-400 truncate">{r.sub}</span>
                </span>
              </div>
            ))}
            {kpiRows.ratios.map(r => (
              <div key={r.label} className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-gray-500 whitespace-nowrap">{r.label}</span>
                <span className="text-right min-w-0">
                  <span
                    className={clsx(
                      'text-base font-bold',
                      r.done ? 'text-emerald-700' : 'text-blue-700'
                    )}
                  >
                    {r.value}
                  </span>
                  <span className="block text-[11px] text-gray-400">{r.sub}</span>
                  {r.warn && <span className="block text-[11px] text-red-600">{r.warn}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 진행 단계 + 수주여부 분포 */}
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-800">단계별 현황</h2>
          </div>

          {/* 3 × 2 — 전체(활성) / PL작성대기 / PL작성완료 / 재원확정완료 / 1차 지급완료 / 전체 지급완료
             수주실패·대행종료 제외한 활성 운영 진행 보드 */}
          <div className="grid grid-cols-3 gap-3">
            <StageTile
              label="전체"
              value={stageGroups.activeTotal}
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
          tone="pl"
          title="PL 작성대기"
          hint="멤버 기여도가 아직 입력되지 않은 프로젝트"
          projects={stageGroups.plPending}
          /* 경영진(EXEC) 은 열람만 — '작성요청' 버튼 숨김 (실수 방지) */
          actionLabel={canTakeAction ? '작성요청' : undefined}
          actionIcon={canTakeAction ? Send : undefined}
          onAction={canTakeAction ? requestPL : undefined}
          requestState={requestState}
          errorMessage={requestError}
        />
        <ProjectActionList
          icon={Coins}
          tone="fund"
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
                        <span className="text-blue-600">
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

/** ISO timestamp → "yyyy.mm.dd HH:MM" (KST, 24h) */
function formatRequestedAt(iso: string): string {
  const t = new Date(iso);
  // KST 표기 — UTC+9 시프트 후 UTC 메서드로 읽음 (서버/브라우저 timezone 무관하게 일관)
  const k = new Date(t.getTime() + 9 * 60 * 60 * 1000);
  const y = k.getUTCFullYear();
  const m = String(k.getUTCMonth() + 1).padStart(2, '0');
  const d = String(k.getUTCDate()).padStart(2, '0');
  const hh = String(k.getUTCHours()).padStart(2, '0');
  const mm = String(k.getUTCMinutes()).padStart(2, '0');
  return `${y}.${m}.${d} ${hh}:${mm}`;
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
      return 'bg-blue-400';
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
                              : 'bg-blue-100 text-blue-700'
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
  requestState,
  errorMessage,
}: {
  icon: typeof FileText;
  tone: 'pl' | 'fund';  // 섹션 구분용 (색은 동일, 의미만 구분)
  title: string;
  hint: string;
  projects: SupabaseProject[];
  actionLabel?: string;
  actionIcon?: typeof Send;
  onAction?: (p: SupabaseProject) => void;
  requestState?: Record<string, 'sending' | 'sent' | 'error'>;
  errorMessage?: string | null;
}) {
  // 두 섹션 모두 '처리 대기 중인 액션' — 색으로 구분하지 않고 파랑으로 통일
  const toneCls = { icon: 'text-blue-600', badge: 'bg-blue-100 text-blue-700' };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className={toneCls.icon} />
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        <span className={clsx('ml-auto text-xs font-semibold px-2 py-0.5 rounded-full', toneCls.badge)}>
          {projects.length}건
        </span>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">{hint}</p>

      {errorMessage && (
        <div className="mb-2 px-2.5 py-1.5 rounded-md bg-red-50 border border-red-100 text-[11px] text-red-700 break-words">
          {errorMessage}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400 py-10">
          현재 처리 대기 중인 건이 없습니다 ✓
        </div>
      ) : (
        <div className="flex-1 max-h-[320px] overflow-y-auto space-y-1.5 pr-1 -mr-1">
          {projects.map(p => {
            const st = requestState?.[p.id];
            return (
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
                    {p.pl_request_sent_at && (
                      <span className="text-emerald-600 font-medium">
                        · {formatRequestedAt(p.pl_request_sent_at)} 요청완료
                      </span>
                    )}
                  </div>
                </Link>
                {actionLabel && onAction && ActionIcon && (
                  <button
                    onClick={() => onAction(p)}
                    disabled={st === 'sending'}
                    className={clsx(
                      'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors',
                      st === 'sent'
                        ? 'bg-emerald-100 text-emerald-700'
                        : st === 'error'
                        ? 'bg-red-100 text-red-700'
                        : st === 'sending'
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    )}
                  >
                    {st === 'sending' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <ActionIcon size={12} />
                    )}
                    {st === 'sending'
                      ? '발송중'
                      : st === 'sent'
                      ? '발송완료'
                      : st === 'error'
                      ? '실패'
                      : actionLabel}
                  </button>
                )}
              </div>
            );
          })}
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
    if (d <= 7) return 'bg-red-50 text-red-700 border-red-100';     // 임박 7일 내
    if (d <= 30) return 'bg-blue-50 text-blue-700 border-blue-100'; // 한 달 내
    return 'bg-gray-50 text-gray-600 border-gray-100';              // 여유
  };
  // YYYY-MM-DD → MM.DD (공백 없이 — 좁은 박스 안에서 줄바꿈 방지)
  const shortDate = (s: string) => {
    if (s.length < 10) return s;
    return `${s.slice(5, 7)}.${s.slice(8, 10)}`;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock size={16} className="text-red-500" />
        <h2 className="text-sm font-semibold text-gray-800">인센티브 지급 예정</h2>
        <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
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
                      // 1차/2차는 회차 구분 — 같은 파랑 계열의 농도로만 구분
                      r.phase === 1
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-blue-100 text-blue-800'
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
