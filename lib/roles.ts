// ─────────────────────────────────────────────────────────────
// lib/roles.ts
// 신규 역할 체계 (Supabase users 테이블 기반)
//   - EXEC    : 경영진 (대시보드/프로젝트/멤버 접근. 운영 도구는 가림)
//   - ADMIN   : 관리자 (HRBP팀 / C.O1그룹) — 모든 메뉴 접근
//   - PAYROLL : 급여 담당 (HRM·GA·CM팀) — 월별 인센티브 실지급액 페이지만 접근
//   - NORMAL  : 일반 — 앱 접근 불가
//   - NONE    : 시트에 없거나 퇴사 — 차단
// ─────────────────────────────────────────────────────────────

export type UserRole = 'EXEC' | 'ADMIN' | 'PAYROLL' | 'NORMAL' | 'NONE';

export const ROLE_LABELS: Record<UserRole, string> = {
  EXEC: '경영진',
  ADMIN: '관리자',
  PAYROLL: '급여담당',
  NORMAL: '일반',
  NONE: '권한없음',
};

// 부트스트랩용 슈퍼관리자 (Supabase에 데이터가 없어도 ADMIN 권한으로 진입 가능)
// 환경변수: SUPER_ADMIN_EMAILS=foo@mobidays.com,bar@mobidays.com
export function isSuperAdmin(email: string): boolean {
  const raw = process.env.SUPER_ADMIN_EMAILS ?? '';
  const list = raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

// 테스트용 계정 — 어떤 역할로도 자유 전환 가능, 시트 동기화로 역할이 덮어쓰여지지 않음
//   사용자관리에서 EXEC/ADMIN/PAYROLL/NORMAL 어떤 값으로 저장하든 보존됨
const TEST_ACCOUNT_EMAILS = ['recruit@mobidays.com'];
export function isTestAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  return TEST_ACCOUNT_EMAILS.includes(email.toLowerCase());
}

// 앱 자체에 진입 가능한 역할 (사이드바 메뉴 보임)
export const ALLOWED_ROLES: UserRole[] = ['EXEC', 'ADMIN', 'PAYROLL'];

export function canAccessApp(role?: UserRole | null): boolean {
  return !!role && ALLOWED_ROLES.includes(role);
}

// '사용자관리' / '제안 자료 아카이브' / '데이터 Import' 탭 접근 권한
export function canManageUsers(role?: UserRole | null): boolean {
  return role === 'ADMIN' || role === 'EXEC';
}

// '프로젝트 관리' 의 편집/삭제/추가 권한 — ADMIN 전용
//   경영진(EXEC) 은 프로젝트를 열람만 가능, 데이터 수정 불가
export function canManageProjects(role?: UserRole | null): boolean {
  return role === 'ADMIN';
}

// '월별 인센티브 실지급액' 접근 권한 (ADMIN / PAYROLL)
export function canViewPayroll(role?: UserRole | null): boolean {
  return role === 'ADMIN' || role === 'PAYROLL';
}

// PAYROLL 전용 사용자인지 — 사이드바에서 다른 메뉴 가림
export function isPayrollOnly(role?: UserRole | null): boolean {
  return role === 'PAYROLL';
}

// 시트 행 → 기본 역할 매핑
//   HRBP팀 / C.O1그룹  → ADMIN
//   HRM / GA / CM 팀   → PAYROLL
//   그 외              → NORMAL
const ADMIN_PATTERNS = [/HRBP/i, /^C\.?O\.?1/i];
const PAYROLL_PATTERNS = [
  /\bHRM\b/i,
  /\bGA\b/i,
  /\bCM\b/i,
  /HRM팀/i,
  /GA팀/i,
  /CM팀/i,
];

export function defaultRoleFromAffiliation(
  affiliation1?: string | null,
  affiliation2?: string | null,
): UserRole {
  const haystack = [affiliation1 ?? '', affiliation2 ?? ''].join(' | ');
  if (ADMIN_PATTERNS.some(re => re.test(haystack))) return 'ADMIN';
  if (PAYROLL_PATTERNS.some(re => re.test(haystack))) return 'PAYROLL';
  return 'NORMAL';
}
