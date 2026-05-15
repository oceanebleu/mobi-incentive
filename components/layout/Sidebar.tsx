'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  ChevronRight,
  TrendingUp,
  LogOut,
  ShieldCheck,
  Upload,
  Archive,
  Wallet,
} from 'lucide-react';
import clsx from 'clsx';
import { ROLE_LABELS } from '@/lib/roles';
import type { UserRole } from '@/lib/roles';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** 메뉴 노출 가능 역할. 비어있으면 모든 진입 가능 역할(EXEC·ADMIN) 노출 */
  roles?: UserRole[];
}

// 메뉴별 노출 정책
//   · 기본 메뉴(대시보드/프로젝트/개인별 지급): EXEC + ADMIN
//   · 운영 도구(아카이브·사용자관리·데이터 import): ADMIN 만
//   · 월별 인센티브 실지급액: PAYROLL + ADMIN
//   · PAYROLL 사용자는 '월별 인센티브 실지급액' 외 메뉴 모두 가려짐
const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '대시보드', icon: LayoutDashboard, roles: ['EXEC', 'ADMIN'] },
  { href: '/projects', label: '프로젝트 관리', icon: FolderKanban, roles: ['EXEC', 'ADMIN'] },
  { href: '/members', label: '개인별 지급 관리', icon: Users, roles: ['EXEC', 'ADMIN'] },
  { href: '/payroll', label: '월별 인센티브 실지급액', icon: Wallet, roles: ['ADMIN', 'PAYROLL'] },
  { href: '/archive', label: '제안 자료 아카이브', icon: Archive, roles: ['ADMIN'] },
  { href: '/users', label: '사용자관리', icon: ShieldCheck, roles: ['ADMIN'] },
  { href: '/admin/import', label: '데이터 Import', icon: Upload, roles: ['ADMIN'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const user = session?.user;
  const role = (user as any)?.role as UserRole | undefined;
  // 이름이 없으면 이메일 앞부분 사용
  const displayName = user?.name ?? user?.email?.split('@')[0] ?? '';

  return (
    <aside className="w-64 h-screen bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
      {/* 로고 - 클릭 시 대시보드로 이동 */}
      <Link
        href="/"
        className="block px-5 py-5 border-b border-gray-100 hover:bg-gray-50/70 transition-colors"
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <TrendingUp size={14} className="text-white" />
          </div>
          <span className="text-sm font-bold text-gray-900">인센티브 관리</span>
        </div>
        <p className="text-[11px] text-gray-400 pl-9">수주인센티브 운영관리 시스템</p>
      </Link>

      {/* 내비게이션 */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.filter(item => !item.roles || (role ? item.roles.includes(role) : false)).map(({ href, label, icon: Icon }) => {
          const active =
            href === '/'
              ? pathname === '/'
              : pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              )}
            >
              <Icon
                size={16}
                className={clsx(
                  'flex-shrink-0',
                  active ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'
                )}
              />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight size={13} className="text-blue-400 opacity-70" />}
            </Link>
          );
        })}
      </nav>

      {/* 로그인 사용자 정보 + 로그아웃 */}
      <div className="px-4 py-4 border-t border-gray-100">
        {user ? (
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt={displayName}
                  className="w-7 h-7 rounded-full"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                  {displayName[0]?.toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{displayName}</p>
                {role && (
                  <span className="text-[10px] text-blue-600 font-medium">
                    {ROLE_LABELS[role]}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <LogOut size={13} />
              로그아웃
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400">모비데이즈 인센티브 운영위원회</p>
        )}
      </div>
    </aside>
  );
}
