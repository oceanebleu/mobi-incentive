'use client';

import { Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { TrendingUp } from 'lucide-react';

// useSearchParams() 는 정적 prerender 와 충돌 — Suspense 안에서 호출되어야 함
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell callbackUrl="/" />}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const search = useSearchParams();
  // 미들웨어가 미인증 사용자를 /login?callbackUrl=<원본URL> 로 보낸 경우, 그 URL 로 복귀시킴.
  //   보안: open redirect 방지를 위해 두 가지만 허용
  //     1) 상대 경로(`/projects/...`)
  //     2) 절대 URL 이지만 동일 출처(`https://<현재 호스트>/...`)
  //   그 외(크로스 오리진·`//evil.com` 형태)는 `/` 로 fallback.
  const raw = search?.get('callbackUrl') ?? '/';
  const callbackUrl = getSafeCallbackUrl(raw);
  return <LoginShell callbackUrl={callbackUrl} />;
}

function getSafeCallbackUrl(raw: string): string {
  if (!raw) return '/';
  // 상대 경로
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  // 절대 URL — 동일 출처만 허용
  if (typeof window !== 'undefined') {
    try {
      const u = new URL(raw);
      if (u.origin === window.location.origin) {
        return u.pathname + u.search + u.hash;
      }
    } catch {
      // invalid URL
    }
  }
  return '/';
}

function LoginShell({ callbackUrl }: { callbackUrl: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 w-full max-w-sm text-center">

        {/* 로고 */}
        <div className="flex items-center justify-center gap-2.5 mb-2">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <TrendingUp size={20} className="text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">인센티브 관리</span>
        </div>
        <p className="text-sm text-gray-400 mb-8">수주인센티브 운영관리 시스템</p>

        {/* 로그인 버튼 */}
        <button
          onClick={() => signIn('google', { callbackUrl })}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {/* Google 아이콘 */}
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Google 계정으로 로그인
        </button>

        <p className="text-xs text-gray-400 mt-5">
          @mobidays.com 계정만 접속 가능합니다
        </p>
      </div>
    </div>
  );
}
