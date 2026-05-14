'use client';

// ─────────────────────────────────────────────────────────────
// /pl/projects/[id]?emp=<사번>
// PL 본인이 멤버·기여도 + 9가지 판단 사유 + 위원회 구성 입력
// 저장 시 PUT /api/pl/projects/[id] — 관리자 화면의 [참여 멤버 및 기여도]
// 와 PL 양식 섹션에 즉시 반영
// ─────────────────────────────────────────────────────────────

import { Suspense, useEffect, useMemo, useState } from 'react';
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
  role: string;       // 'PL' | 'PJ'
  team_name: string;  // 팀명
  duty: string;       // 담당 업무 상세
}

// 멤버 행 — 팀 드롭다운 옵션
const TEAM_OPTIONS = [
  '마케팅1팀',
  '마케팅2팀',
  '마케팅3팀',
  '마케팅4팀',
  '마케팅5팀',
  '마케팅6팀',
  'Creative.Lab',
  '세일즈TFT',
  'CC',
  'AI Tech Lab',
  'R&D',
];
const ROLE_OPTIONS = [
  { value: 'PL', label: 'PL' },
  { value: 'PJ', label: 'PJ팀원' },
];

// 인센티브 재원율 — 카테고리에 따른 기본값 (UI는 PL이 수정 불가, 관리자만 수정)
const FUND_RATE_BY_CATEGORY: Record<string, number> = {
  연장: 0.01,
  신규: 0.02,
};
const defaultFundRate = (category: string | null | undefined) =>
  FUND_RATE_BY_CATEGORY[(category ?? '').trim()] ?? 0.01;

// 위원회 구성 — 현재 정책상 고정값 (변경 필요 시 한 곳만 수정)
const COMMITTEE_DIVISION_HEAD = '이광수';
const COMMITTEE_CO1 = '안민혁';

interface FormState {
  // 위원회 구성
  pl_name: string;            // projects.pl — 자동 파싱, 수정 가능
  // 캠페인 운영 일정
  won_date: string;           // 수주 확정 일자 = projects.first_payment_date
  campaign_end_date: string;  // 캠페인 운영 종료 예상일 = projects.second_payment_date
  // 총 예산 및 수수료
  r_value: string;            // 콤마 표시용 — 내부적으로 숫자 문자열 (콤마 제거)
  commission_pct: string;     // 0~100 (%), 소숫점 2자리
  budget_note: string;
  // 케이스 + 의견 페어
  client_importance_case: string;
  client_importance: string;
  rfp_route_case: string;
  rfp_route: string;
  prep_effort_case: string;
  prep_effort: string;
  bidding_difficulty_case: string;
  bidding_difficulty: string;
  proposal_resource_case: string;
  proposal_resource: string;
  external_expert_case: string;
  external_expert: string;
  stop_risk_case: string;
  stop_risk: string;
}

const EMPTY_FORM: FormState = {
  pl_name: '',
  won_date: '',
  campaign_end_date: '',
  r_value: '',
  commission_pct: '',
  budget_note: '',
  client_importance_case: '',
  client_importance: '',
  rfp_route_case: '',
  rfp_route: '',
  prep_effort_case: '',
  prep_effort: '',
  bidding_difficulty_case: '',
  bidding_difficulty: '',
  proposal_resource_case: '',
  proposal_resource: '',
  external_expert_case: '',
  external_expert: '',
  stop_risk_case: '',
  stop_risk: '',
};

// 천단위 콤마 표시 ↔ 숫자 문자열 변환 헬퍼
const onlyDigits = (s: string) => s.replace(/[^\d]/g, '');
const withCommas = (digits: string) => {
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// 판단 사유 7개 — 케이스 선택 + 정성적 의견 입력
type JudgmentField = {
  caseKey: keyof FormState;
  noteKey: keyof FormState;
  label: string;
  cases: Array<{ value: string; label: string }>;
  guide?: string;
};

const JUDGMENT_FIELDS: JudgmentField[] = [
  {
    caseKey: 'client_importance_case',
    noteKey: 'client_importance',
    label: '고객 중요도',
    cases: [
      { value: '1', label: '1. 높음. 산업군 내 상위 고객사임' },
      {
        value: '2',
        label:
          '2. 높음. 예상 수익은 적지만 이 고객사를 레퍼런스 삼아 더 큰 기업 영업해볼 수 있음',
      },
    ],
    guide: '자사에 의미있는 고객사 / 레퍼런스 가치.',
  },
  {
    caseKey: 'rfp_route_case',
    noteKey: 'rfp_route',
    label: '세일즈 케이스 (RFP 수취 루트)',
    cases: [
      { value: '1', label: '1. PL이 직접 RFP 수취' },
      { value: '2', label: '2. 세일즈TF에서 RFP 수취' },
      { value: '3', label: '3. 기존 고객사 연장 비딩 (기존 고객사 운영팀에서 수취)' },
      { value: '4', label: '4. 경영진이 별도 영업 통해 수취, 수주과정에서 PL의 역할은 미미함' },
      { value: '5', label: '5. 인바운드로 인입' },
    ],
    guide: 'RFP 수취 과정에서 수주PJ팀의 기여도.',
  },
  {
    caseKey: 'prep_effort_case',
    noteKey: 'prep_effort',
    label: '사전 영업 정도',
    cases: [
      { value: '1', label: '1. PL/세일즈TF가 지속적으로 사전 영업을 해왔음' },
      { value: '2', label: '2. 사전영업이 이뤄졌다고 보기 어려움' },
    ],
    guide: '사전 영업이 얼마나 되어있는가.',
  },
  {
    caseKey: 'bidding_difficulty_case',
    noteKey: 'bidding_difficulty',
    label: '비딩 난이도',
    cases: [
      {
        value: '1',
        label: '1. 경쟁 비딩 — 우리와 관계도가 적은 고객사이고 기존 대행사와의 경쟁에서 이겨야 함',
      },
      { value: '2', label: '2. 경쟁 비딩 — 우선협상 대상자로 선정되어 수주 가능성 높은 편' },
      { value: '3', label: '3. 단독 비딩, 간단한 제안서로 종결 가능성 있음' },
    ],
    guide: '비딩 경쟁 측면에서 우리에게 유리(용이)한 상황인지.',
  },
  {
    caseKey: 'proposal_resource_case',
    noteKey: 'proposal_resource',
    label: '제안 리소스',
    cases: [
      {
        value: '1',
        label: '1. 제안 컨텐츠가 중요하고, 리서치부터 수수료율 결정까지 철저한 준비가 필요',
      },
      { value: '2', label: '2. 회사(자사)의 네임밸류가 중요함' },
      {
        value: '3',
        label:
          '3. (제안 내용 보다는) 수수료율에 민감히 반응하는 건이라 수수료율 수준에 따라 수주여부가 결정됨',
      },
    ],
    guide: '제안 리소스가 어느 만큼 들어가는가.',
  },
  {
    caseKey: 'external_expert_case',
    noteKey: 'external_expert',
    label: '외부 전문가풀 사용 여부 (제안 외주 비용)',
    cases: [
      { value: '해당없음', label: '해당없음' },
      { value: '해당됨', label: '해당됨' },
    ],
    guide: '비용 발생 시 인센티브 재원에서 제외. 사용 시 외주 항목·비용 정성적 의견에 기재.',
  },
  {
    caseKey: 'stop_risk_case',
    noteKey: 'stop_risk',
    label: '실집행 가능성',
    cases: [
      { value: '1', label: '1. 특이사항 없음. 전체 총 예산이 실집행 될 가능성 높음' },
      {
        value: '2',
        label:
          '2. 업계 특성상 2개 이상의 대행사를 선정하는 등의 사유로 이후에 실집행이 안될 가능성이 높음',
      },
      { value: '3', label: '3. 2년 계약건으로 내년에도 비딩없이 연속해서 실집행 될 예정임' },
    ],
    guide: '진행될 확률이 낮은(이력이 있는) 광고주인지 + 제안/산업 특성 고려.',
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

// useSearchParams() 는 Suspense 안에서 호출되어야 정적 prerender 충돌 없음.
export default function PLProjectFormPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">
          <Loader2 size={14} className="animate-spin mr-2" />
          불러오는 중...
        </div>
      }
    >
      <PLProjectFormPageInner />
    </Suspense>
  );
}

function PLProjectFormPageInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const projectId = params.id;
  const empIdFromQuery = search?.get('emp') ?? '';
  const codeFromQuery = (search?.get('code') ?? '').toUpperCase();

  // 사번 + 고유코드 — 쿼리에 둘 다 있어야만 직접 진입 가능. 없으면 인증 모달
  const [empId, setEmpId] = useState<string>(empIdFromQuery);
  const [code, setCode] = useState<string>(codeFromQuery);
  const [askAuth, setAskAuth] = useState(false);
  const [empInput, setEmpInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (empIdFromQuery && codeFromQuery) {
      // 정상 진입 — localStorage 캐싱은 보안상 하지 않음
      return;
    }
    setAskAuth(true);
  }, [empIdFromQuery, codeFromQuery]);

  // 데이터 로드
  const [project, setProject] = useState<any>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // 서버 응답(project/members/form)을 폼 상태로 매핑 — GET/PUT 양쪽에서 재사용
  function applyServerData(j: { project: any; members: any[]; form: any }) {
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
        role: m.role ?? '',
        team_name: m.team_name ?? '',
        duty: m.duty ?? '',
      }))
    );
    const f = j.form ?? {};
    const p = j.project ?? {};
    const rValueStr = p.r_value != null ? withCommas(String(p.r_value)) : '';
    const commissionPctStr =
      typeof p.commission === 'number'
        ? (Math.round(p.commission * 10000) / 100).toString()
        : '';
    setForm({
      pl_name: p.pl ?? '',
      won_date: p.first_payment_date ?? '',
      campaign_end_date: p.second_payment_date ?? '',
      r_value: rValueStr,
      commission_pct: commissionPctStr,
      budget_note: f.budget_note ?? '',
      client_importance_case: f.client_importance_case != null ? String(f.client_importance_case) : '',
      client_importance: f.client_importance ?? '',
      rfp_route_case: f.rfp_route_case != null ? String(f.rfp_route_case) : '',
      rfp_route: f.rfp_route ?? '',
      prep_effort_case: f.prep_effort_case != null ? String(f.prep_effort_case) : '',
      prep_effort: f.prep_effort ?? '',
      bidding_difficulty_case: f.bidding_difficulty_case != null ? String(f.bidding_difficulty_case) : '',
      bidding_difficulty: f.bidding_difficulty ?? '',
      proposal_resource_case: f.proposal_resource_case != null ? String(f.proposal_resource_case) : '',
      proposal_resource: f.proposal_resource ?? '',
      external_expert_case: f.external_expert_case ?? '',
      external_expert: f.external_expert ?? '',
      stop_risk_case: f.stop_risk_case != null ? String(f.stop_risk_case) : '',
      stop_risk: f.stop_risk ?? '',
    });
  }

  async function loadData() {
    if (!empId || !code) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/pl/projects/${encodeURIComponent(projectId)}?emp=${encodeURIComponent(empId)}&code=${encodeURIComponent(code)}&_=${Date.now()}`,
        { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? '조회 실패');
      applyServerData(j);
    } catch (e: any) {
      setError(e?.message ?? '오류');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, empId, code]);

  const totalContribution = useMemo(
    () => members.reduce((s, r) => s + (Number.isFinite(r.contribution) ? r.contribution : 0), 0),
    [members]
  );

  // 인센티브 총 재원율 — PL 화면에선 항상 카테고리 정책 그대로 표시
  //   · 신규 → 2% / 연장 → 1%
  //   DB에 저장된 fund_rate 값은 무시 (default 0.01 로 남아있는 과거 데이터 영향 차단)
  //   관리자가 예외 적용하고 싶으면 프로젝트 편집 모달에서 수정 가능 (incentive_fund 에 즉시 반영)
  const fundRate = useMemo(
    () => defaultFundRate(project?.category),
    [project?.category]
  );
  const incentiveFund = useMemo(() => {
    const rv = Number(onlyDigits(form.r_value));
    const cm = form.commission_pct === '' ? NaN : Number(form.commission_pct);
    if (!Number.isFinite(rv) || rv <= 0) return 0;
    if (!Number.isFinite(cm) || cm <= 0) return 0;
    return Math.round(rv * (cm / 100) * fundRate);
  }, [form.r_value, form.commission_pct, fundRate]);

  // 1차/2차 지급 비율 (기본 60/40)
  const firstRatio = Number(project?.first_payment_ratio ?? 60);
  const secondRatio = Number(project?.second_payment_ratio ?? 40);

  // 회차별 멤버 자동 분배 (기여도 × 비율)
  const firstTotal = useMemo(
    () => Math.round((incentiveFund * firstRatio) / 100),
    [incentiveFund, firstRatio]
  );
  const secondTotal = useMemo(
    () => Math.round((incentiveFund * secondRatio) / 100),
    [incentiveFund, secondRatio]
  );

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
        role: 'PJ',
        team_name: '',
        duty: '',
      },
    ]);
  }
  function removeRow(i: number) {
    setMembers(prev => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (saving) return;
    setError(null);

    // 자동 분배: 1차 = incentiveFund × ratio% × contribution/100, 2차 = 동일 공식
    const cleaned = members
      .map(m => ({ ...m, member_name: m.member_name.trim() }))
      .filter(m => m.member_name !== '')
      .map(m => {
        const share = (Number(m.contribution) || 0) / 100;
        return {
          ...m,
          first_amount: Math.round(firstTotal * share),
          second_amount: Math.round(secondTotal * share),
        };
      });

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

    // R값 (콤마 제거 후 숫자) / 수수료 % 검증 — 빈값 허용
    const rValueDigits = onlyDigits(form.r_value);
    const rValueNum = rValueDigits === '' ? null : Number(rValueDigits);
    if (rValueNum !== null && (!Number.isFinite(rValueNum) || rValueNum < 0)) {
      setError('R값은 0 이상의 숫자만 입력 가능합니다.');
      return;
    }
    const commissionNum =
      form.commission_pct === '' ? null : Number(form.commission_pct);
    if (commissionNum !== null && (!Number.isFinite(commissionNum) || commissionNum < 0)) {
      setError('수수료는 0 이상의 숫자(% 단위)만 입력 가능합니다.');
      return;
    }

    // 캠페인 일정 — 빈값 허용하지만 형식 검사
    const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (form.won_date && !isYmd(form.won_date)) {
      setError('수주 확정 일자 형식이 올바르지 않습니다.');
      return;
    }
    if (form.campaign_end_date && !isYmd(form.campaign_end_date)) {
      setError('캠페인 운영 종료 예상일 형식이 올바르지 않습니다.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        members: cleaned,
        form: {
          // 위원회 구성 — PL 이름
          pl_name: form.pl_name.trim(),
          // 캠페인 일정
          won_date: form.won_date || null,
          campaign_end_date: form.campaign_end_date || null,
          // 총 예산/수수료
          r_value: rValueNum,
          commission_pct: commissionNum,
          budget_note: form.budget_note,
          // 케이스 + 의견
          client_importance_case: form.client_importance_case,
          client_importance: form.client_importance,
          rfp_route_case: form.rfp_route_case,
          rfp_route: form.rfp_route,
          prep_effort_case: form.prep_effort_case,
          prep_effort: form.prep_effort,
          bidding_difficulty_case: form.bidding_difficulty_case,
          bidding_difficulty: form.bidding_difficulty,
          proposal_resource_case: form.proposal_resource_case,
          proposal_resource: form.proposal_resource,
          external_expert_case: form.external_expert_case,
          external_expert: form.external_expert,
          stop_risk_case: form.stop_risk_case,
          stop_risk: form.stop_risk,
        },
      };
      const res = await fetch(
        `/api/pl/projects/${encodeURIComponent(projectId)}?emp=${encodeURIComponent(empId)}&code=${encodeURIComponent(code)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 백엔드가 stage/hint 를 함께 내려주면 그대로 노출 — 어디서 실패했는지 즉시 파악
        const parts: string[] = [];
        if (json?.error) parts.push(json.error);
        if (json?.stage) parts.push(`[단계: ${json.stage}]`);
        if (json?.hint) parts.push(`힌트: ${json.hint}`);
        throw new Error(parts.join(' · ') || `저장 실패 (HTTP ${res.status})`);
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);

      // 저장 직후 처리:
      //   ① 응답에 project 가 있으면 그것으로 갱신 (pl_completed=true 가 사용자 화면에도 반영됨)
      //   ② 응답에 members/form 데이터가 의미 있으면 화면에 적용
      //   ③ 응답이 비어 와도 사용자가 방금 입력한 form 은 그대로 유지 (절대 빈 값으로 초기화하지 않음)
      const respHasMembers = Array.isArray(json?.members) && json.members.length > 0;
      const respHasForm = json?.form && Object.keys(json.form).some(k => {
        const v = (json.form as any)[k];
        return v != null && v !== '' && v !== false;
      });
      if (json?.project) {
        // project 정보만 새 상태로 (pl_completed/r_value/commission/일정 등 정확히 반영)
        setProject((prev: any) => ({ ...prev, ...json.project }));
      }
      if (respHasMembers) {
        setMembers(
          (json.members as any[]).map(m => ({
            member_name: m.member_name ?? '',
            is_team_account: !!m.is_team_account,
            contribution: Number(m.contribution) || 0,
            first_amount: Number(m.first_amount) || 0,
            first_paid_at: m.first_paid_at ?? null,
            second_amount: Number(m.second_amount) || 0,
            second_paid_at: m.second_paid_at ?? null,
            role: m.role ?? '',
            team_name: m.team_name ?? '',
            duty: m.duty ?? '',
          }))
        );
      }
      // form 응답이 비어있으면 사용자 입력 그대로 유지 — 절대 초기화하지 않음
      if (respHasForm) {
        // 응답에 새로 저장된 form 이 있으면 케이스/의견 필드만 서버 값으로 sync
        const f = json.form as any;
        setForm(prev => ({
          ...prev,
          budget_note: f.budget_note ?? prev.budget_note,
          client_importance_case:
            f.client_importance_case != null ? String(f.client_importance_case) : prev.client_importance_case,
          client_importance: f.client_importance ?? prev.client_importance,
          rfp_route_case:
            f.rfp_route_case != null ? String(f.rfp_route_case) : prev.rfp_route_case,
          rfp_route: f.rfp_route ?? prev.rfp_route,
          prep_effort_case:
            f.prep_effort_case != null ? String(f.prep_effort_case) : prev.prep_effort_case,
          prep_effort: f.prep_effort ?? prev.prep_effort,
          bidding_difficulty_case:
            f.bidding_difficulty_case != null
              ? String(f.bidding_difficulty_case)
              : prev.bidding_difficulty_case,
          bidding_difficulty: f.bidding_difficulty ?? prev.bidding_difficulty,
          proposal_resource_case:
            f.proposal_resource_case != null
              ? String(f.proposal_resource_case)
              : prev.proposal_resource_case,
          proposal_resource: f.proposal_resource ?? prev.proposal_resource,
          external_expert_case: f.external_expert_case ?? prev.external_expert_case,
          external_expert: f.external_expert ?? prev.external_expert,
          stop_risk_case:
            f.stop_risk_case != null ? String(f.stop_risk_case) : prev.stop_risk_case,
          stop_risk: f.stop_risk ?? prev.stop_risk,
        }));
      }
    } catch (e: any) {
      setError(e?.message ?? '저장 중 오류');
    } finally {
      setSaving(false);
    }
  }

  // 사번 + 고유코드 인증 모달 — 고유 링크로 진입했는데 쿼리가 없을 때
  if (askAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={18} className="text-blue-600" />
            <h1 className="text-base font-bold text-gray-900">본인 확인</h1>
          </div>
          <p className="text-xs text-gray-500 mb-5">
            본인 사번과 개인 고유코드를 입력해 주세요.
          </p>
          <form
            onSubmit={async e => {
              e.preventDefault();
              setAuthError(null);
              const emp = empInput.trim();
              const c = codeInput.trim().toUpperCase();
              if (!emp || !c) {
                setAuthError('사번과 고유코드 모두 필요합니다.');
                return;
              }
              try {
                const res = await fetch('/api/pl/auth', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ emp_id: emp, code: c }),
                });
                const j = await res.json().catch(() => ({}));
                if (!res.ok) {
                  setAuthError(j?.error ?? '확인 실패');
                  return;
                }
                router.replace(
                  `/pl/projects/${encodeURIComponent(projectId)}?emp=${encodeURIComponent(emp)}&code=${encodeURIComponent(c)}`
                );
              } catch {
                setAuthError('네트워크 오류');
              }
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
            <input
              type="text"
              autoComplete="off"
              maxLength={5}
              value={codeInput}
              onChange={e => setCodeInput(e.target.value.toUpperCase())}
              placeholder="개인 고유코드 (예: ABC23)"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 tracking-widest uppercase"
            />
            {authError && (
              <p className="text-xs text-red-700">{authError}</p>
            )}
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
          href={`/pl/projects?emp=${encodeURIComponent(empId)}&code=${encodeURIComponent(code)}`}
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

            {/* ① 위원회 구성 — 부문대표/C.O1 고정, PL/캠페인 구분 자동 파싱 */}
            <Card>
              <CardHeader
                title="① 위원회 구성"
                subtitle="부문대표·C.O1은 고정값입니다. 프로젝트 리더는 자동으로 채워지며 필요 시 수정할 수 있습니다."
              />
              <div className="grid grid-cols-4 gap-4">
                <FixedField label="부문대표" value={COMMITTEE_DIVISION_HEAD} />
                <FixedField label="C.O1" value={COMMITTEE_CO1} />
                <Field
                  label="프로젝트 리더 (PL)"
                  value={form.pl_name}
                  onChange={v => setForm(f => ({ ...f, pl_name: v }))}
                  placeholder="이름"
                />
                <FixedField label="캠페인 구분" value={project.category ?? '-'} />
              </div>
            </Card>

            {/* ② 참여 멤버 및 기여도 */}
            <Card>
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-gray-800">② 참여 멤버 및 기여도</h2>
                <p className="text-[11px] text-gray-500 mt-1">
                  인센티브 총 재원 = R값 × 수수료 × {(fundRate * 100).toFixed(0)}% (
                  {project.category ?? '-'})
                </p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  ※ 1, 2차 지급 총액(비율)은 캠페인 상황 및 운영위원회 검토 결과에 따라 변동될 수 있습니다.
                </p>
              </div>
              <div className="grid grid-cols-5 gap-3 text-xs mb-3">
                <Stat label="멤버" value={`${members.length}명`} />
                <Stat
                  label="기여도 합계"
                  value={`${totalContribution}%`}
                  tone={totalContribution === 100 ? 'good' : 'warn'}
                />
                <Stat
                  label="인센티브 총 재원"
                  value={incentiveFund.toLocaleString('en-US') + '원'}
                  tone="good"
                />
                <Stat
                  label={`1차 지급 총액 (기본 ${firstRatio}%)`}
                  value={firstTotal.toLocaleString('en-US') + '원'}
                />
                <Stat
                  label={`2차 지급 총액 (기본 ${secondRatio}%)`}
                  value={secondTotal.toLocaleString('en-US') + '원'}
                />
              </div>

              <div>
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col className="w-[88px]" />   {/* 구분 */}
                    <col className="w-[110px]" />  {/* 팀 */}
                    <col className="w-[96px]" />   {/* 이름 */}
                    <col className="w-[44px]" />   {/* 팀계정 */}
                    <col />                         {/* 담당 업무 — 가변 */}
                    <col className="w-[76px]" />   {/* 기여도 */}
                    <col className="w-[24px]" />   {/* 삭제 */}
                  </colgroup>
                  <thead>
                    <tr className="text-[11px] text-gray-400 uppercase tracking-wide">
                      <th className="text-left pb-2 font-medium">구분</th>
                      <th className="text-left pb-2 font-medium">팀</th>
                      <th className="text-left pb-2 font-medium">이름</th>
                      <th className="text-center pb-2 font-medium">팀계정</th>
                      <th className="text-left pb-2 font-medium">담당 업무 상세</th>
                      <th className="text-right pb-2 font-medium">기여도(%)</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-2 pr-2">
                          <select
                            value={r.role}
                            onChange={e => updateRow(i, { role: e.target.value })}
                            className="w-full pl-1.5 pr-1 py-1.5 text-xs border border-gray-200 rounded-md bg-white truncate"
                          >
                            <option value="">선택</option>
                            {ROLE_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            value={r.team_name}
                            onChange={e => updateRow(i, { team_name: e.target.value })}
                            className="w-full pl-1.5 pr-1 py-1.5 text-xs border border-gray-200 rounded-md bg-white truncate"
                          >
                            <option value="">선택</option>
                            {TEAM_OPTIONS.map(t => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            value={r.member_name}
                            onChange={e => updateRow(i, { member_name: e.target.value })}
                            placeholder="이름"
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md"
                          />
                        </td>
                        <td className="py-2 px-1 text-center">
                          <input
                            type="checkbox"
                            checked={r.is_team_account}
                            onChange={e => updateRow(i, { is_team_account: e.target.checked })}
                            className="w-4 h-4 accent-emerald-600"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            value={r.duty}
                            onChange={e => updateRow(i, { duty: e.target.value })}
                            placeholder="예: 전략 수립, RFP 분석"
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md"
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
                            className="w-full px-2 py-1.5 text-xs text-right border border-gray-200 rounded-md tabular-nums"
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
                ※ 팀명 'Creative.Lab' 을 선택하셨을 경우, 이름에도 반드시 동일하게 작성 부탁드리며, 팀 계정으로 체크해 주세요.
                <br />※ 1차/2차 지급액은 위 'R값 × 수수료 × {(fundRate * 100).toFixed(0)}%'와 기여도에 따라 자동 계산되어 저장됩니다.
                <br />※ 합계가 100% 인지 확인 후 저장해 주세요.
              </p>
            </Card>

            {/* ③ 캠페인 운영 일정 */}
            <Card>
              <CardHeader
                title="③ 캠페인 운영 일정"
                subtitle="반드시 작성해주시기 바랍니다."
              />
              <div className="grid grid-cols-2 gap-4">
                <DateField
                  label="수주 확정 일자"
                  value={form.won_date}
                  onChange={v => setForm(f => ({ ...f, won_date: v }))}
                />
                <DateField
                  label="캠페인 운영 종료 예상일"
                  value={form.campaign_end_date}
                  onChange={v => setForm(f => ({ ...f, campaign_end_date: v }))}
                />
              </div>
            </Card>

            {/* ④ 총 예산 및 수수료 */}
            <Card>
              <CardHeader title="④ 총 예산 및 수수료" subtitle="R값과 수수료율은 위원회 판단의 기초 자료가 됩니다." />
              <div className="grid grid-cols-2 gap-4">
                <CommaNumberField
                  label="R값"
                  value={form.r_value}
                  onChange={v => setForm(f => ({ ...f, r_value: v }))}
                  suffix="원"
                  placeholder="예: 6,000,000"
                />
                <NumberField
                  label="수수료"
                  value={form.commission_pct}
                  onChange={v => setForm(f => ({ ...f, commission_pct: v }))}
                  suffix="%"
                  step="0.01"
                  min={0}
                  max={100}
                  placeholder="예: 5.25"
                />
              </div>
              <div className="mt-4">
                <TextareaField
                  label="총 예산 및 수수료 — 위원회 참고사항"
                  value={form.budget_note}
                  onChange={v => setForm(f => ({ ...f, budget_note: v }))}
                  placeholder="예: 수수료 산정 근거, 매출 가정, 예외 사항 등"
                />
              </div>
            </Card>

            {/* ⑤ 인센티브 지급 판단 사유 */}
            <Card>
              <CardHeader
                title="⑤ 인센티브 지급 판단 사유"
                subtitle="각 항목에 해당하는 케이스를 선택하고 정성적 의견을 자유롭게 입력해 주세요."
              />
              <div className="space-y-5">
                {JUDGMENT_FIELDS.map(f => (
                  <CaseField
                    key={f.caseKey}
                    label={f.label}
                    guide={f.guide}
                    caseValue={form[f.caseKey]}
                    onCaseChange={v => setForm(prev => ({ ...prev, [f.caseKey]: v }))}
                    cases={f.cases}
                    noteValue={form[f.noteKey]}
                    onNoteChange={v => setForm(prev => ({ ...prev, [f.noteKey]: v }))}
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
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
      />
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 mb-1 block">
        {label} <span className="text-[10px] text-gray-400 font-normal">(yyyy. mm. dd)</span>
      </label>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 tabular-nums"
      />
    </div>
  );
}

// 천단위 콤마 표시 입력 — 사용자가 보는 동안 자동으로 콤마 추가
function CommaNumberField({
  label,
  value,
  onChange,
  suffix,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 mb-1 block">{label}</label>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={e => {
            const digits = onlyDigits(e.target.value);
            onChange(withCommas(digits));
          }}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-md tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function FixedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 mb-1 block">{label}</label>
      <div className="px-3 py-2 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-md">
        {value}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  step,
  min,
  max,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  step?: string;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 mb-1 block">{label}</label>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          step={step}
          min={min}
          max={max}
          className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-md tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function CaseField({
  label,
  guide,
  caseValue,
  onCaseChange,
  cases,
  noteValue,
  onNoteChange,
}: {
  label: string;
  guide?: string;
  caseValue: string;
  onCaseChange: (v: string) => void;
  cases: Array<{ value: string; label: string }>;
  noteValue: string;
  onNoteChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-gray-700 mb-1 block">{label}</label>
      {guide && (
        <p className="text-[11px] text-gray-400 whitespace-pre-wrap mb-2 leading-relaxed">
          {guide}
        </p>
      )}
      <div className="space-y-2">
        <select
          value={caseValue}
          onChange={e => onCaseChange(e.target.value)}
          className={clsx(
            'w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/30',
            caseValue ? 'border-blue-200 bg-blue-50/40 text-gray-800' : 'border-gray-200 text-gray-500'
          )}
        >
          <option value="">— 케이스 선택 —</option>
          {cases.map(c => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <textarea
          value={noteValue}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="정성적 의견 (선택사항)"
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
      </div>
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
