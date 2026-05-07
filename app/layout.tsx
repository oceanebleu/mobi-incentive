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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap"
          rel="stylesheet"
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
