// ─────────────────────────────────────────────────────────────
// lib/roles.ts
// 역할 정의 및 이메일 → 역할 매핑
// 역할은 Vercel 환경변수로 관리 (코드 수정 없이 변경 가능)
// ─────────────────────────────────────────────────────────────

export type UserRole = 'EXEC' | 'HRBP' | 'PL' | 'NONE';

// 환경변수에서 이메일 목록을 파싱합니다
// 예: EXEC_EMAILS=ceo@mobidays.com,coo@mobidays.com
function parseEmailList(envKey: string): string[] {
  const raw = process.env[envKey] ?? '';
  return raw
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

// 이메일로 역할 반환
export function getUserRole(email: string): UserRole {
  const normalized = email.toLowerCase();

  // 1. @mobidays.com 도메인 검증
  if (!normalized.endsWith('@mobidays.com')) return 'NONE';

  // 2. 역할 확인
  const execEmails = parseEmailList('EXEC_EMAILS');
  const hrbpEmails = parseEmailList('HRBP_EMAILS');

  if (execEmails.includes(normalized)) return 'EXEC';
  if (hrbpEmails.includes(normalized)) return 'HRBP';

  // @mobidays.com이지만 역할 미지정 → PL (추후 PL 전용 뷰에서 사용)
  return 'PL';
}

// 현재 앱 접근 가능한 역할
export const ALLOWED_ROLES: UserRole[] = ['EXEC', 'HRBP'];

export function canAccessApp(role: UserRole): boolean {
  return ALLOWED_ROLES.includes(role);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  EXEC: '경영진',
  HRBP: 'HRBP',
  PL: 'PL',
  NONE: '권한없음',
};
