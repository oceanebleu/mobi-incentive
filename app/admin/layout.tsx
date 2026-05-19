// 데이터 Import 페이지 — 서버 측 role 가드 (defense-in-depth)

import { requireRole } from '@/lib/require-role';
import { canManageUsers } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(canManageUsers);
  return <>{children}</>;
}
