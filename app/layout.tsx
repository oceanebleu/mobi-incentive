import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import AuthSessionProvider from '@/components/providers/SessionProvider';
import DataInitializer from '@/components/providers/DataInitializer';

export const metadata: Metadata = {
  title: '수주인센티브 운영관리',
  description: '수주인센티브 운영관리 시스템',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="font-sans">
        <AuthSessionProvider>
          {/* 앱 진입 시 Supabase에서 데이터 로드 */}
          <DataInitializer />
          <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
            <Sidebar />
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
