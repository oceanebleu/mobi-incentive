// ─────────────────────────────────────────────────────────────
// GET /api/members/last-work-dates
// Supabase users 테이블에서 last_work_date 가 있는 인원만 추려
// { byName: { '홍길동': '2024-03-15', ... } } 형태로 반환합니다.
//
// 개인별지급관리(/members)와 대시보드(/) 의 지급액 계산에서
// "마지막 근무일 이후 지급분 제외" 로직에 사용됩니다.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canAccessApp, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canAccessApp(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select('name, last_work_date')
      .not('last_work_date', 'is', null);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 동명이인이 있을 경우 가장 최근(=가장 나중) 퇴사일을 채택
    // (이전 퇴사자를 기준으로 잘못 제외하는 위험을 줄임)
    const byName: Record<string, string> = {};
    for (const row of data ?? []) {
      const name = (row as any).name as string | null;
      const date = (row as any).last_work_date as string | null;
      if (!name || !date) continue;
      const existing = byName[name];
      if (!existing || date > existing) byName[name] = date;
    }

    return NextResponse.json({ byName });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'unknown error' },
      { status: 500 }
    );
  }
}
