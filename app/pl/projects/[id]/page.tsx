'use client';

// ─────────────────────────────────────────────────────────────
// /pl/projects/[id]?emp=<사번>
// PL 본인이 멤버·기여도 + 9가지 판단 사유 + 위원회 구성 입력
// 저장 시 PUT /api/pl/projects/[id] — 관리자 화면의 [참여 멤버 및 기여도]
// 와 PL 양식 섹션에 즉시 반영
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Save,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import clsx from 'clsx';

interface MemberRow {
  member_name: string;
  is_team_account: boolean;
  contribution: number;
  first_amount: number;
  first_paid_at: string | null;
  second_amount: number;
  second_paid_at: string | null;
}

interface FormState {
  profit_judgment: string;
  commission_judgment: string;
  client_importance: string;
  rfp_route: string;
  prep_effort: string;
  bidding_difficulty: string;
  proposal_resource: string;
  external_expert: string;
  stop_risk: string;
  committee_division_head: string;
  committee_co1: string;
}

const EMPTY_FORM: FormState = {
  profit_judgment: '',
  commission_judgment: '',
  client_importance: '',
  rfp_route: '',
  prep_effort: '',
  bidding_difficulty: '',
  proposal_resource: '',
  external_expert: '',
  stop_risk: '',
  committee_division_head: '',
  committee_co1: '',
};

// 텍스트 영역 9개 라벨 + 가이드 (CSV 첨부 참고)
const JUDGMENT_FIELDS: Array<{
  key: keyof FormState;
  label: string;
  guide: string;
  placeholder?: string;
}> = [
  {
    key: 'profit_judgment',
    label: '이익율',
    guide: '연간 총 매출. 예상되는 수주이익 규모와 판단 근거.',
  },
  {
    key: 'commission_judgment',
    label: '수수료',
    guide: 'N% (제안 의지부에 따라 다름). 적용된 수수료율과 근거.',
  },
  {
    key: 'client_importance',
    label: '고객 중요도',
    guide:
      '회사적 의미있는 고객사/레퍼런스 인가\n1. 대형·우선군 내 신규 고객사임\n2. 당장 수주 수익은 적지만 이 고객사를 레퍼런스 삼아 더 큰 기회로 확장해볼 수 있음',
  },
  {
    key: 'rfp_route',
    label: '인센종 케이스 (RFP 수취 루트)',
    guide:
      'RFP 수취 과정에서 수주PJ팀이 어떤 기여를 했는가\n1. PL이 직접 RFP 수취\n2. 인센종TF에서 RFP 수취\n3. 기존 고객사 연장 빌딩 (기존 고객사 운영팀에서 수취)\n4. 경영진이 별도 수단 통해 수취, 수주과정에서 PL의 역할은 미미함\n5. 인바운드로 인지',
  },
  {
    key: 'prep_effort',
    label: '사전 작업 정도',
    guide:
      '사전 작업이 얼마나 되어있는가\n1. PL/인센종TF가 지속적으로 사전 작업을 해왔음',
  },
  {
    key: 'bidding_difficulty',
    label: '빌딩 난이도',
    guide:
      '빌딩 경쟁 측면에서 우리에게 유리(=용이)한 상황이 아닌지\n1. 경쟁 빌딩 - 우리의 관계도가 적은 고객사이고 기존 대행사와의 경쟁에서 이겨야 함\n2. 경쟁 빌딩 - 우선 후보 대상으로 선정 되어 수주 가능성 높은 편\n3. 단독 빌딩, 간단한 제안서로 종결 가능성 있음',
  },
  {
    key: 'proposal_resource',
    label: '제안 리소스',
    guide:
      '제안 리소스가 얼마나 들어가는가\n1. 제안 컨텐츠가 중요하고, 리서치부터 수수료율 결정까지 철저한 준비가 필요\n2. 회사(임원)의 다양한 발등이 중요함\n3. (제안 내용 보다는) 수수료율에 민감히 반응하는 건이라 수수료율 수준에 따라 수주여부가 결정됨',
  },
  {
    key: 'external_expert',
    label: '외부 전문가 사용 여부 (제안 외주 비용)',
    guide:
      '비용 발생 시 인센티브 이송에서 제외\n- 해당없음\n- YES. 예시) 상권 환경 과장된 전문성 분석 및 의견반영 외주 (50만원)',
  },
  {
    key: 'stop_risk',
    label: '중지될 가능성',
    guide:
      '진행시킬 확률이 낮은(이력이 있는)광고주인지 또는 알고, 산업 특성 고려\n1. 특이사항 없음. 전체 총 매출이 중지될 가능성 높음\n2. 알고 특성상 2개 이상의 대행사를 선정하고, 이후에 중지가 있을 가능성이 높음\n3. 2년 계약건으로 봐두었던 빌딩이어서 연속해서 중지될 예정임',
  },
];

const ACQ_LABEL: Record<string, string> = {
  WON: '수주성공',
  LOST: '수주실패',
  CANCELLED: '대행종료',
  PENDING: '진행중',
  REVIEWING: '제안진행',
  RESULT_PENDING: '결과대기',
};

export default function PLProjectFormPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const projectId = params.id;
  const empIdFromQuery = search?.get('emp') ?? '';

  // 사번 — 쿼리에 없으면 localStorage → 그래도 없으면 모달
  const [empId, setEmpId] = useState<string>(empIdFromQuery);
  const [askEmp, setAskEmp] = useState(false);
  const [empInput, setEmpInput] = useState('');

  useEffect(() => {
    if (empIdFromQuery) {
      try {
        localStorage.setItem('mobi-pl-emp', empIdFromQuery);
      } catch {}
      return;
    }
    try {
      const cached = localStorage.getItem('mobi-pl-emp');
      if (cached) {
        setEmpId(cached);
        return;
      }
    } catch {}
    setAskEmp(true);
  }, [empIdFromQuery]);

  // 데이터 로드
  const [project, setProject] = useState<any>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!empId) return;
    setLoading(true);
    setError(null);
    fetch(
      `/api/pl/projects/${encodeURIComponent(projectId)}?emp=${encodeURIComponent(empId)}`,
      { cache: 'no-store' }
    )
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? '조회 실패');
        return j;
      })
      .then(j => {
        setProject(j.project);
        setMembers(
          (j.members ?? []).map((m: any) => ({
            member_name: m.member_name ?? '',
            is_team_account: !!m.is_team_account,
            contribution: Number(m.contribution) || 0,
            first_amount: Number(m.first_amount) || 0,
            first_paid_at: m.first_paid_at ?? null,
            second_amount: Number(m.second_amount) || 0,
            second_paid_at: m.second_paid_at ?? null,
          }))
        );
        const f = j.form ?? {};
        setForm({
          profit_judgment: f.profit_judgment ?? '',
          commission_judgment: f.commission_judgment ?? '',
          client_importance: f.client_importance ?? '',
          rfp_route: f.rfp_route ?? '',
          prep_effort: f.prep_effort ?? '',
          bidding_difficulty: f.bidding_difficulty ?? '',
          proposal_resource: f.proposal_resource ?? '',
          external_expert: f.external_expert ?? '',
          stop_risk: f.stop_risk ?? '',
          committee_division_head: f.committee_division_head ?? '',
          committee_co1: f.committee_co1 ?? '',
        });
      })
      .catch(e => setError(e?.message ?? '오류'))
      .finally(() => setLoading(false));
  }, [projectId, empId]);

  const totalContribution = useMemo(
    () => members.reduce((s, r) => s + (Number.isFinite(r.contribution) ? r.contribution : 0), 0),
    [members]
  );
  const firstTotal = useMemo(() => members.reduce((s, r) => s + (r.first_amount || 0), 0), [members]);
  const secondTotal = useMemo(() => members.reduce((s, r) => s + (r.second_amount || 0), 0), [members]);

  function updateRow(i: number, patch: Partial<MemberRow>) {
    setMembers(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setMembers(prev => [
      ...prev,
      {
        member_name: '',
        is_team_account: false,
        contribution: 0,
        first_amount: 0,
        first_paid_at: null,
        second_amount: 0,
        second_paid_at: null,
      },
    ]);
  }
  function removeRow(i: number) {
    setMembers(prev => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (saving) return;
    setError(null);

    const cleaned = members
      .map(m => ({ ...m, member_name: m.member_name.trim() }))
      .filter(m => m.member_name !== '');

    if (cleaned.length === 0) {
      setError('참여 멤버를 최소 한 명 이상 입력해 주세요.');
      return;
    }
    if (
      totalContribution !== 100 &&
      !confirm(
        `기여도 합계가 ${totalContribution}% 입니다 (보통 100%). 그대로 저장할까요?`
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/pl/projects/${encodeURIComponent(projectId)}?emp=${encodeURIComponent(empId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ members: cleaned, form }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '저장 실패');
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (e: any) {
      setError(e?.message ?? '저장 중 오류');
    } finally {
      setSaving(false);
    }
  }

  // 사번 인증 모달 (고유 링크로 진입했는데 쿼리·캐시 모두 없을 때)
  if (askEmp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={18} className="text-blue-600" />
            <h1 className="text-base font-bold text-gray-900">사번 확인</h1>
          </div>
          <p className="text-xs text-gray-500 mb-5">
            본인 확인을 위해 사번을 입력해 주세요.
          </p>
          <form
            onSubmit={e => {
              e.preventDefault();
              const v = empInput.trim();
              if (!v) return;
              try {
                localStorage.setItem('mobi-pl-emp', v);
              } catch {}
              router.replace(
                `/pl/projects/${encodeURIComponent(projectId)}?emp=${encodeURIComponent(v)}`
              );
            }}
            className="space-y-3"
          >
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={empInput}
              onChange={e => setEmpInput(e.target.value)}
              placeholder="사번"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
            <button
              type="submit"
              className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              확인
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-5 py-8 space-y-6">
        <Link
          href={`/pl/projects?emp=${encodeURIComponent(empId)}`}
          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700"
        >
          <ArrowLeft size={12} /> 내 프로젝트 목록
        </Link>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-12 justify-center">
            <Loader2 size={14} className="animate-spin" />
            불러오는 중...
          </div>
        ) : error && !project ? (
          <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        ) : project ? (
          <>
            {/* 헤더 */}
            <div>
              <h1 className="text-xl font-bold text-gray-900">{project.campaign_name}</h1>
              <p className="text-xs text-gray-500 mt-1">
                {project.id}
                {project.submitted_at && <> · 제출 {project.submitted_at}</>}
                {project.team && <> · {project.team}</>}
                {project.acquisition_status && (
                  <> · {ACQ_LABEL[project.acquisition_status] ?? project.acquisition_status}</>
                )}
              </p>
            </div>

            {/* 1) 참여 멤버 및 기여도 */}
            <Card>
              <CardHeader title="① 참여 멤버 및 기여도" />
              <div className="grid grid-cols-4 gap-3 text-xs mb-3">
                <Stat label="멤버" value={`${members.length}명`} />
                <Stat
                  label="기여도 합계"
                  value={`${totalContribution}%`}
                  tone={totalContribution === 100 ? 'good' : 'warn'}
                />
                <Stat label="1차 합계" value={firstTotal.toLocaleString('en-US') + '원'} />
                <Stat label="2차 합계" value={secondTotal.toLocaleString('en-US') + '원'} />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr className="text-[11px] text-gray-400 uppercase tracking-wide">
                      <th className="text-left pb-2 font-medium">이름</th>
                      <th className="text-center pb-2 font-medium w-20">팀계정</th>
                      <th className="text-right pb-2 font-medium w-24">기여도(%)</th>
                      <th className="text-right pb-2 font-medium w-32">1차 금액</th>
                      <th className="text-right pb-2 font-medium w-40">1차 지급일</th>
                      <th className="text-right pb-2 font-medium w-32">2차 금액</th>
                      <th className="text-right pb-2 font-medium w-40">2차 지급일</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            value={r.member_name}
                            onChange={e => updateRow(i, { member_name: e.target.value })}
                            placeholder="이름 또는 팀 계정"
                            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="checkbox"
                            checked={r.is_team_account}
                            onChange={e => updateRow(i, { is_team_account: e.target.checked })}
                            className="w-4 h-4 accent-emerald-600"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            value={r.contribution}
                            onChange={e => updateRow(i, { contribution: Number(e.target.value) })}
                            min={0}
                            max={100}
                            step="0.1"
                            className="w-full px-2 py-1.5 text-sm text-right border border-gray-200 rounded-md tabular-nums"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            value={r.first_amount}
                            onChange={e => updateRow(i, { first_amount: Number(e.target.value) })}
                            min={0}
                            step="1"
                            className="w-full px-2 py-1.5 text-sm text-right border border-gray-200 rounded-md tabular-nums"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="date"
                            value={r.first_paid_at ?? ''}
                            onChange={e => updateRow(i, { first_paid_at: e.target.value || null })}
                            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            value={r.second_amount}
                            onChange={e => updateRow(i, { second_amount: Number(e.target.value) })}
                            min={0}
                            step="1"
                            className="w-full px-2 py-1.5 text-sm text-right border border-gray-200 rounded-md tabular-nums"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="date"
                            value={r.second_paid_at ?? ''}
                            onChange={e => updateRow(i, { second_paid_at: e.target.value || null })}
                            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md"
                          />
                        </td>
                        <td className="py-2 text-center">
                          <button
                            onClick={() => removeRow(i)}
                            className="text-gray-400 hover:text-red-600 transition-colors p-1"
                            title="이 행 삭제"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={addRow}
                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
              >
                <Plus size={13} />
                멤버 추가
              </button>
              <p className="text-[11px] text-gray-400 mt-3">
                ※ 크리에이티브 팀명은 반드시 'Creative.Lab' 으로 작성해 주세요. (팀계정 체크박스 ON)
                <br />※ 합계가 100% 인지 확인 후 저장해 주세요.
              </p>
            </Card>

            {/* 2) 위원회 구성 */}
            <Card>
              <CardHeader title="② 위원회 구성" />
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="부문대표"
                  value={form.committee_division_head}
                  onChange={v => setForm(f => ({ ...f, committee_division_head: v }))}
                  placeholder="이름"
                />
                <Field
                  label="C.O1"
                  value={form.committee_co1}
                  onChange={v => setForm(f => ({ ...f, committee_co1: v }))}
                  placeholder="이름"
                />
              </div>
            </Card>

            {/* 3) 판단 사유 9개 */}
            <Card>
              <CardHeader
                title="③ 인센티브 이송 및 지급 시기 판단 사유"
                subtitle="각 항목에 해당하는 케이스 번호와 보충 설명을 자유롭게 입력해 주세요."
              />
              <div className="space-y-5">
                {JUDGMENT_FIELDS.map(f => (
                  <TextareaField
                    key={f.key}
                    label={f.label}
                    guide={f.guide}
                    value={form[f.key]}
                    onChange={v => setForm(prev => ({ ...prev, [f.key]: v }))}
                    placeholder={f.placeholder}
                  />
                ))}
              </div>
            </Card>

            {/* 에러 & 저장 */}
            {error && (
              <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
                <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
                <span className="break-all">{error}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 sticky bottom-4">
              {savedFlash && (
                <span className="flex items-center gap-1 text-sm text-emerald-700 px-3 py-2 bg-emerald-50 rounded-lg shadow-sm border border-emerald-100">
                  <CheckCircle2 size={14} />
                  저장되었습니다
                </span>
              )}
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 shadow-sm"
              >
                <Save size={14} />
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-xl border border-gray-200 p-6">{children}</div>;
}
function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}
function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'warn';
}) {
  return (
    <div className="bg-gray-50/70 rounded-lg px-3 py-2">
      <p className="text-[10px] text-gray-400 uppercase">{label}</p>
      <p
        className={clsx(
          'text-sm font-semibold mt-0.5',
          tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-gray-800'
        )}
      >
        {value}
      </p>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 mb-1 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      />
    </div>
  );
}
function TextareaField({
  label,
  guide,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  guide?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-gray-700 mb-1 block">{label}</label>
      {guide && (
        <p className="text-[11px] text-gray-400 whitespace-pre-wrap mb-1.5 leading-relaxed">
          {guide}
        </p>
      )}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '내용 입력...'}
        rows={3}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
      />
    </div>
  );
}
