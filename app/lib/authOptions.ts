// ─────────────────────────────────────────────────────────────
// lib/authOptions.ts
// NextAuth 설정 (Google OAuth + 도메인/역할 검증)
// ─────────────────────────────────────────────────────────────

import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { getUserRole, canAccessApp } from './roles';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  pages: {
    signIn: '/login',       // 커스텀 로그인 페이지
    error: '/login',        // 에러 시 로그인 페이지로
  },

  callbacks: {
    // 로그인 허용 여부 판단
    async signIn({ user }) {
      const email = user.email ?? '';
      // @mobidays.com이 아니면 로그인 차단
      if (!email.endsWith('@mobidays.com')) return false;
      return true;
    },

    // JWT 토큰에 역할 추가
    async jwt({ token, user }) {
      if (user?.email) {
        token.role = getUserRole(user.email);
      }
      return token;
    },

    // 세션에 역할 노출
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
      }
      return session;
    },
  },

  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8시간 (업무 시간 기준)
  },
};
