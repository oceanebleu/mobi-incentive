import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

// Edge Runtime 호환을 위해 roles 로직 인라인 처리
const ALLOWED_ROLES = ['EXEC', 'ADMIN'];
const USER_MGMT_ROLES = ['EXEC', 'ADMIN'];

function canAccessApp(role?: string): boolean {
  if (!role) return false;
  return ALLOWED_ROLES.includes(role);
}

function canManageUsers(role?: string): boolean {
  if (!role) return false;
  return USER_MGMT_ROLES.includes(role);
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
      pathname.startsWith('/api/import');
    if (isAdminPath) {
      if (!canManageUsers(role)) {
        return NextResponse.redirect(new URL('/unauthorized', req.url));
      }
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
    '/((?!api/auth|login|unauthorized|_next/static|_next/image|favicon.ico).*)',
  ],
};
