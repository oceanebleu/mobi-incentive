// ─────────────────────────────────────────────────────────────
// GET /api/users/directory
// 사용자 룩업용 — 이름을 키로 team / employee_id / last_work_date 반환.
// 멤버 페이지/대시보드에서 project_members.member_name 을 보강할 때 사용.
//
// 동명이인이 있을 경우:
//   - 마지막 근무일 → 가장 최근(나중) 일자
//   - 팀(affiliation2) → 가장 최근 갱신 row 기준
//   - employee_id → 가장 최근 갱신 row 기준
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
      .select('name, affiliation2, employee_id, last_work_date, status, updated_at')
      .order('updated_at', { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const lastWorkDateByName: Record<string, string> = {};
    const teamByName: Record<string, string> = {};
    const employeeIdByName: Record<string, string> = {};
    const statusByName: Record<string, string> = {};

    for (const row of data ?? []) {
      const name = (row as any).name as string | null;
      if (!name) continue;
      const team = (row as any).affiliation2 as string | null;
      const empId = (row as any).employee_id as string;
      const lwd = (row as any).last_work_date as string | null;
      const status = (row as any).status as string | null;

      // last_work_date 는 가장 늦은 일자만 채택 (안전한 쪽으로 — 동명이인 over-exclusion 방지)
      if (lwd) {
        const existing = lastWorkDateByName[name];
        if (!existing || lwd > existing) lastWorkDateByName[name] = lwd;
      }
      // team / employee_id / status 는 최신 updated_at 우선 (이미 desc 정렬), 처음 만나는 값 채택
      if (team && !teamByName[name]) teamByName[name] = team;
      if (empId && !employeeIdByName[name]) employeeIdByName[name] = empId;
      if (status && !statusByName[name]) statusByName[name] = status;
    }

    return NextResponse.json({
      lastWorkDateByName,
      teamByName,
      employeeIdByName,
      statusByName,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown' }, { status: 500 });
  }
}
