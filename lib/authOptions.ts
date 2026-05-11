// ─────────────────────────────────────────────────────────────
// lib/authOptions.ts
// NextAuth 설정 (Google OAuth + Supabase users 테이블 기반 역할)
// ─────────────────────────────────────────────────────────────

import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { isSuperAdmin, type UserRole } from './roles';
import { getSupabaseAdmin } from './supabase-server';

// 이메일로 Supabase users 테이블에서 역할을 조회합니다.
// — 슈퍼관리자는 DB가 비어있어도 ADMIN으로 부트스트랩
// — 퇴사자 또는 미등록 사용자는 NONE
async function resolveRole(email: string): Promise<UserRole> {
  const normalized = email.toLowerCase();
  if (isSuperAdmin(normalized)) return 'ADMIN';

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select('role, status')
      .ilike('email', normalized)
      .maybeSingle();

    if (error || !data) return 'NONE';
    if (data.status === '퇴사') return 'NONE';
    return (data.role as UserRole) ?? 'NONE';
  } catch {
    // Supabase 미설정 등 — 슈퍼관리자가 아니면 차단
    return 'NONE';
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    // 로그인 허용 여부: @mobidays.com 도메인만
    async signIn({ user }) {
      const email = user.email ?? '';
      if (!email.endsWith('@mobidays.com')) return false;
      return true;
    },

    // JWT 토큰에 역할 주입
    // — 최초 로그인 시 / 30분마다 Supabase 재조회 (권한 변경이 자연스럽게 반영)
    async jwt({ token, user, trigger }) {
      const email = (user?.email ?? token.email ?? '') as string;
      if (!email) return token;

      const now = Math.floor(Date.now() / 1000);
      const lastResolved = (token as any).roleResolvedAt as number | undefined;
      const stale = !lastResolved || now - lastResolved > 30 * 60;

      if (user || trigger === 'update' || stale) {
        (token as any).role = await resolveRole(email);
        (token as any).roleResolvedAt = now;
      }
      return token;
    },

    // 세션에 역할 노출
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = (token as any).role;
      }
      return session;
    },
  },

  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
  },
};
