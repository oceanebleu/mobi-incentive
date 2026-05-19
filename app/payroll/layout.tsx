// 월별 인센티브 실지급액 페이지 — 서버 측 role 가드 (defense-in-depth)
//   접근 가능: ADMIN, PAYROLL

import { requireRole } from '@/lib/require-role';
import { canViewPayroll } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export default async function PayrollLayout({ children }: { children: React.ReactNode }) {
  await requireRole(canViewPayroll);
  return <>{children}</>;
}
