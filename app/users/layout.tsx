// 사용자관리 페이지 — 서버 측 role 가드 (defense-in-depth)
//   미들웨어가 1차 차단을 담당하지만, 페이지 컴포넌트 단계에서도 한 번 더 검증해
//   미들웨어 우회/매처 누락 등 어떤 경우에도 권한자가 아닌 사용자에게는 렌더 자체가 되지 않도록 보호.

import { requireRole } from '@/lib/require-role';
import { canManageUsers } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  await requireRole(canManageUsers);
  return <>{children}</>;
}
