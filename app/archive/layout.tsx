// 제안 자료 아카이브 페이지 — 서버 측 role 가드 (defense-in-depth)

import { requireRole } from '@/lib/require-role';
import { canManageUsers } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export default async function ArchiveLayout({ children }: { children: React.ReactNode }) {
  await requireRole(canManageUsers);
  return <>{children}</>;
}
