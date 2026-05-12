// ─────────────────────────────────────────────────────────────
// lib/authOptions.ts
// NextAuth 설정 (Google OAuth + Supabase users 테이블 기반 역할)
// ─────────────────────────────────────────────────────────────

import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { isSuperAdmin, type UserRole } from './roles';
import { getSupabaseAdmin } from './supabase-server';

async function resolveRole(email: string): Promise<UserRole> {
  const normalized = email.toLowerCase();
  if (isSuperAdmin(normalized)) return 'ADMIN';

  try {
    const supabase = getSupabaseAdmin();
    // 같은 이메일이 (재직 + 퇴사 이력) 여러 row 에 존재할 수 있다.
    // 퇴사가 아닌 row(=재직/휴직/퇴사예정 등)만 매칭 대상으로 좁힌다.
    // - 매칭 결과 없음 → NONE (미등록 또는 퇴사자만 존재)
    // - 매칭된 row 가 둘 이상이면 updated_at 최신 1건 사용
    const { data, error } = await supabase
      .from('users')
      .select('role, status')
      .ilike('email', normalized)
      .neq('status', '퇴사')
      .order('updated_at', { ascending: false })
      .limit(1);

    console.log('[resolveRole] supabase data:', data, 'error:', error);

    if (error || !data || data.length === 0) return 'NONE';
    return ((data[0].role as UserRole) ?? 'NONE');
  } catch (e) {
    console.log('[resolveRole] catch error:', e);
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
    async signIn({ user }) {
      const email = user.email ?? '';
      if (!email.endsWith('@mobidays.com')) return false;
      return true;
    },

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