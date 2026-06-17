// ─────────────────────────────────────────────────────────────
// components/projects/ProjectEditModal.tsx
// 프로젝트 편집/추가 모달 — 목록 페이지(/projects)와 상세 페이지(/projects/[id]) 가 공유.
//   - 신규 추가: project=null
//   - 편집: project=SupabaseProject
//   - 저장 성공 시 onSaved 호출 (호출자가 데이터 refresh + 모달 닫기 처리)
// ─────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, Save, X, Pencil, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { withCommas } from '@/lib/utils';
import { ACQUISITION_LABEL, type SupabaseProject } from '@/lib/incentive-data';

const ACQ_OPTIONS = ['WON', 'LOST', 'CANCELLED', 'REVIEWING', 'RESULT_PENDING'] as const;

const inputCls =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white';

export default function ProjectEditModal({
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
    fund_rate: (project as any)?.fund_rate ?? (project?.category === '신규' ? 0.02 : 0.01),
    first_payment_date: project?.first_payment_date ?? '',
    first_payment_ratio: project?.first_payment_ratio ?? 60,
    first_payment_completed: project?.first_payment_completed ?? false,
    first_payment_skipped: project?.first_payment_skipped ?? false,
    second_payment_date: project?.second_payment_date ?? '',
    second_payment_ratio: project?.second_payment_ratio ?? 40,
    second_payment_completed: project?.second_payment_completed ?? false,
    second_payment_skipped: project?.second_payment_skipped ?? false,
    won_date: (project as any)?.won_date ?? '',
    campaign_end_date: project?.campaign_end_date ?? '',
    category: project?.category ?? '',
    note: project?.note ?? '',
    committee_result: (project as any)?.committee_result ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 인센티브 재원 수동 입력 모드 — default 는 자동계산(R값 × 수수료 × 재원율).
  //   기존 프로젝트를 열 때, 저장된 값이 자동계산과 다르면(=과거에 수동 조정됨) 수동 모드로 시작.
  const [manualFund, setManualFund] = useState<boolean>(() => {
    if (!project) return false;
    const rv = Number(project.r_value) || 0;
    const cm = Number(project.commission) || 0;
    const fr = Number((project as any).fund_rate) || (project.category === '신규' ? 0.02 : 0.01);
    const auto = Math.round(rv * cm * fr);
    const stored = Number(project.incentive_fund) || 0;
    return Math.abs(stored - auto) > 1; // 반올림 오차 1원 까지는 자동으로 간주
  });

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  // 현재 자동계산값 (R값 × 수수료 × 재원율, 원 단위 반올림)
  const autoFund = (() => {
    const rv = Number(form.r_value) || 0;
    const cm = Number(form.commission) || 0;
    const fr = Number(form.fund_rate) || 0;
    return Math.round(rv * cm * fr);
  })();

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
      'won_date',
      'campaign_end_date',
      'committee_sheet_link',
      'team',
      'pl',
      'category',
      'note',
      'committee_result',
    ]) {
      if (payload[k] === '') payload[k] = null;
    }
    // 인센티브 재원
    //   · manualFund=false (default): R값 × 수수료 × fund_rate 자동 계산
    //   · manualFund=true: 사용자가 입력한 form.incentive_fund 그대로 사용
    //   저장된 incentive_fund 로 1차/2차 회차 금액이 산출되는 로직은 그대로 유지됨.
    if (!manualFund) {
      const rv = Number(form.r_value) || 0;
      const cm = Number(form.commission) || 0;
      const fr = Number(form.fund_rate) || 0;
      payload.incentive_fund = Math.round(rv * cm * fr);
    } else {
      payload.incentive_fund = Math.max(0, Math.round(Number(form.incentive_fund) || 0));
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
                  onChange={e => {
                    const v = e.target.value;
                    set('category', v);
                    if (v === '신규') set('fund_rate' as any, 0.02 as any);
                    else if (v === '연장') set('fund_rate' as any, 0.01 as any);
                  }}
                  className={inputCls}
                >
                  <option value="">선택</option>
                  <option value="신규">신규</option>
                  <option value="연장">연장</option>
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
              <Field label="구분 → 재원율">
                <select
                  value={String(form.fund_rate)}
                  onChange={e => set('fund_rate' as any, Number(e.target.value) as any)}
                  className={inputCls}
                  title="연장 = 1% / 신규 = 2% (자동 적용되지만 수정 가능)"
                >
                  <option value="0.01">1% (연장 기본)</option>
                  <option value="0.02">2% (신규 기본)</option>
                </select>
              </Field>
              <Field label={manualFund ? '인센티브 재원 (수동 입력)' : '인센티브 재원 (자동 계산)'}>
                {manualFund ? (
                  <div className="flex items-stretch gap-1.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.incentive_fund ? withCommas(form.incentive_fund) : ''}
                      onChange={e => {
                        const digits = e.target.value.replace(/[^0-9]/g, '');
                        set('incentive_fund', digits ? Number(digits) : 0);
                      }}
                      placeholder="0"
                      className={clsx(inputCls, 'tabular-nums')}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        // 자동 계산값으로 되돌리고 수동 모드 해제
                        set('incentive_fund', autoFund);
                        setManualFund(false);
                      }}
                      title={`자동 계산으로 되돌리기 (${withCommas(autoFund)} 원)`}
                      className="flex items-center justify-center px-2 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                    >
                      <RotateCcw size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-stretch gap-1.5">
                    <div className={clsx(inputCls, 'bg-gray-50 text-gray-700 cursor-not-allowed tabular-nums flex-1')}>
                      {`${withCommas(autoFund)} 원`}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        // 자동 계산 결과를 seed 로 수동 모드 진입
                        set('incentive_fund', autoFund);
                        setManualFund(true);
                      }}
                      title="직접 입력 (특이사항으로 자동계산과 다르게 저장)"
                      className="flex items-center justify-center px-2 rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-gray-400 mt-1">
                  {manualFund
                    ? '수동 입력 모드 — 저장된 값으로 1·2차 금액 계산. ↩ 버튼으로 자동으로 복귀.'
                    : 'R값 × 수수료 × 재원율 (자동). ✏ 버튼으로 수동 입력 모드 전환.'}
                </p>
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
              <Field label="지급 상태">
                <PaymentStatusField
                  completed={form.first_payment_completed}
                  skipped={form.first_payment_skipped}
                  onChange={(c, s) => {
                    set('first_payment_completed', c);
                    set('first_payment_skipped', s);
                  }}
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
              <Field label="지급 상태">
                <PaymentStatusField
                  completed={form.second_payment_completed}
                  skipped={form.second_payment_skipped}
                  onChange={(c, s) => {
                    set('second_payment_completed', c);
                    set('second_payment_skipped', s);
                  }}
                />
              </Field>
            </div>
          </Section>

          {/* 기타 */}
          <Section title="기타">
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="수주확정일자"
                hint="PL 양식에서 작성된 값 (1차 지급일과는 별개)"
              >
                <input
                  type="date"
                  value={form.won_date ?? ''}
                  onChange={e => set('won_date', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field
                label="캠페인 운영종료 예상일"
                hint="PL 양식에서 작성된 값 (2차 지급일과는 별개)"
              >
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
              <Field label="운영위원회 결과" className="col-span-2">
                <textarea
                  value={form.committee_result ?? ''}
                  onChange={e => set('committee_result', e.target.value)}
                  rows={4}
                  placeholder="위원회 결정 사항, 지급 판단 사유 등 — PL 위원회 결과 화면에 노출됩니다."
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
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">
        {label}
        {hint && <span className="ml-1.5 text-[10px] font-normal text-gray-400">· {hint}</span>}
      </label>
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

// 회차 지급 상태 (예정 / 완료 / 미지급) — 두 boolean(completed, skipped)을 단일 셀렉트로 통합
function PaymentStatusField({
  completed,
  skipped,
  onChange,
}: {
  completed: boolean;
  skipped: boolean;
  onChange: (completed: boolean, skipped: boolean) => void;
}) {
  const value: 'pending' | 'completed' | 'skipped' = completed
    ? 'completed'
    : skipped
    ? 'skipped'
    : 'pending';

  return (
    <select
      value={value}
      onChange={e => {
        const v = e.target.value as 'pending' | 'completed' | 'skipped';
        onChange(v === 'completed', v === 'skipped');
      }}
      className={clsx(
        inputCls,
        value === 'completed' && 'text-emerald-700',
        value === 'skipped' && 'text-gray-500'
      )}
    >
      <option value="pending">⏳ 예정 / 대기</option>
      <option value="completed">✓ 지급 완료</option>
      <option value="skipped">✗ 미지급</option>
    </select>
  );
}
