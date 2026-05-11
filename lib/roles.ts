// ─────────────────────────────────────────────────────────────
// lib/roles.ts
// 신규 역할 체계 (Supabase users 테이블 기반)
//   - EXEC   : 경영진 (대시보드/프로젝트/멤버 + 사용자관리 가능)
//   - ADMIN  : 관리자 (HRBP팀 / C.O1그룹) — 사용자관리 가능
//   - NORMAL : 일반 — 앱 접근 불가 (대시보드 진입 시 /unauthorized)
//   - NONE   : 시트에 없거나 퇴사 — 차단
// ─────────────────────────────────────────────────────────────

export type UserRole = 'EXEC' | 'ADMIN' | 'NORMAL' | 'NONE';

export const ROLE_LABELS: Record<UserRole, string> = {
  EXEC: '경영진',
  ADMIN: '관리자',
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

// 앱 자체에 진입 가능한 역할 (사이드바 메뉴 보임)
export const ALLOWED_ROLES: UserRole[] = ['EXEC', 'ADMIN'];

export function canAccessApp(role?: UserRole | null): boolean {
  return !!role && ALLOWED_ROLES.includes(role);
}

// '사용자관리' 탭 접근 권한 (HRBP/C.O1 → ADMIN, 그리고 경영진도 허용)
export function canManageUsers(role?: UserRole | null): boolean {
  return role === 'ADMIN' || role === 'EXEC';
}

// 시트 행 → 기본 역할 매핑
// 사용자 요구: E열(소속2)이 'HRBP팀' 또는 'C.O1그룹' → ADMIN
// (안전하게 소속1/소속2 양쪽을 모두 검사. 'C.O1', 'C.O.1', 'CO1' 변형도 허용)
const ADMIN_PATTERNS = [/HRBP/i, /^C\.?O\.?1/i];

export function defaultRoleFromAffiliation(
  affiliation1?: string | null,
  affiliation2?: string | null,
): UserRole {
  const haystack = [affiliation1 ?? '', affiliation2 ?? ''].join(' | ');
  if (ADMIN_PATTERNS.some(re => re.test(haystack))) return 'ADMIN';
  return 'NORMAL';
}
