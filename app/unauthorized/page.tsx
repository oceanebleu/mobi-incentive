'use client';

import { signOut, useSession } from 'next-auth/react';
import { ShieldOff } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/roles';
import type { UserRole } from '@/lib/roles';

export default function UnauthorizedPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as UserRole | undefined;

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 w-full max-w-sm text-center">
        <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mx-auto mb-4">
          <ShieldOff size={22} className="text-red-400" />
        </div>

        <h1 className="text-base font-bold text-gray-900 mb-2">접근 권한이 없습니다</h1>
        <p className="text-sm text-gray-500 mb-1">
          {session?.user?.email}
        </p>
        {role && (
          <p className="text-xs text-gray-400 mb-6">
            현재 역할: {ROLE_LABELS[role]}
          </p>
        )}
        <p className="text-xs text-gray-400 mb-8">
          이 시스템은 경영진 및 관리자만 접근할 수 있습니다.
          <br />
          권한이 필요하면 HRBP / C.O1그룹 담당자에게 문의해주세요.
        </p>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
