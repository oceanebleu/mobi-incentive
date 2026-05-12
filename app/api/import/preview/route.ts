// ─────────────────────────────────────────────────────────────
// POST /api/import/preview
//
// body: multipart/form-data 또는 JSON
//   - proposals: <CSV text>
//   - projects:  <CSV text>
//   - members:   <CSV text>
//
// 응답: 파싱 결과 + 검증 결과 (DB는 안 건드림)
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageUsers, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import {
  parseCSV,
  parseProposalRows,
  parseProjectRows,
  parseProjectMemberRows,
  isTeamAccountName,
  type ProposalInput,
  type ProjectInput,
  type ProjectMemberInput,
} from '@/lib/csv';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface MemberValidation extends ProjectMemberInput {
  project_id: string | null;
  employee_id: string | null;
  is_team_account: boolean;
  warnings: string[];
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageUsers(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 두 가지 입력 방식 지원
  let proposalsCsv = '';
  let projectsCsv = '';
  let membersCsv = '';

  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    proposalsCsv = ((form.get('proposals') as File | null) ? await (form.get('proposals') as File).text() : '') || '';
    projectsCsv  = ((form.get('projects')  as File | null) ? await (form.get('projects')  as File).text() : '') || '';
    membersCsv   = ((form.get('members')   as File | null) ? await (form.get('members')   as File).text() : '') || '';
  } else {
    const body = await req.json().catch(() => ({}));
    proposalsCsv = body?.proposals ?? '';
    projectsCsv  = body?.projects  ?? '';
    membersCsv   = body?.members   ?? '';
  }

  // 1) 각 CSV 파싱
  const proposalsParsed = proposalsCsv
    ? parseProposalRows(parseCSV(proposalsCsv))
    : { proposals: [] as ProposalInput[], errors: [] };
  const projectsParsed = projectsCsv
    ? parseProjectRows(parseCSV(projectsCsv))
    : { projects: [] as ProjectInput[], errors: [] };
  const membersParsed = membersCsv
    ? parseProjectMemberRows(parseCSV(membersCsv))
    : { members: [] as ProjectMemberInput[], errors: [] };

  // 2) 프로젝트명 → 프로젝트ID 룩업 맵 만들기 (멤버 매칭용)
  //    Supabase에 이미 있는 프로젝트 + 이번 import 프로젝트 모두 고려
  const supabase = getSupabaseAdmin();
  const { data: existingProjects } = await supabase
    .from('projects')
    .select('id, campaign_name');

  const projectByName = new Map<string, string>();
  for (const p of existingProjects ?? []) {
    projectByName.set(p.campaign_name.trim(), p.id);
  }
  for (const p of projectsParsed.projects) {
    projectByName.set(p.campaign_name.trim(), p.id);
  }

  // 3) users 룩업 맵 (이름 → employee_id)
  const { data: existingUsers } = await supabase
    .from('users')
    .select('employee_id, name, status');
  const userByName = new Map<string, { employee_id: string; status: string | null }>();
  const dupNames = new Set<string>();
  for (const u of existingUsers ?? []) {
    const name = (u as any).name as string;
    if (!name) continue;
    if (userByName.has(name)) dupNames.add(name);
    userByName.set(name, {
      employee_id: (u as any).employee_id as string,
      status: (u as any).status as string | null,
    });
  }

  // 4) 멤버 행 검증 + 보강
  const memberValidations: MemberValidation[] = membersParsed.members.map(m => {
    const warnings: string[] = [];
    const projectId = projectByName.get(m.project_campaign_name.trim()) ?? null;
    if (!projectId) warnings.push(`프로젝트 매칭 실패: "${m.project_campaign_name}"`);

    const isTeam = isTeamAccountName(m.member_name);
    let employeeId: string | null = null;
    if (!isTeam) {
      const u = userByName.get(m.member_name);
      if (!u) {
        warnings.push(`사용자 매칭 실패: "${m.member_name}" (사용자관리 시트에 동일 이름 없음)`);
      } else {
        if (dupNames.has(m.member_name)) {
          warnings.push(`동명이인 존재: "${m.member_name}" — 마지막 일치자로 매칭`);
        }
        employeeId = u.employee_id;
      }
    }

    return {
      ...m,
      project_id: projectId,
      employee_id: employeeId,
      is_team_account: isTeam,
      warnings,
    };
  });

  // 4-b) (project_id, member_name) 중복 탐지 + 경고
  //   - 시트에 같은 프로젝트·사원 조합이 여러 행에 나올 수 있음
  //     (이름 표기 차이 'Creative.Lab' vs 'Creative. Lab' 등이 정규화로 합쳐지는 케이스 포함)
  //   - 같은 키의 마지막 row 만 살린다고 표시 → commit 단계에서 실제 dedupe
  let dupCount = 0;
  const seen = new Map<string, number>(); // key → 첫 등장 index
  for (let i = 0; i < memberValidations.length; i++) {
    const m = memberValidations[i];
    if (!m.project_id) continue;
    const key = `${m.project_id}|${m.member_name}`;
    if (seen.has(key)) {
      const firstIdx = seen.get(key)!;
      memberValidations[firstIdx].warnings.push(
        `중복: 이후 행에서 같은 (프로젝트, 사원)이 다시 나옴 — 마지막 값으로 덮어씌움`
      );
      memberValidations[i].warnings.push(`중복 항목: 이 행이 최종 사용됨`);
      dupCount++;
    }
    seen.set(key, i);
  }

  // 5) 요약
  const summary = {
    proposals: {
      total: proposalsParsed.proposals.length,
      toPromote: proposalsParsed.proposals.filter(p => p.promote_to_project).length,
      errors: proposalsParsed.errors,
    },
    projects: {
      total: projectsParsed.projects.length,
      acquisitionBreakdown: countBy(projectsParsed.projects, p => p.acquisition_status ?? 'NULL'),
      errors: projectsParsed.errors,
    },
    members: {
      total: memberValidations.length,
      teamAccounts: memberValidations.filter(m => m.is_team_account).length,
      unmatchedProject: memberValidations.filter(m => !m.project_id).length,
      unmatchedUser: memberValidations.filter(m => !m.is_team_account && !m.employee_id).length,
      duplicates: dupCount,
      errors: membersParsed.errors,
    },
  };

  return NextResponse.json({
    summary,
    proposals: proposalsParsed.proposals,
    projects: projectsParsed.projects,
    members: memberValidations,
  });
}

function countBy<T>(arr: T[], keyFn: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of arr) {
    const k = keyFn(a);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
