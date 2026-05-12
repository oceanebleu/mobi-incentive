'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  X,
  ExternalLink,
  Loader2,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  Save,
} from 'lucide-react';
import clsx from 'clsx';
import { formatKRWFull, formatCommission, formatDate, withCommas } from '@/lib/utils';
import {
  useIncentiveData,
  paymentStageOf,
  PAYMENT_STAGE_LABEL,
  ACQUISITION_LABEL,
  type PaymentStage,
  type SupabaseProject,
} from '@/lib/incentive-data';

const ACQ_OPTIONS = ['WON', 'LOST', 'CANCELLED', 'PENDING', 'REVIEWING', 'RESULT_PENDING'] as const;
type AcqFilter = (typeof ACQ_OPTIONS)[number] | 'ALL';
type StageFilter = PaymentStage | 'ALL';

export default function ProjectsPage() {
  const { projects, loading, error, refresh } = useIncentiveData();

  const [search, setSearch] = useState('');
  const [filterAcq, setFilterAcq] = useState<AcqFilter>('ALL');
  const [filterStage, setFilterStage] = useState<StageFilter>('ALL');
  const [filterYear, setFilterYear] = useState<number | 'ALL'>('ALL');

  // 편집 모달 상태: null = 닫힘, {} = 신규, {...project} = 편집
  const [editing, setEditing] = useState<SupabaseProject | null | 'new'>(null);

  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const p of projects) {
      if (p.submitted_at) ys.add(parseInt(p.submitted_at.slice(0, 4), 10));
    }
    return [...ys].sort((a, b) => b - a);
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter(p => {
      const q = search.trim().toLowerCase();
      if (q) {
        const hay = [p.campaign_name, p.pl, p.team, p.id]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterAcq !== 'ALL' && (p.acquisition_status ?? 'PENDING') !== filterAcq) return false;
      if (filterStage !== 'ALL' && paymentStageOf(p) !== filterStage) return false;
      if (filterYear !== 'ALL') {
        const y = p.submitted_at ? parseInt(p.submitted_at.slice(0, 4), 10) : 0;
        if (y !== filterYear) return false;
      }
      return true;
    });
  }, [projects, search, filterAcq, filterStage, filterYear]);

  async function handleDelete(p: SupabaseProject) {
    if (!confirm(`"${p.campaign_name}" (${p.id}) 프로젝트를 삭제할까요?\n참여 멤버 ${p.members.length}명의 지급 기록도 함께 삭제됩니다.`))
      return;
    const res = await fetch(`/api/projects/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`삭제 실패: ${j?.error ?? res.status}`);
      return;
    }
    refresh();
  }

  return (
    <div className="p-8 space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">프로젝트 관리</h1>
          <p className="text-sm text-gray-400 mt-0.5">수주인센티브 운영위원회 프로젝트 — 웹에서 직접 편집 가능</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus size={15} />
          프로젝트 추가
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5" />
          <span>조회 실패: {error}</span>
        </div>
      )}

      {/* 필터 바 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="캠페인명, PL, 팀 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X size={13} className="text-gray-400" />
            </button>
          )}
        </div>
        <select
          value={filterYear}
          onChange={e =>
            setFilterYear(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
          }
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-600"
        >
          <option value="ALL">전체 연도</option>
          {years.map(y => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <select
          value={filterStage}
          onChange={e => setFilterStage(e.target.value as StageFilter)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-600"
        >
          <option value="ALL">전체 단계</option>
          {(Object.keys(PAYMENT_STAGE_LABEL) as PaymentStage[]).map(s => (
            <option key={s} value={s}>
              {PAYMENT_STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={filterAcq}
          onChange={e => setFilterAcq(e.target.value as AcqFilter)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-600"
        >
          <option value="ALL">전체 수주여부</option>
          {ACQ_OPTIONS.map(a => (
            <option key={a} value={a}>
              {ACQUISITION_LABEL[a]}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-gray-400">{filtered.length}건</span>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {[
                  '캠페인명',
                  '연도',
                  '담당팀',
                  'PL',
                  '수주여부',
                  '지급 단계',
                  '인센티브 재원',
                  '1차 지급',
                  '2차 지급',
                  '관리',
                ].map(h => (
                  <th
                    key={h}
                    className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-sm text-gray-400">
                    <Loader2 size={20} className="animate-spin mx-auto mb-2 opacity-50" />
                    데이터 불러오는 중...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-sm text-gray-400">
                    프로젝트가 없습니다
                  </td>
                </tr>
              ) : (
                filtered.map(p => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    onEdit={() => setEditing(p)}
                    onDelete={() => handleDelete(p)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 편집/추가 모달 */}
      {editing !== null && (
        <ProjectModal
          project={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ProjectRow({
  project: p,
  onEdit,
  onDelete,
}: {
  project: SupabaseProject;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const acq = (p.acquisition_status ?? 'PENDING') as keyof typeof ACQUISITION_LABEL;
  const acqCls =
    acq === 'WON'
      ? 'bg-emerald-50 text-emerald-700'
      : acq === 'LOST'
      ? 'bg-red-50 text-red-700'
      : acq === 'CANCELLED'
      ? 'bg-gray-100 text-gray-500'
      : 'bg-amber-50 text-amber-700';

  const stage = paymentStageOf(p);
  const stageCls =
    stage === 'ALL_PAID'
      ? 'bg-emerald-100 text-emerald-800'
      : stage.includes('PAID')
      ? 'bg-blue-100 text-blue-700'
      : stage === 'FUND_CONFIRMED'
      ? 'bg-indigo-50 text-indigo-700'
      : 'bg-gray-100 text-gray-600';

  const year = p.submitted_at ? parseInt(p.submitted_at.slice(0, 4), 10) : '-';

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Link
            href={`/projects/${encodeURIComponent(p.id)}`}
            className="font-medium text-gray-900 hover:text-blue-600 max-w-[240px] truncate"
          >
            {p.campaign_name}
          </Link>
          {p.committee_sheet_link && (
            <a
              href={p.committee_sheet_link}
              target="_blank"
              rel="noreferrer"
              className="text-gray-300 hover:text-blue-500"
            >
              <ExternalLink size={12} />
            </a>
          )}
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5">
          {p.id} · 참여 {p.members.length}명 · R값 {p.r_value ? formatKRWFull(p.r_value) : '-'}
        </div>
      </td>
      <td className="px-4 py-3 text-gray-600">{year}년</td>
      <td className="px-4 py-3 text-gray-600">{p.team ?? '-'}</td>
      <td className="px-4 py-3 text-gray-700 font-medium">{p.pl ?? '-'}</td>
      <td className="px-4 py-3">
        <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded-full', acqCls)}>
          {ACQUISITION_LABEL[acq]}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={clsx('text-[11px] font-medium px-2 py-0.5 rounded-full', stageCls)}>
          {PAYMENT_STAGE_LABEL[stage]}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{formatKRWFull(p.incentive_fund)}</div>
        <div className="text-[11px] text-gray-400">
          {p.commission != null ? formatCommission(p.commission) : '-'}
          {p.category && ` · ${p.category}`}
        </div>
      </td>
      <td className="px-4 py-3">
        {p.first_payment_date ? (
          <div>
            <div
              className={clsx(
                'text-xs font-medium',
                p.first_payment_completed ? 'text-emerald-600' : 'text-amber-600'
              )}
            >
              {formatDate(p.first_payment_date)}
            </div>
            <div className="text-[11px] text-gray-400">
              {p.first_payment_ratio != null && `${p.first_payment_ratio}%`}{' '}
              · {p.first_payment_completed ? '✓ 완료' : '대기'}
            </div>
          </div>
        ) : (
          <span className="text-gray-300 text-xs">미정</span>
        )}
      </td>
      <td className="px-4 py-3">
        {p.second_payment_date ? (
          <div>
            <div
              className={clsx(
                'text-xs font-medium',
                p.second_payment_completed ? 'text-emerald-600' : 'text-amber-600'
              )}
            >
              {formatDate(p.second_payment_date)}
            </div>
            <div className="text-[11px] text-gray-400">
              {p.second_payment_ratio != null && `${p.second_payment_ratio}%`}{' '}
              · {p.second_payment_completed ? '✓ 완료' : '대기'}
            </div>
          </div>
        ) : (
          <span className="text-gray-300 text-xs">미정</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            title="편집"
            className="p-1.5 rounded hover:bg-blue-50 text-blue-600 hover:text-blue-800"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            title="삭제"
            className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────
// 편집 / 추가 모달
// ─────────────────────────────────────────────
function ProjectModal({
  project,
  onClose,
  onSaved,
}: {
  project: SupabaseProject | null; // null = 신규
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!project;

  const [form, setForm] = useState({
    id: project?.id ?? '',
    campaign_name: project?.campaign_name ?? '',
    committee_sheet_link: project?.committee_sheet_link ?? '',
    r_value: project?.r_value ?? 0,
    commission: project?.commission ?? null,
    team: project?.team ?? '',
    pl: project?.pl ?? '',
    submitted_at: project?.submitted_at ?? '',
    distributed: project?.distributed ?? false,
    distributed_at: project?.distributed_at ?? '',
    acquisition_status: project?.acquisition_status ?? 'PENDING',
    pl_completed: project?.pl_completed ?? false,
    fund_confirmed: project?.fund_confirmed ?? false,
    incentive_fund: project?.incentive_fund ?? 0,
    first_payment_date: project?.first_payment_date ?? '',
    first_payment_ratio: project?.first_payment_ratio ?? 60,
    first_payment_completed: project?.first_payment_completed ?? false,
    second_payment_date: project?.second_payment_date ?? '',
    second_payment_ratio: project?.second_payment_ratio ?? 40,
    second_payment_completed: project?.second_payment_completed ?? false,
    campaign_end_date: project?.campaign_end_date ?? '',
    category: project?.category ?? '',
    note: project?.note ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    if (!form.campaign_name.trim()) {
      setError('캠페인명을 입력하세요.');
      return;
    }
    setSaving(true);
    setError(null);

    // 빈 문자열 날짜는 null 로 보내야 함
    const payload: Record<string, any> = { ...form };
    for (const k of [
      'submitted_at',
      'distributed_at',
      'first_payment_date',
      'second_payment_date',
      'campaign_end_date',
      'committee_sheet_link',
      'team',
      'pl',
      'category',
      'note',
    ]) {
      if (payload[k] === '') payload[k] = null;
    }

    try {
      const url = isEdit
        ? `/api/projects/${encodeURIComponent(project!.id)}`
        : `/api/projects`;
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '저장 실패');
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? '오류');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[760px] max-h-[92vh] overflow-y-auto fade-in">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              {isEdit ? '프로젝트 편집' : '프로젝트 추가'}
            </h3>
            {isEdit && (
              <p className="text-[11px] text-gray-400 mt-0.5">{project!.id}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100"
            disabled={saving}
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* 기본 정보 */}
          <Section title="기본 정보">
            <div className="grid grid-cols-2 gap-4">
              <Field label="캠페인명 *" className="col-span-2">
                <input
                  value={form.campaign_name}
                  onChange={e => set('campaign_name', e.target.value)}
                  placeholder="캠페인명 입력"
                  className={inputCls}
                />
              </Field>
              <Field label="운영위원회 시트 URL" className="col-span-2">
                <input
                  value={form.committee_sheet_link ?? ''}
                  onChange={e => set('committee_sheet_link', e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className={inputCls}
                />
              </Field>
              <Field label="담당팀">
                <input
                  value={form.team ?? ''}
                  onChange={e => set('team', e.target.value)}
                  placeholder="마케팅1팀"
                  className={inputCls}
                />
              </Field>
              <Field label="PL">
                <input
                  value={form.pl ?? ''}
                  onChange={e => set('pl', e.target.value)}
                  placeholder="PL 담당자명"
                  className={inputCls}
                />
              </Field>
              <Field label="제출일">
                <input
                  type="date"
                  value={form.submitted_at ?? ''}
                  onChange={e => set('submitted_at', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="구분">
                <select
                  value={form.category ?? ''}
                  onChange={e => set('category', e.target.value)}
                  className={inputCls}
                >
                  <option value="">선택</option>
                  <option value="신규">신규</option>
                  <option value="연장">연장</option>
                  <option value="신규(이전경험 X)">신규(이전경험 X)</option>
                  <option value="신규(이전경험 0)">신규(이전경험 0)</option>
                </select>
              </Field>
            </div>
          </Section>

          {/* 진행 상태 */}
          <Section title="진행 상태">
            <div className="grid grid-cols-3 gap-4">
              <Field label="수주여부">
                <select
                  value={form.acquisition_status ?? 'PENDING'}
                  onChange={e => set('acquisition_status', e.target.value as any)}
                  className={inputCls}
                >
                  {ACQ_OPTIONS.map(a => (
                    <option key={a} value={a}>
                      {ACQUISITION_LABEL[a]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="PL 작성">
                <CheckboxField
                  checked={form.pl_completed}
                  onChange={v => set('pl_completed', v)}
                  label="완료"
                />
              </Field>
              <Field label="사후 확정 (재원확정)">
                <CheckboxField
                  checked={form.fund_confirmed}
                  onChange={v => set('fund_confirmed', v)}
                  label="완료"
                />
              </Field>
            </div>
          </Section>

          {/* 인센티브 재원 */}
          <Section title="인센티브 재원">
            <div className="grid grid-cols-3 gap-4">
              <Field label="R값 (원)">
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.r_value ? withCommas(form.r_value) : ''}
                  onChange={e => {
                    const digits = e.target.value.replace(/[^0-9]/g, '');
                    set('r_value', digits ? Number(digits) : 0);
                  }}
                  placeholder="0"
                  className={inputCls}
                />
              </Field>
              <Field label="수수료 (예: 0.15 = 15%)">
                <input
                  type="number"
                  step="0.001"
                  value={form.commission ?? ''}
                  onChange={e =>
                    set('commission', e.target.value === '' ? null : Number(e.target.value))
                  }
                  placeholder="0.15"
                  className={inputCls}
                />
              </Field>
              <Field label="인센티브 재원 (원)">
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.incentive_fund ? withCommas(form.incentive_fund) : ''}
                  onChange={e => {
                    const digits = e.target.value.replace(/[^0-9]/g, '');
                    set('incentive_fund', digits ? Number(digits) : 0);
                  }}
                  placeholder="0"
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          {/* 1차 / 2차 지급 */}
          <Section title="1차 지급">
            <div className="grid grid-cols-3 gap-4">
              <Field label="지급예정일">
                <input
                  type="date"
                  value={form.first_payment_date ?? ''}
                  onChange={e => set('first_payment_date', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="지급비율 (%)">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.first_payment_ratio ?? ''}
                  onChange={e => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    set('first_payment_ratio', v as any);
                    if (v != null && v <= 100) set('second_payment_ratio', (100 - v) as any);
                  }}
                  className={inputCls}
                />
              </Field>
              <Field label="지급 완료">
                <CheckboxField
                  checked={form.first_payment_completed}
                  onChange={v => set('first_payment_completed', v)}
                  label="완료"
                />
              </Field>
            </div>
          </Section>

          <Section title="2차 지급">
            <div className="grid grid-cols-3 gap-4">
              <Field label="지급예정일">
                <input
                  type="date"
                  value={form.second_payment_date ?? ''}
                  onChange={e => set('second_payment_date', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="지급비율 (%)">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.second_payment_ratio ?? ''}
                  onChange={e => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    set('second_payment_ratio', v as any);
                    if (v != null && v <= 100) set('first_payment_ratio', (100 - v) as any);
                  }}
                  className={inputCls}
                />
              </Field>
              <Field label="지급 완료">
                <CheckboxField
                  checked={form.second_payment_completed}
                  onChange={v => set('second_payment_completed', v)}
                  label="완료"
                />
              </Field>
            </div>
          </Section>

          {/* 기타 */}
          <Section title="기타">
            <div className="grid grid-cols-2 gap-4">
              <Field label="캠페인 종료예정일">
                <input
                  type="date"
                  value={form.campaign_end_date ?? ''}
                  onChange={e => set('campaign_end_date', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="비고" className="col-span-2">
                <textarea
                  value={form.note ?? ''}
                  onChange={e => set('note', e.target.value)}
                  rows={3}
                  placeholder="지급 특이사항, 메모 등"
                  className={clsx(inputCls, 'resize-none')}
                />
              </Field>
            </div>
          </Section>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
              <AlertCircle size={13} className="mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isEdit && (
            <div className="text-[11px] text-gray-400">
              💡 멤버 행(기여도·지급액·지급일)은 프로젝트 상세 페이지에서 별도 편집할 수 있습니다.
              현재 이 모달은 프로젝트 자체 필드만 수정합니다.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEdit ? '저장' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {title}
      </p>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function CheckboxField({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer h-[38px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 accent-blue-600"
      />
      <span className="text-sm text-gray-600">{label}</span>
    </label>
  );
}
