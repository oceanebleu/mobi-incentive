// ─────────────────────────────────────────────────────────────
// lib/store.ts  — Supabase 연동 버전
// ─────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { Project, Member } from './types';
import { supabase } from './supabase';

interface IncentiveStore {
  projects: Project[];
  members: Member[];
  loading: boolean;
  error: string | null;
  // 초기 로드
  fetchAll: () => Promise<void>;
  // 프로젝트 CRUD
  addProject: (project: Project) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  // 멤버 CRUD
  addMember: (member: Member) => Promise<void>;
  updateMember: (id: string, updates: Partial<Member>) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;
}

export const useIncentiveStore = create<IncentiveStore>((set, get) => ({
  projects: [],
  members: [],
  loading: false,
  error: null,

  // ── 전체 데이터 로드 ──────────────────────────────
  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      // 멤버 조회
      const { data: membersData, error: membersError } = await supabase
        .from('members')
        .select('*')
        .order('name');
      if (membersError) throw membersError;

      // 프로젝트 + 참여 멤버 조회
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select(`
          *,
          project_members (
            member_id,
            member_name,
            contribution
          )
        `)
        .order('submitted_at', { ascending: false });
      if (projectsError) throw projectsError;

      // DB 컬럼명(snake_case) → 앱 타입(camelCase) 변환
      const projects: Project[] = (projectsData ?? []).map(dbToProject);
      const members: Member[] = (membersData ?? []).map((m: any) => ({
        id: m.id,
        name: m.name,
        team: m.team,
      }));

      set({ projects, members, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  // ── 프로젝트 추가 ──────────────────────────────────
  addProject: async (project) => {
    const { row: projectRow, members } = projectToDb(project);

    const { error: insertError } = await supabase
      .from('projects')
      .insert([projectRow]);
    if (insertError) { set({ error: insertError.message }); return; }

    if (members.length > 0) {
      const { error: mErr } = await supabase
        .from('project_members')
        .insert(members);
      if (mErr) { set({ error: mErr.message }); return; }
    }

    await get().fetchAll();
  },

  // ── 프로젝트 수정 ──────────────────────────────────
  updateProject: async (id, updates) => {
    const existing = get().projects.find(p => p.id === id);
    if (!existing) return;
    const merged = { ...existing, ...updates };
    const { row, members } = projectToDb(merged);

    const { error: uErr } = await supabase
      .from('projects')
      .update(row)
      .eq('id', id);
    if (uErr) { set({ error: uErr.message }); return; }

    // 참여 멤버 전체 교체 (삭제 후 재삽입)
    await supabase.from('project_members').delete().eq('project_id', id);
    if (members.length > 0) {
      const { error: mErr } = await supabase
        .from('project_members')
        .insert(members);
      if (mErr) { set({ error: mErr.message }); return; }
    }

    await get().fetchAll();
  },

  // ── 프로젝트 삭제 ──────────────────────────────────
  deleteProject: async (id) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) { set({ error: error.message }); return; }
    set(state => ({ projects: state.projects.filter(p => p.id !== id) }));
  },

  // ── 멤버 추가 ──────────────────────────────────────
  addMember: async (member) => {
    const { error } = await supabase.from('members').insert([member]);
    if (error) { set({ error: error.message }); return; }
    set(state => ({ members: [...state.members, member] }));
  },

  // ── 멤버 수정 ──────────────────────────────────────
  updateMember: async (id, updates) => {
    const { error } = await supabase
      .from('members')
      .update(updates)
      .eq('id', id);
    if (error) { set({ error: error.message }); return; }
    set(state => ({
      members: state.members.map(m => m.id === id ? { ...m, ...updates } : m),
    }));
  },

  // ── 멤버 삭제 ──────────────────────────────────────
  deleteMember: async (id) => {
    const { error } = await supabase.from('members').delete().eq('id', id);
    if (error) { set({ error: error.message }); return; }
    set(state => ({ members: state.members.filter(m => m.id !== id) }));
  },
}));

// ─────────────────────────────────────────────────────────────
// DB (snake_case) → 앱 타입 (camelCase) 변환
// ─────────────────────────────────────────────────────────────
function dbToProject(row: any): Project {
  return {
    id:                     row.id,
    campaignName:           row.campaign_name,
    committeeSheetLink:     row.committee_sheet_link ?? '',
    rValue:                 row.r_value,
    commission:             Number(row.commission),
    team:                   row.team,
    pl:                     row.pl,
    submittedAt:            row.submitted_at,
    year:                   row.year,
    status:                 row.status,
    incentiveRate:          row.incentive_rate,
    incentiveFund:          row.incentive_fund,
    firstPaymentDate:       row.first_payment_date ?? undefined,
    firstPaymentRatio:      row.first_payment_ratio,
    secondPaymentRatio:     row.second_payment_ratio,
    secondPaymentDate:      row.second_payment_date ?? undefined,
    firstPaymentCompleted:  row.first_payment_completed,
    secondPaymentCompleted: row.second_payment_completed,
    slackNotified:          row.slack_notified,
    note:                   row.note ?? undefined,
    members: (row.project_members ?? []).map((m: any) => ({
      memberId:     m.member_id,
      memberName:   m.member_name,
      contribution: m.contribution,
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// 앱 타입 → DB row 변환
// ─────────────────────────────────────────────────────────────
function projectToDb(p: Project) {
  const row = {
    id:                      p.id,
    campaign_name:           p.campaignName,
    committee_sheet_link:    p.committeeSheetLink || null,
    r_value:                 p.rValue,
    commission:              p.commission,
    team:                    p.team,
    pl:                      p.pl,
    submitted_at:            p.submittedAt,
    year:                    p.year,
    status:                  p.status,
    incentive_rate:          p.incentiveRate,
    incentive_fund:          p.incentiveFund,
    first_payment_date:      p.firstPaymentDate || null,
    first_payment_ratio:     p.firstPaymentRatio,
    second_payment_ratio:    p.secondPaymentRatio,
    second_payment_date:     p.secondPaymentDate || null,
    first_payment_completed:  p.firstPaymentCompleted,
    second_payment_completed: p.secondPaymentCompleted,
    slack_notified:          p.slackNotified,
    note:                    p.note || null,
  };

  const members = p.members.map(m => ({
    project_id:  p.id,
    member_id:   m.memberId,
    member_name: m.memberName,
    contribution: m.contribution,
  }));

  return { row, members };
}
