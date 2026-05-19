// ─────────────────────────────────────────────────────────────
// lib/require-role.ts
// 서버 컴포넌트(layout.tsx / page.tsx) 에서 사용하는 role 가드.
//
//   - 미들웨어가 1차 차단을 담당하지만, 이중 방어(defense-in-depth)로
//     페이지 컴포넌트 단계에서도 서버 측 role 을 한 번 더 검증.
//   - role 미충족 시 /unauthorized 로 리다이렉트 (페이지 자체가 렌더되지 않음).
//
// 사용 예 (layout.tsx):
//   import { requireRole } from '@/lib/require-role';
//   import { canManageUsers } from '@/lib/roles';
//
//   export default async function UsersLayout({ children }: { children: React.ReactNode }) {
//     await requireRole(canManageUsers);
//     return <>{children}</>;
//   }
// ─────────────────────────────────────────────────────────────

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from './authOptions';
import type { UserRole } from './roles';

export async function requireRole(check: (role?: UserRole | null) => boolean): Promise<{
  role: UserRole | undefined;
}> {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!check(role)) {
    redirect('/unauthorized');
  }
  return { role };
}
