'use client';

import { useEffect } from 'react';
import { useIncentiveStore } from '@/lib/store';

// 앱 최초 진입 시 Supabase에서 전체 데이터 로드
export default function DataInitializer() {
  const { fetchAll, error } = useIncentiveStore();

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (error) {
    console.error('데이터 로드 오류:', error);
  }

  return null; // UI 없음, 사이드이펙트만 처리
}
