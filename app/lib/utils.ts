import { Project, Member, MemberPaymentSummary, DashboardStats, ProjectStatus } from './types';

// 인센티브 재원 계산: R값 × 수수료 × rate%
export function calcIncentiveFund(rValue: number, commission: number, rate: number): number {
  return Math.round(rValue * commission * (rate / 100));
}

// 특정 멤버의 1차 지급액 계산
export function calcMemberFirstPayment(project: Project, contribution: number): number {
  const firstTotal = project.incentiveFund * (project.firstPaymentRatio / 100);
  return Math.round(firstTotal * (contribution / 100));
}

// 특정 멤버의 2차 지급액 계산
export function calcMemberSecondPayment(project: Project, contribution: number): number {
  const secondTotal = project.incentiveFund * (project.secondPaymentRatio / 100);
  return Math.round(secondTotal * (contribution / 100));
}

// 금액 축약 포맷 (억/만 단위)
export function formatKRW(amount: number): string {
  if (amount >= 100_000_000) {
    const eok = amount / 100_000_000;
    return `${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(1)}억`;
  }
  if (amount >= 10_000) {
    const man = Math.round(amount / 10_000);
    return `${man.toLocaleString()}만`;
  }
  return amount.toLocaleString() + '원';
}

// 금액 전체 포맷 (원 단위 콤마)
export function formatKRWFull(amount: number): string {
  return amount.toLocaleString() + '원';
}

// 날짜 포맷 (YYYY-MM-DD → YYYY.MM.DD)
export function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  return dateStr.replace(/-/g, '.');
}

// 수수료 퍼센트 포맷
export function formatCommission(commission: number): string {
  return `${(commission * 100).toFixed(1)}%`;
}

// 개인별 인센티브 집계 계산
export function calcMemberSummaries(
  projects: Project[],
  members: Member[]
): MemberPaymentSummary[] {
  const summaryMap = new Map<string, MemberPaymentSummary>();

  // 등록된 멤버 초기화
  for (const m of members) {
    summaryMap.set(m.id, {
      memberId: m.id,
      memberName: m.name,
      team: m.team,
      totalPaid: 0,
      totalPending: 0,
      firstPaymentTotal: 0,
      secondPaymentTotal: 0,
      yearlyBreakdown: {},
      projects: [],
    });
  }

  // 프로젝트별 지급액 집계
  for (const project of projects) {
    // 재원이 확정된 단계부터만 집계
    const fundedStatuses: ProjectStatus[] = [
      'FUND_CONFIRMED', 'FIRST_PENDING', 'FIRST_PAID',
      'SECOND_PENDING', 'SECOND_PAID', 'ALL_PAID',
    ];
    if (!fundedStatuses.includes(project.status)) continue;

    for (const pm of project.members) {
      if (!summaryMap.has(pm.memberId)) {
        summaryMap.set(pm.memberId, {
          memberId: pm.memberId,
          memberName: pm.memberName,
          team: '',
          totalPaid: 0,
          totalPending: 0,
          firstPaymentTotal: 0,
          secondPaymentTotal: 0,
          yearlyBreakdown: {},
          projects: [],
        });
      }

      const summary = summaryMap.get(pm.memberId)!;
      const firstPayment = calcMemberFirstPayment(project, pm.contribution);
      const secondPayment = calcMemberSecondPayment(project, pm.contribution);

      const paid =
        (project.firstPaymentCompleted ? firstPayment : 0) +
        (project.secondPaymentCompleted ? secondPayment : 0);
      const pending =
        (!project.firstPaymentCompleted ? firstPayment : 0) +
        (!project.secondPaymentCompleted ? secondPayment : 0);

      summary.totalPaid += paid;
      summary.totalPending += pending;
      if (project.firstPaymentCompleted) summary.firstPaymentTotal += firstPayment;
      if (project.secondPaymentCompleted) summary.secondPaymentTotal += secondPayment;

      if (!summary.yearlyBreakdown[project.year]) {
        summary.yearlyBreakdown[project.year] = { paid: 0, pending: 0 };
      }
      summary.yearlyBreakdown[project.year].paid += paid;
      summary.yearlyBreakdown[project.year].pending += pending;

      summary.projects.push({
        projectId: project.id,
        campaignName: project.campaignName,
        year: project.year,
        contribution: pm.contribution,
        firstPayment,
        secondPayment,
        firstPaid: project.firstPaymentCompleted,
        secondPaid: project.secondPaymentCompleted,
      });
    }
  }

  return Array.from(summaryMap.values());
}

// 대시보드 통계 계산
export function getDashboardStats(projects: Project[]): DashboardStats {
  const fundedStatuses: ProjectStatus[] = [
    'FUND_CONFIRMED', 'FIRST_PENDING', 'FIRST_PAID',
    'SECOND_PENDING', 'SECOND_PAID', 'ALL_PAID',
  ];
  const fundConfirmedOrBeyond = projects.filter(p => fundedStatuses.includes(p.status));
  const firstPaidProjects = projects.filter(p => p.firstPaymentCompleted);
  const secondPaidProjects = projects.filter(p => p.secondPaymentCompleted);
  const allPaidProjects = projects.filter(p => p.firstPaymentCompleted && p.secondPaymentCompleted);

  const totalFirstPaid = firstPaidProjects.reduce(
    (sum, p) => sum + Math.round(p.incentiveFund * (p.firstPaymentRatio / 100)), 0
  );
  const totalSecondPaid = secondPaidProjects.reduce(
    (sum, p) => sum + Math.round(p.incentiveFund * (p.secondPaymentRatio / 100)), 0
  );
  const totalPaid = totalFirstPaid + totalSecondPaid;

  const base = fundConfirmedOrBeyond.length;
  const firstPayRatio = base > 0 ? (firstPaidProjects.length / base) * 100 : 0;
  const secondPayRatio = base > 0 ? (secondPaidProjects.length / base) * 100 : 0;
  const allPayRatio = base > 0 ? (allPaidProjects.length / base) * 100 : 0;

  const statuses: ProjectStatus[] = [
    'PL_PENDING', 'PL_COMPLETED', 'FUND_CONFIRMED',
    'FIRST_PENDING', 'FIRST_PAID', 'SECOND_PENDING', 'SECOND_PAID', 'ALL_PAID',
  ];
  const stageCounts = Object.fromEntries(
    statuses.map(s => [s, projects.filter(p => p.status === s).length])
  ) as Record<ProjectStatus, number>;

  return {
    totalPaid,
    totalFirstPaid,
    totalSecondPaid,
    firstPayRatio,
    secondPayRatio,
    allPayRatio,
    totalProjects: projects.length,
    stageCounts,
  };
}

// 고유 ID 생성 (uuid 대신 간단한 버전)
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
