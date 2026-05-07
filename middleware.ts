import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

// Edge Runtime 호환을 위해 roles 로직 인라인 처리
const ALLOWED_ROLES = ['EXEC', 'HRBP'];

function canAccessApp(role?: string): boolean {
  if (!role) return false;
  return ALLOWED_ROLES.includes(role);
}

export default withAuth(
  function middleware(req) {
    const role = (req.nextauth.token as any)?.role as string | undefined;

    if (req.nextUrl.pathname === '/unauthorized') {
      return NextResponse.next();
    }

    if (!canAccessApp(role)) {
      return NextResponse.redirect(new URL('/unauthorized', req.url));
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
