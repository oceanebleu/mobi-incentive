// 프로젝트 단계별 상태
export type ProjectStatus =
  | 'PL_PENDING'      // PL 작성대기
  | 'PL_COMPLETED'    // PL 작성완료
  | 'FUND_CONFIRMED'  // 재원확정완료
  | 'FIRST_PENDING'   // 1차지급대기
  | 'FIRST_PAID'      // 1차지급완료
  | 'SECOND_PENDING'  // 2차지급대기
  | 'SECOND_PAID'     // 2차지급완료
  | 'ALL_PAID';       // 전체지급완료

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  PL_PENDING: 'PL 작성대기',
  PL_COMPLETED: 'PL 작성완료',
  FUND_CONFIRMED: '재원확정완료',
  FIRST_PENDING: '1차지급대기',
  FIRST_PAID: '1차지급완료',
  SECOND_PENDING: '2차지급대기',
  SECOND_PAID: '2차지급완료',
  ALL_PAID: '전체지급완료',
};

// 수주여부
export type AcquisitionStatus = 'PENDING' | 'WON' | 'LOST';

export const ACQUISITION_LABELS: Record<AcquisitionStatus, string> = {
  PENDING: '진행중',
  WON: '수주성공',
  LOST: '수주실패',
};

export const ACQUISITION_ORDER: AcquisitionStatus[] = ['PENDING', 'WON', 'LOST'];

export const STATUS_ORDER: ProjectStatus[] = [
  'PL_PENDING',
  'PL_COMPLETED',
  'FUND_CONFIRMED',
  'FIRST_PENDING',
  'FIRST_PAID',
  'SECOND_PENDING',
  'SECOND_PAID',
  'ALL_PAID',
];

// 프로젝트 참여 멤버
export interface ProjectMember {
  memberId: string;
  memberName: string;
  contribution: number; // % (예: 30 = 30%)
}

// 수주인센티브 프로젝트
export interface Project {
  id: string;
  campaignName: string;          // 캠페인명
  committeeSheetLink: string;    // 운영위원회 양식시트 링크
  rValue: number;                // R값 (원 단위)
  commission: number;            // 수수료 (소수: 0.15 = 15%)
  team: string;                  // 담당팀
  pl: string;                    // PL 담당자명
  submittedAt: string;           // 제출일 (ISO 날짜 문자열)
  year: number;                  // 연도
  status: ProjectStatus;
  acquisitionStatus?: AcquisitionStatus; // 수주여부 (수주성공/수주실패/진행중)
  incentiveRate: number;         // 인센티브율 (1 또는 2)
  incentiveFund: number;         // 인센티브 재원 (계산값, 원 단위)
  firstPaymentDate?: string;     // 1차 지급예정일
  firstPaymentRatio: number;     // 1차 지급비율 (기본값 60)
  secondPaymentRatio: number;    // 2차 지급비율 (기본값 40)
  secondPaymentDate?: string;    // 2차 지급예정일
  firstPaymentCompleted: boolean;
  secondPaymentCompleted: boolean;
  members: ProjectMember[];      // 참여 멤버 및 기여도
  slackNotified: boolean;        // Slack 알림 발송 여부
  note?: string;                 // 비고
}

// 구성원
export interface Member {
  id: string;
  name: string;
  team: string;
  lastWorkDate?: string; // YYYY-MM-DD — 마지막 근무일 (퇴사자만, 시트에서 보강)
}

// 개인별 인센티브 집계
export interface MemberPaymentSummary {
  memberId: string;
  memberName: string;
  team: string;
  totalPaid: number;
  totalPending: number;
  firstPaymentTotal: number;
  secondPaymentTotal: number;
  yearlyBreakdown: Record<number, { paid: number; pending: number }>;
  projects: {
    projectId: string;
    campaignName: string;
    year: number;
    contribution: number;
    firstPayment: number;
    secondPayment: number;
    firstPaid: boolean;
    secondPaid: boolean;
    /** 마지막 근무일 이후 지급예정 → 카운트 제외됨 */
    firstExcluded?: boolean;
    secondExcluded?: boolean;
  }[];
  /** 마지막 근무일 이후 지급분 제외 카운트 (UI 안내용) */
  excludedCount?: number;
}

// 대시보드 통계
export interface DashboardStats {
  totalPaid: number;
  totalFirstPaid: number;
  totalSecondPaid: number;
  firstPayRatio: number;
  secondPayRatio: number;
  allPayRatio: number;
  totalProjects: number;
  stageCounts: Record<ProjectStatus, number>;
}
