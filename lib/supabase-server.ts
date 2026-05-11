// ─────────────────────────────────────────────────────────────
// lib/supabase-server.ts
// 서버 사이드 전용 Supabase 클라이언트 (service_role 키 사용)
// — 클라이언트 번들에 노출되지 않도록 'server-only' import 유지
// ─────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase 환경변수가 누락되었습니다. NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 설정하세요.'
    );
  }

  _client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

// users 테이블 row 타입
export interface UserRow {
  employee_id: string;       // A: 사번
  name: string;              // B: 사원명
  corp_group: string | null; // C: 법인/그룹
  affiliation1: string | null; // D: 소속1
  affiliation2: string | null; // E: 소속2
  status: string | null;     // F: 재직상태
  hire_date: string | null;  // G: 입사일
  last_work_date: string | null; // H: 마지막 근무일
  resignation_date: string | null; // I: 서류상 퇴사일
  email: string | null;      // J: 회사이메일 (소문자)
  role: 'EXEC' | 'ADMIN' | 'NORMAL';
  role_overridden: boolean;
  synced_at: string;
  updated_at: string;
}
