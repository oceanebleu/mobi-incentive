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
  console.log('[resolveRole] email:', normalized);
  console.log('[resolveRole] SUPER_ADMIN_EMAILS:', process.env.SUPER_ADMIN_EMAILS);
  console.log('[resolveRole] isSuperAdmin:', isSuperAdmin(normalized));
  if (isSuperAdmin(normalized)) return 'ADMIN';

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select('role, status')
      .ilike('email', normalized)
      .maybeSingle();

    console.log('[resolveRole] supabase data:', data, 'error:', error);

    if (error || !data) return 'NONE';
    if (data.status === '퇴사') return 'NONE';
    return (data.role as UserRole) ?? 'NONE';
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