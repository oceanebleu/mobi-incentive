// ─────────────────────────────────────────────────────────────
// POST /api/users/sync
// information_employees 시트 → Supabase users 테이블 동기화
//
// 규칙
//   - F열(재직상태)이 '퇴사'인 행은 신규로 추가하지 않음
//     (이미 존재하는 행은 status='퇴사'로 갱신 → 로그인 차단)
//   - role_overridden=true 인 사용자는 sync 시 role 보존 (수동 설정 유지)
//   - 그 외에는 D/E 소속 패턴(HRBP / C.O1)에 따라 기본 역할 재계산
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageUsers, defaultRoleFromAffiliation, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { fetchEmployees } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageUsers(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let employees;
  try {
    employees = await fetchEmployees();
  } catch (e: any) {
    return NextResponse.json(
      { error: `시트 조회 실패: ${e?.message ?? e}` },
      { status: 502 }
    );
  }

  const supabase = getSupabaseAdmin();

  // 기존 row 일괄 로드 (employee_id → {role, role_overridden})
  const { data: existing, error: exErr } = await supabase
    .from('users')
    .select('employee_id, role, role_overridden');
  if (exErr) {
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }
  const existingMap = new Map(
    (existing ?? []).map(r => [r.employee_id as string, r])
  );

  const now = new Date().toISOString();
  const upserts: any[] = [];
  let countNew = 0;
  let countUpdated = 0;
  let countSkippedResigned = 0;
  let countResignedMarked = 0;

  for (const emp of employees) {
    const isResigned = emp.status === '퇴사';
    const existed = existingMap.get(emp.employee_id);

    if (isResigned && !existed) {
      // 퇴사자 + 신규 → 추가하지 않음
      countSkippedResigned++;
      continue;
    }

    // 역할 결정
    const defaultRole = defaultRoleFromAffiliation(emp.affiliation1, emp.affiliation2);
    const finalRole: UserRole = existed?.role_overridden
      ? (existed.role as UserRole)        // 수동 설정 보존
      : defaultRole;

    upserts.push({
      employee_id: emp.employee_id,
      name: emp.name,
      corp_group: emp.corp_group,
      affiliation1: emp.affiliation1,
      affiliation2: emp.affiliation2,
      status: emp.status,
      hire_date: emp.hire_date,
      last_work_date: emp.last_work_date,
      resignation_date: emp.resignation_date,
      email: emp.email,
      role: finalRole,
      role_overridden: existed?.role_overridden ?? false,
      synced_at: now,
    });

    if (existed) {
      countUpdated++;
      if (isResigned) countResignedMarked++;
    } else {
      countNew++;
    }
  }

  if (upserts.length > 0) {
    // 500건 단위로 잘라 upsert (Supabase 권장 페이로드)
    const CHUNK = 500;
    for (let i = 0; i < upserts.length; i += CHUNK) {
      const slice = upserts.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('users')
        .upsert(slice, { onConflict: 'employee_id' });
      if (error) {
        return NextResponse.json(
          { error: `upsert 실패: ${error.message}`, processed: i },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    total: employees.length,
    new: countNew,
    updated: countUpdated,
    skippedResigned: countSkippedResigned,
    resignedMarked: countResignedMarked,
  });
}
