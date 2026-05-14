// ─────────────────────────────────────────────────────────────
// POST /api/users/sync
// information_employees 시트 → Supabase users 테이블 동기화
//
// 규칙
//   - 모든 사원(재직/휴직/퇴사예정/퇴사 등)을 전부 동기화
//     · 퇴사자도 사용자관리에 표시되어야 하고,
//     · 개인별 지급관리 계산에서 퇴사자의 last_work_date 가 필요함
//     · 퇴사자는 authOptions.resolveRole 에서 role=NONE 으로 처리되어
//       로그인이 차단되므로 보안상 문제 없음
//   - role_overridden=true 인 사용자는 sync 시 role 보존 (수동 설정 유지)
//   - 그 외에는 D/E 소속 패턴(HRBP / C.O1)에 따라 기본 역할 재계산
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageUsers, defaultRoleFromAffiliation, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { fetchEmployees } from '@/lib/google-sheets';
import { generateAccessCode } from '@/lib/access-code';

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

  // 기존 row 일괄 로드 (employee_id → {role, role_overridden, access_code})
  //   access_code 컬럼이 아직 없는 환경도 안전하게 동작시키기 위해 '*' 로 select
  const { data: existing, error: exErr } = await supabase
    .from('users')
    .select('employee_id, role, role_overridden, access_code');
  if (exErr) {
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }
  const existingMap = new Map(
    (existing ?? []).map(r => [r.employee_id as string, r])
  );

  const now = new Date().toISOString();
  const upserts: any[] = [];
  let countNewActive = 0;
  let countNewResigned = 0;
  let countUpdatedActive = 0;
  let countUpdatedResigned = 0;

  // 재직/퇴사 구분 없이 전부 동기화한다.
  // 이유:
  //   1) 사용자관리 탭에서 퇴사자 목록도 보여야 함
  //   2) 개인별 지급관리의 "마지막 근무일 이후 지급분 제외" 로직이
  //      퇴사자의 last_work_date 를 참조하기 때문
  //   3) 퇴사자는 authOptions.resolveRole 에서 role=NONE 으로 처리되어
  //      로그인이 차단되므로 보안상 문제 없음
  for (const emp of employees) {
    const isResigned = emp.status === '퇴사';
    const existed = existingMap.get(emp.employee_id);

    const defaultRole = defaultRoleFromAffiliation(emp.affiliation1, emp.affiliation2);
    const finalRole: UserRole = existed?.role_overridden
      ? (existed.role as UserRole)        // 수동 설정 보존
      : defaultRole;

    // PL 본인 인증용 고유코드 — 기존 코드가 있으면 보존, 없으면 새로 발급
    const existingCode = (existed as any)?.access_code as string | null | undefined;
    const accessCode = existingCode && existingCode.trim() !== '' ? existingCode : generateAccessCode();

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
      access_code: accessCode,
      synced_at: now,
    });

    if (existed) {
      if (isResigned) countUpdatedResigned++;
      else countUpdatedActive++;
    } else {
      if (isResigned) countNewResigned++;
      else countNewActive++;
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
    new: countNewActive + countNewResigned,
    newActive: countNewActive,
    newResigned: countNewResigned,
    updated: countUpdatedActive + countUpdatedResigned,
    updatedActive: countUpdatedActive,
    updatedResigned: countUpdatedResigned,
  });
}
