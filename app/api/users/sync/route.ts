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
  //   access_code 컬럼이 아직 없는 환경에서도 동작하도록 fallback select 적용
  let existing: any[] | null;
  {
    const r1 = await supabase
      .from('users')
      .select('employee_id, role, role_overridden, access_code');
    if (r1.error && /access_code/.test(r1.error.message ?? '')) {
      const r2 = await supabase
        .from('users')
        .select('employee_id, role, role_overridden');
      if (r2.error) {
        return NextResponse.json({ error: r2.error.message }, { status: 500 });
      }
      existing = r2.data ?? [];
    } else if (r1.error) {
      return NextResponse.json({ error: r1.error.message }, { status: 500 });
    } else {
      existing = r1.data ?? [];
    }
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

    // PL 본인 인증용 고유코드 우선순위
    //   1) 시트 K열에 값이 있으면 그 값을 그대로 사용 (운영팀이 시트를 진실의 원천으로 관리)
    //   2) 시트에는 없지만 DB에 이미 있으면 보존
    //   3) 둘 다 없으면 새로 자동 발급
    const sheetCode = (emp.access_code ?? '').trim();
    const existingCode = ((existed as any)?.access_code ?? '').trim();
    const accessCode = sheetCode !== ''
      ? sheetCode
      : existingCode !== ''
      ? existingCode
      : generateAccessCode();

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
    //   access_code 컬럼이 DB에 아직 없는 환경(=alter SQL 미실행)을 보호 — 컬럼 누락 에러면
    //   해당 컬럼을 빼고 재시도. 다른 컬럼 동기화는 정상적으로 진행되도록.
    const CHUNK = 500;
    let codeMissingNoted = false;
    for (let i = 0; i < upserts.length; i += CHUNK) {
      const slice = upserts.slice(i, i + CHUNK);
      let { error } = await supabase
        .from('users')
        .upsert(slice, { onConflict: 'employee_id' });
      if (error && /access_code/.test(error.message ?? '')) {
        if (!codeMissingNoted) {
          console.warn('[users/sync] access_code 컬럼 미존재 — 빼고 동기화 진행');
          codeMissingNoted = true;
        }
        const stripped = slice.map(({ access_code, ...rest }) => rest);
        const retry = await supabase
          .from('users')
          .upsert(stripped, { onConflict: 'employee_id' });
        error = retry.error;
      }
      if (error) {
        return NextResponse.json(
          {
            error: `upsert 실패: ${error.message}`,
            processed: i,
            hint: /access_code/.test(error.message)
              ? "Supabase SQL Editor에서 'alter table public.users add column if not exists access_code text; notify pgrst, ''reload schema'';' 를 실행해 주세요."
              : undefined,
          },
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
