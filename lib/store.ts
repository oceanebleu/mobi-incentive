import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Project, Member } from './types';
import { MOCK_PROJECTS, MOCK_MEMBERS } from './mockData';

interface IncentiveStore {
  projects: Project[];
  members: Member[];
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  addMember: (member: Member) => void;
  updateMember: (id: string, updates: Partial<Member>) => void;
  deleteMember: (id: string) => void;
}

export const useIncentiveStore = create<IncentiveStore>()(
  persist(
    (set) => ({
      projects: MOCK_PROJECTS,
      members: MOCK_MEMBERS,

      addProject: (project) =>
        set((state) => ({ projects: [...state.projects, project] })),

      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),

      deleteProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
        })),

      addMember: (member) =>
        set((state) => ({ members: [...state.members, member] })),

      updateMember: (id, updates) =>
        set((state) => ({
          members: state.members.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        })),

      deleteMember: (id) =>
        set((state) => ({
          members: state.members.filter((m) => m.id !== id),
        })),
    }),
    { name: 'incentive-store-v2' }
  )
);
