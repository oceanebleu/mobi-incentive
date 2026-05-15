import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

// Edge Runtime 호환을 위해 roles 로직 인라인 처리
const ALLOWED_ROLES = ['EXEC', 'ADMIN', 'PAYROLL'];
const USER_MGMT_ROLES = ['EXEC', 'ADMIN'];
const PAYROLL_ROLES = ['ADMIN', 'PAYROLL'];

function canAccessApp(role?: string): boolean {
  if (!role) return false;
  return ALLOWED_ROLES.includes(role);
}

function canManageUsers(role?: string): boolean {
  if (!role) return false;
  return USER_MGMT_ROLES.includes(role);
}

function canViewPayroll(role?: string): boolean {
  if (!role) return false;
  return PAYROLL_ROLES.includes(role);
}

export default withAuth(
  function middleware(req) {
    const role = (req.nextauth.token as any)?.role as string | undefined;
    const { pathname } = req.nextUrl;

    if (pathname === '/unauthorized') {
      return NextResponse.next();
    }

    if (!canAccessApp(role)) {
      return NextResponse.redirect(new URL('/unauthorized', req.url));
    }

    // 사용자관리/Import 페이지 + API는 관리자/경영진만 접근
    const isAdminPath =
      pathname.startsWith('/users') ||
      pathname.startsWith('/api/users') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/api/import') ||
      pathname.startsWith('/archive') ||
      pathname.startsWith('/api/proposal-archive');
    if (isAdminPath) {
      if (!canManageUsers(role)) {
        return NextResponse.redirect(new URL('/unauthorized', req.url));
      }
    }

    // /payroll 페이지 + API는 ADMIN/PAYROLL 만
    //   예외: /api/payroll/creative-lab — 대시보드·개인별 페이지에서 EXEC 도 합계 파싱이 필요하므로
    //   미들웨어에서는 통과시키고, 핸들러 측 GET=canAccessApp / POST·DELETE=canViewPayroll 로 분기
    const isCreativeLabApi = pathname.startsWith('/api/payroll/creative-lab');
    const isPayrollPath =
      pathname.startsWith('/payroll') || pathname.startsWith('/api/payroll');
    if (isPayrollPath && !isCreativeLabApi && !canViewPayroll(role)) {
      return NextResponse.redirect(new URL('/unauthorized', req.url));
    }

    // PAYROLL 전용 사용자는 /payroll 외 경로는 모두 /payroll 로 리다이렉트
    //   (creative-lab API 카브-아웃은 PAYROLL 권한자에게는 영향 없음 — 이미 /payroll 로 가있음)
    if (role === 'PAYROLL' && !isPayrollPath) {
      return NextResponse.redirect(new URL('/payroll', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    // /pl, /api/pl 은 PL이 로그인 없이 사번 인증으로 접근 — 미들웨어 우회
    '/((?!api/auth|api/pl|pl|login|unauthorized|_next/static|_next/image|favicon.ico).*)',
  ],
};
