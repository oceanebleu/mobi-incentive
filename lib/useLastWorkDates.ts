'use client';

import { useEffect, useState } from 'react';

// /api/members/last-work-dates 를 한 번 fetch 해서
// { 이름 → 마지막근무일 } 매핑을 반환합니다.
// — 실패 시 빈 객체 반환 (Supabase 미설정 등 환경에서도 앱이 동작하도록)
export function useLastWorkDates(): {
  byName: Record<string, string>;
  loading: boolean;
} {
  const [byName, setByName] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/members/last-work-dates', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(j => {
        if (!cancelled) setByName(j.byName ?? {});
      })
      .catch(() => {
        if (!cancelled) setByName({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { byName, loading };
}
