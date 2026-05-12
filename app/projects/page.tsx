'use client';

import { useState, useMemo } from 'react';
import { useIncentiveStore } from '@/lib/store';
import {
  Project,
  ProjectStatus,
  STATUS_LABELS,
  STATUS_ORDER,
  AcquisitionStatus,
  ACQUISITION_LABELS,
  ACQUISITION_ORDER,
} from '@/lib/types';
import { formatKRWFull, formatCommission, formatDate, calcIncentiveFund, generateId, withCommas } from '@/lib/utils';
import StatusBadge from '@/components/ui/StatusBadge';
import { Plus, Search, X, ExternalLink, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

const TEAMS = ['마케팅1팀', '마케팅2팀', '마케팅3팀', '마케팅4팀', '마케팅5팀', '마케팅6팀'];

export default function ProjectsPage() {
  const { projects, members, addProject, updateProject, deleteProject } = useIncentiveStore();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | 'ALL'>('ALL');
  const [filterYear, setFilterYear] = useState<number | 'ALL'>('ALL');
  const [filterAcq, setFilterAcq] = useState<AcquisitionStatus | 'ALL'>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const years = useMemo(() => {
    const ys = [...new Set(projects.map(p => p.year))].sort((a, b) => b - a);
    return ys;
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter(p => {
      const matchSearch = !search ||
        p.campaignName.includes(search) ||
        p.pl.includes(search) ||
        p.team.includes(search);
      const matchStatus = filterStatus === 'ALL' || p.status === filterStatus;
      const matchYear = filterYear === 'ALL' || p.year === filterYear;
      const matchAcq =
        filterAcq === 'ALL' ||
        (p.acquisitionStatus ?? 'PENDING') === filterAcq;
      return matchSearch && matchStatus && matchYear && matchAcq;
    });
  }, [projects, search, filterStatus, filterYear, filterAcq]);

  function openAdd() { setEditingProject(null); setModalOpen(true); }
  function openEdit(p: Project) { setEditingProject(p); setModalOpen(true); }
  function handleDelete(id: string) {
    if (confirm('이 프로젝트를 삭제하시겠습니까?')) deleteProject(id);
  }

  return (
    <div className="p-8 space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">프로젝트 관리</h1>
          <p className="text-sm text-gray-400 mt-0.5">수주인센티브 운영위원회 진행 프로젝트 관리</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <Plus size={15} />프로젝트 추가
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="캠페인명, PL, 팀 검색..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X size={13} className="text-gray-400" /></button>}
        </div>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-gray-600">
          <option value="ALL">전체 연도</option>
          {years.map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as ProjectStatus | 'ALL')}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-gray-600">
          <option value="ALL">전체 상태</option>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select value={filterAcq} onChange={e => setFilterAcq(e.target.value as AcquisitionStatus | 'ALL')}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-gray-600">
          <option value="ALL">전체 수주여부</option>
          {ACQUISITION_ORDER.map(a => <option key={a} value={a}>{ACQUISITION_LABELS[a]}</option>)}
        </select>
        <span className="ml-auto text-xs text-gray-400">{filtered.length}건</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['캠페인명','연도','담당팀','PL','수주여부','상태','인센티브 재원','1차 지급예정일','2차 지급예정일','관리'].map(h => (
                  <th key={h} className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-sm text-gray-400">프로젝트가 없습니다</td></tr>
              ) : filtered.map(p => {
                const acq = p.acquisitionStatus ?? 'PENDING';
                const acqCls =
                  acq === 'WON' ? 'bg-emerald-50 text-emerald-700' :
                  acq === 'LOST' ? 'bg-red-50 text-red-700' :
                  'bg-gray-100 text-gray-500';
                return (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-900 max-w-[200px] truncate">{p.campaignName}</span>
                      {p.committeeSheetLink && (
                        <a href={p.committeeSheetLink} target="_blank" rel="noreferrer" className="text-gray-300 hover:text-blue-500 transition-colors">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{p.members.length}명 참여 · R값 {formatKRWFull(p.rValue)}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.year}년</td>
                  <td className="px-4 py-3 text-gray-600">{p.team}</td>
                  <td className="px-4 py-3 text-gray-700 font-medium">{p.pl}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded-full', acqCls)}>
                      {ACQUISITION_LABELS[acq]}
                    </span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} size="sm" /></td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{formatKRWFull(p.incentiveFund)}</div>
                    <div className="text-[11px] text-gray-400">{formatCommission(p.commission)} × {p.incentiveRate}%</div>
                  </td>
                  <td className="px-4 py-3">
                    {p.firstPaymentDate ? (
                      <div>
                        <div className={clsx('text-xs font-medium', p.firstPaymentCompleted ? 'text-emerald-600' : 'text-amber-600')}>{formatDate(p.firstPaymentDate)}</div>
                        <div className="text-[11px] text-gray-400">{p.firstPaymentRatio}% · {p.firstPaymentCompleted ? '✓ 완료' : '대기중'}</div>
                      </div>
                    ) : <span className="text-gray-300 text-xs">미정</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.secondPaymentDate ? (
                      <div>
                        <div className={clsx('text-xs font-medium', p.secondPaymentCompleted ? 'text-emerald-600' : 'text-amber-600')}>{formatDate(p.secondPaymentDate)}</div>
                        <div className="text-[11px] text-gray-400">{p.secondPaymentRatio}% · {p.secondPaymentCompleted ? '✓ 완료' : '대기중'}</div>
                      </div>
                    ) : <span className="text-gray-300 text-xs">미정</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(p)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">편집</button>
                      <span className="text-gray-200">|</span>
                      <button onClick={() => handleDelete(p.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">삭제</button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <ProjectModal project={editingProject} members={members}
          onClose={() => setModalOpen(false)}
          onSave={(data) => {
            if (editingProject) updateProject(editingProject.id, data);
            else addProject({ ...data, id: generateId() } as Project);
            setModalOpen(false);
          }} />
      )}
    </div>
  );
}

interface ModalProps {
  project: Project | null;
  members: { id: string; name: string; team: string }[];
  onClose: () => void;
  onSave: (data: Partial<Project>) => void;
}

function ProjectModal({ project, members, onClose, onSave }: ModalProps) {
  const isEdit = !!project;
  const [form, setForm] = useState({
    campaignName: project?.campaignName ?? '',
    committeeSheetLink: project?.committeeSheetLink ?? '',
    rValue: project?.rValue ?? 0,
    commission: project?.commission ?? 0.15,
    team: project?.team ?? TEAMS[0],
    pl: project?.pl ?? '',
    submittedAt: project?.submittedAt ?? new Date().toISOString().slice(0, 10),
    year: project?.year ?? new Date().getFullYear(),
    status: project?.status ?? ('PL_PENDING' as ProjectStatus),
    acquisitionStatus: project?.acquisitionStatus ?? ('PENDING' as AcquisitionStatus),
    incentiveRate: project?.incentiveRate ?? 2,
    firstPaymentDate: project?.firstPaymentDate ?? '',
    firstPaymentRatio: project?.firstPaymentRatio ?? 60,
    secondPaymentRatio: project?.secondPaymentRatio ?? 40,
    secondPaymentDate: project?.secondPaymentDate ?? '',
    firstPaymentCompleted: project?.firstPaymentCompleted ?? false,
    secondPaymentCompleted: project?.secondPaymentCompleted ?? false,
    note: project?.note ?? '',
    slackNotified: project?.slackNotified ?? false,
    members: project?.members ?? [],
  });

  const incentiveFund = calcIncentiveFund(form.rValue, form.commission, form.incentiveRate);
  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay">
      <div className="bg-white rounded-2xl shadow-2xl w-[680px] max-h-[90vh] overflow-y-auto fade-in">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">{isEdit ? '프로젝트 편집' : '프로젝트 추가'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} className="text-gray-500" /></button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <Section title="기본 정보">
            <div className="grid grid-cols-2 gap-4">
              <Field label="캠페인명" className="col-span-2"><input value={form.campaignName} onChange={e => set('campaignName', e.target.value)} placeholder="캠페인명 입력" className={inputCls} /></Field>
              <Field label="운영위원회 시트 링크" className="col-span-2"><input value={form.committeeSheetLink} onChange={e => set('committeeSheetLink', e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className={inputCls} /></Field>
              <Field label="담당팀"><select value={form.team} onChange={e => set('team', e.target.value)} className={inputCls}>{TEAMS.map(t => <option key={t} value={t}>{t}</option>)}</select></Field>
              <Field label="PL"><input value={form.pl} onChange={e => set('pl', e.target.value)} placeholder="PL 담당자명" className={inputCls} /></Field>
              <Field label="제출일"><input type="date" value={form.submittedAt} onChange={e => set('submittedAt', e.target.value)} className={inputCls} /></Field>
              <Field label="연도"><input type="number" value={form.year} onChange={e => set('year', Number(e.target.value))} className={inputCls} /></Field>
              <Field label="진행 상태">
                <select value={form.status} onChange={e => set('status', e.target.value as ProjectStatus)} className={inputCls}>
                  {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </Field>
              <Field label="수주여부">
                <select value={form.acquisitionStatus} onChange={e => set('acquisitionStatus', e.target.value as AcquisitionStatus)} className={inputCls}>
                  {ACQUISITION_ORDER.map(a => <option key={a} value={a}>{ACQUISITION_LABELS[a]}</option>)}
                </select>
              </Field>
            </div>
          </Section>
          <Section title="인센티브 재원">
            <div className="grid grid-cols-3 gap-4">
              <Field label="R값 (원)"><input
                type="text"
                inputMode="numeric"
                value={form.rValue ? withCommas(form.rValue) : ''}
                onChange={e => {
                  const digits = e.target.value.replace(/[^0-9]/g, '');
                  set('rValue', digits ? Number(digits) : 0);
                }}
                placeholder="0"
                className={inputCls}
              /></Field>
              <Field label="수수료 (예: 0.15)"><input type="number" step="0.01" value={form.commission} onChange={e => set('commission', Number(e.target.value))} className={inputCls} /></Field>
              <Field label="인센티브율"><select value={form.incentiveRate} onChange={e => set('incentiveRate', Number(e.target.value))} className={inputCls}><option value={1}>1%</option><option value={2}>2%</option></select></Field>
            </div>
            <div className="mt-3 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-600">인센티브 재원: <span className="font-bold">{formatKRWFull(incentiveFund)}</span></p>
            </div>
          </Section>
          <Section title="지급 정보">
            <div className="grid grid-cols-2 gap-4">
              <Field label="1차 지급예정일"><input type="date" value={form.firstPaymentDate} onChange={e => set('firstPaymentDate', e.target.value)} className={inputCls} /></Field>
              <Field label="1차 지급비율 (%)"><input type="number" value={form.firstPaymentRatio} onChange={e => { const v = Number(e.target.value); set('firstPaymentRatio', v); set('secondPaymentRatio', 100 - v); }} className={inputCls} /></Field>
              <Field label="2차 지급예정일"><input type="date" value={form.secondPaymentDate} onChange={e => set('secondPaymentDate', e.target.value)} className={inputCls} /></Field>
              <Field label="2차 지급비율 (%)"><input type="number" value={form.secondPaymentRatio} onChange={e => { const v = Number(e.target.value); set('secondPaymentRatio', v); set('firstPaymentRatio', 100 - v); }} className={inputCls} /></Field>
              <Field label="1차 지급 완료"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.firstPaymentCompleted} onChange={e => set('firstPaymentCompleted', e.target.checked)} className="w-4 h-4 accent-blue-600" /><span className="text-sm text-gray-600">완료</span></label></Field>
              <Field label="2차 지급 완료"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.secondPaymentCompleted} onChange={e => set('secondPaymentCompleted', e.target.checked)} className="w-4 h-4 accent-blue-600" /><span className="text-sm text-gray-600">완료</span></label></Field>
            </div>
          </Section>
          <Section title="비고"><textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2} placeholder="메모 또는 특이사항 입력..." className={clsx(inputCls, 'resize-none')} /></Section>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium">취소</button>
          <button onClick={() => { if (!form.campaignName.trim()) { alert('캠페인명을 입력해주세요.'); return; } onSave({ ...form, incentiveFund }); }} className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">{isEdit ? '저장' : '추가'}</button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white';
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</p>{children}</div>;
}
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>{children}</div>;
}
