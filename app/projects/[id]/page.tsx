'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  History,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  Save,
  X,
  AlertCircle,
  Link2,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import clsx from 'clsx';
import { formatKRWFull, formatCommission, formatDate } from '@/lib/utils';
import { canManageProjects, type UserRole } from '@/lib/roles';
import {
  useIncentiveData,
  useUserDirectory,
  paymentStageOf,
  PAYMENT_STAGE_LABEL,
  ACQUISITION_LABEL,
  effectivePhaseAmount,
  normalizeDate,
  type SupabaseProject,
  type SupabaseProjectMember,
} from '@/lib/incentive-data';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { projects, loading, error, refresh } = useIncentiveData();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as UserRole | undefined;
  const canEdit = canManageProjects(role);

  const [editing, setEditing] = useState(false);

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 size={16} className="animate-spin" /> 데이터 불러오는 중...
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-8 text-sm text-red-700">조회 실패: {error}</div>
    );
  }

  const project = projects.find(p => p.id === id);
  if (!project) {
    return (
      <div className="p-8 text-center text-gray-400">
        <p>프로젝트를 찾을 수 없습니다.</p>
        <button
          onClick={() => router.push('/projects')}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          돌아가기
        </button>
      </div>
    );
  }

  const stage = paymentStageOf(project);
  const stageCls =
    stage === 'ALL_PAID'
      ? 'bg-emerald-100 text-emerald-800'
      : stage.includes('PAID')
      ? 'bg-blue-100 text-blue-700'
      : stage === 'FUND_CONFIRMED'
      ? 'bg-indigo-50 text-indigo-700'
      : 'bg-gray-100 text-gray-600';

  const acq = project.acquisition_status ?? 'PENDING';
  const year = project.submitted_at ? parseInt(project.submitted_at.slice(0, 4), 10) : '-';

  // 회차별 총 지급액 합계 — DB에 저장된 값이 0이면 자동 환산값(effectivePhaseAmount) 사용
  const firstTotal = project.members.reduce(
    (s, m) => s + effectivePhaseAmount(m, project, 1),
    0
  );
  const secondTotal = project.members.reduce(
    (s, m) => s + effectivePhaseAmount(m, project, 2),
    0
  );

  return (
    <div className="p-8 space-y-6 fade-in">
      <div>
        <button
          onClick={() => router.push('/projects')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-4 transition-colors"
        >
          <ArrowLeft size={15} />
          목록으로
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{project.campaign_name}</h1>
            <p className="text-sm text-gray-400 mt-1">
              {project.id} · {year}년 · {project.team ?? '-'} · PL: {project.pl ?? '-'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
              {ACQUISITION_LABEL[acq] ?? acq}
            </span>
            <span
              className={clsx(
                'text-[11px] font-medium px-2 py-0.5 rounded-full',
                stageCls
              )}
            >
              {PAYMENT_STAGE_LABEL[stage]}
            </span>
            {canEdit && <PLLinkCopyButton projectId={project.id} />}
            {project.committee_sheet_link && (
              <a
                href={project.committee_sheet_link}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
              >
                <ExternalLink size={12} />
                운영위원회 시트
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">인센티브 재원</h2>
          <div className="space-y-2.5">
            <InfoRow label="R값" value={project.r_value ? formatKRWFull(project.r_value) : '-'} />
            <InfoRow
              label="수수료"
              value={project.commission != null ? formatCommission(project.commission) : '-'}
            />
            <InfoRow label="구분" value={project.category ?? '-'} />
            <div className="border-t border-gray-100 pt-2.5">
              <InfoRow
                label="인센티브 재원"
                value={formatKRWFull(project.incentive_fund)}
                highlight
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">1차 지급</h2>
            <PaymentStateBadge
              completed={project.first_payment_completed}
              skipped={project.first_payment_skipped}
              acquisitionLost={project.acquisition_status === 'LOST'}
            />
          </div>
          <div className="space-y-2.5">
            <InfoRow
              label="지급비율"
              value={project.first_payment_ratio != null ? `${project.first_payment_ratio}%` : '-'}
            />
            <InfoRow label="지급액 합계" value={formatKRWFull(firstTotal)} />
            <InfoRow label="지급예정일" value={formatDate(project.first_payment_date ?? undefined)} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">2차 지급</h2>
            <PaymentStateBadge
              completed={project.second_payment_completed}
              skipped={project.second_payment_skipped}
              acquisitionLost={project.acquisition_status === 'LOST'}
            />
          </div>
          <div className="space-y-2.5">
            <InfoRow
              label="지급비율"
              value={
                project.second_payment_ratio != null ? `${project.second_payment_ratio}%` : '-'
              }
            />
            <InfoRow label="지급액 합계" value={formatKRWFull(secondTotal)} />
            <InfoRow
              label="지급예정일"
              value={formatDate(project.second_payment_date ?? undefined)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">참여 멤버 및 기여도</h2>
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
            >
              <Pencil size={12} />
              멤버 편집
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['이름', '기여도', '1차 (지급일)', '2차 (지급일)', '합계'].map((h, i) => (
                <th
                  key={h}
                  className={clsx(
                    'pb-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide',
                    i === 0 ? 'text-left' : 'text-right'
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {project.members.map(m => {
              const eff1 = effectivePhaseAmount(m, project, 1);
              const eff2 = effectivePhaseAmount(m, project, 2);
              return (
                <tr key={m.member_name} className="border-b border-gray-50">
                  <td className="py-3 font-medium text-gray-900">
                    {m.member_name}
                    {m.is_team_account && (
                      <span className="ml-1.5 text-[10px] text-emerald-700 font-medium">[팀]</span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded">
                      {m.contribution}%
                    </span>
                  </td>
                  <td className="py-3 text-right text-sm">
                    <span
                      className={clsx(
                        m.first_paid_at ? 'text-emerald-600 font-medium' : 'text-gray-600'
                      )}
                    >
                      {formatKRWFull(eff1)}
                      {m.first_paid_at && (
                        <span className="ml-1 text-[10px] text-gray-400">
                          {formatDate(m.first_paid_at)}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-3 text-right text-sm">
                    <span
                      className={clsx(
                        m.second_paid_at ? 'text-emerald-600 font-medium' : 'text-gray-600'
                      )}
                    >
                      {formatKRWFull(eff2)}
                      {m.second_paid_at && (
                        <span className="ml-1 text-[10px] text-gray-400">
                          {formatDate(m.second_paid_at)}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-3 text-right font-bold text-gray-900">
                    {formatKRWFull(eff1 + eff2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200">
              <td className="pt-3 text-xs font-semibold text-gray-400">합계</td>
              <td className="pt-3 text-right text-xs font-semibold text-gray-400">
                {project.members.reduce((s, m) => s + m.contribution, 0)}%
              </td>
              <td className="pt-3 text-right font-bold text-gray-700">
                {formatKRWFull(firstTotal)}
              </td>
              <td className="pt-3 text-right font-bold text-gray-700">
                {formatKRWFull(secondTotal)}
              </td>
              <td className="pt-3 text-right font-bold text-blue-700">
                {formatKRWFull(firstTotal + secondTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {project.note && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">비고</h2>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{project.note}</p>
        </div>
      )}

      <PLFormPanel projectId={project.id} />

      <ChangeHistory projectId={project.id} />

      {editing && (
        <MembersEditModal
          project={project}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 멤버 편집 모달 — 행 추가/삭제, 이름·기여도·1차/2차 금액·지급일 편집
//   저장 시 PATCH /api/projects/[id] { members: [...] } 으로 통째 교체
//   감사 로그는 백엔드에서 _members_replaced 로 자동 기록됨
// ─────────────────────────────────────────────

type MemberDraft = {
  uid: string; // React key 안정성용 임시 ID
  member_name: string;
  is_team_account: boolean;
  contribution: number;
  first_amount: number;
  first_paid_at: string | null;
  second_amount: number;
  second_paid_at: string | null;
  role: string;
  team_name: string;
  duty: string;
  // 지급 대상 — null 이면 자동 (지급일 기준 재직 중이면 지급)
  first_payable: boolean | null;
  second_payable: boolean | null;
};

// PL 양식과 동일한 팀 옵션
const ADMIN_TEAM_OPTIONS = [
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

const makeUid = (() => {
  let n = 0;
  return () => `m_${++n}_${Date.now().toString(36)}`;
})();

function toDraft(m: SupabaseProjectMember): MemberDraft {
  return {
    uid: makeUid(),
    member_name: m.member_name,
    is_team_account: m.is_team_account,
    contribution: m.contribution,
    first_amount: m.first_amount,
    first_paid_at: m.first_paid_at,
    second_amount: m.second_amount,
    second_paid_at: m.second_paid_at,
    role: m.role ?? '',
    team_name: m.team_name ?? '',
    duty: m.duty ?? '',
    first_payable: typeof (m as any).first_payable === 'boolean' ? (m as any).first_payable : null,
    second_payable: typeof (m as any).second_payable === 'boolean' ? (m as any).second_payable : null,
  };
}

function MembersEditModal({
  project,
  onClose,
  onSaved,
}: {
  project: SupabaseProject;
  onClose: () => void;
  onSaved: () => void;
}) {
  const directory = useUserDirectory();
  // 자동완성 후보 — 재직자 이름 우선, 퇴사자 후순위
  const nameSuggestions = useMemo(() => {
    const all = Object.keys(directory.lastWorkDateByName);
    return all.sort((a, b) => {
      const sa = directory.statusByName[a] === '퇴사' ? 1 : 0;
      const sb = directory.statusByName[b] === '퇴사' ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return a.localeCompare(b, 'ko');
    });
  }, [directory.lastWorkDateByName, directory.statusByName]);

  const [rows, setRows] = useState<MemberDraft[]>(() => project.members.map(toDraft));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalContribution = useMemo(
    () => rows.reduce((s, r) => s + (Number.isFinite(r.contribution) ? r.contribution : 0), 0),
    [rows]
  );

  // 자동 계산 — 인센티브 재원 × 지급 비율 × 기여도/100
  //   (1차 지급 총액 / 2차 지급 총액 도 동일 공식)
  const firstRatio = Number(project.first_payment_ratio ?? 60);
  const secondRatio = Number(project.second_payment_ratio ?? 40);
  const incentiveFund = Number(project.incentive_fund ?? 0);
  const firstPhaseTotal = Math.round((incentiveFund * firstRatio) / 100);
  const secondPhaseTotal = Math.round((incentiveFund * secondRatio) / 100);

  function computeFirst(contribution: number) {
    return Math.round(firstPhaseTotal * (contribution / 100));
  }
  function computeSecond(contribution: number) {
    return Math.round(secondPhaseTotal * (contribution / 100));
  }

  // 합계 — 미지급(payable=false) 행은 제외
  const firstTotal = useMemo(
    () =>
      rows.reduce((s, r) => {
        if (r.first_payable === false) return s;
        return s + computeFirst(Number(r.contribution) || 0);
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, firstPhaseTotal]
  );
  const secondTotal = useMemo(
    () =>
      rows.reduce((s, r) => {
        if (r.second_payable === false) return s;
        return s + computeSecond(Number(r.contribution) || 0);
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, secondPhaseTotal]
  );

  const dupName = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) {
      const key = r.member_name.trim();
      if (!key) continue;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [k, v] of seen) if (v > 1) return k;
    return null;
  }, [rows]);

  function updateRow(uid: string, patch: Partial<MemberDraft>) {
    setRows(prev => prev.map(r => (r.uid === uid ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows(prev => [
      ...prev,
      {
        uid: makeUid(),
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
        first_payable: null,
        second_payable: null,
      },
    ]);
  }
  function removeRow(uid: string) {
    setRows(prev => prev.filter(r => r.uid !== uid));
  }

  async function save() {
    setError(null);

    // 빈 이름·중복 검사
    const cleaned = rows
      .map(r => ({ ...r, member_name: r.member_name.trim() }))
      .filter(r => r.member_name !== '');
    if (cleaned.length !== rows.length) {
      if (
        !confirm(
          `이름이 비어있는 행 ${rows.length - cleaned.length}개는 저장 시 제외됩니다. 계속할까요?`
        )
      )
        return;
    }
    if (dupName) {
      setError(`멤버 이름이 중복되었습니다: ${dupName}`);
      return;
    }
    if (
      totalContribution !== 100 &&
      cleaned.length > 0 &&
      !confirm(
        `기여도 합계가 ${totalContribution}% 입니다 (보통 100%). 그대로 저장할까요?`
      )
    ) {
      return;
    }

    const payload = {
      members: cleaned.map(r => {
        const contrib = Number(r.contribution) || 0;
        return {
          member_name: r.member_name,
          is_team_account: !!r.is_team_account,
          contribution: contrib,
          first_amount: computeFirst(contrib),
          second_amount: computeSecond(contrib),
          first_paid_at: r.first_paid_at || null,
          second_paid_at: r.second_paid_at || null,
          role: r.role || null,
          team_name: r.team_name || null,
          duty: r.duty || null,
          first_payable: r.first_payable,
          second_payable: r.second_payable,
        };
      }),
    };

    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">참여 멤버 편집</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {project.campaign_name} · {project.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* 합계 요약 */}
        <div className="px-6 py-3 bg-gray-50/70 border-b border-gray-100 grid grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-[11px] text-gray-400">멤버 수</p>
            <p className="font-semibold text-gray-800">{rows.length}명</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400">기여도 합계</p>
            <p
              className={clsx(
                'font-semibold',
                totalContribution === 100 ? 'text-emerald-700' : 'text-amber-700'
              )}
            >
              {totalContribution}% {totalContribution !== 100 && '(보통 100%)'}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400">1차 합계</p>
            <p className="font-semibold text-gray-800">{formatKRWFull(firstTotal)}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400">2차 합계</p>
            <p className="font-semibold text-gray-800">{formatKRWFull(secondTotal)}</p>
          </div>
        </div>

        {/* 행 리스트 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[80px]" />   {/* 구분 */}
              <col className="w-[108px]" />  {/* 팀 */}
              <col className="w-[100px]" />  {/* 이름 */}
              <col className="w-[40px]" />   {/* 팀계정 */}
              <col />                         {/* 담당업무 (가변) */}
              <col className="w-[68px]" />   {/* 기여도 */}
              <col className="w-[100px]" />  {/* 1차 금액 */}
              <col className="w-[52px]" />   {/* 1차 지급? */}
              <col className="w-[100px]" />  {/* 2차 금액 */}
              <col className="w-[52px]" />   {/* 2차 지급? */}
              <col className="w-[24px]" />   {/* 삭제 */}
            </colgroup>
            <thead>
              <tr className="text-[11px] text-gray-400 uppercase tracking-wide">
                <th className="text-left pb-2 font-medium">구분</th>
                <th className="text-left pb-2 font-medium">팀</th>
                <th className="text-left pb-2 font-medium">이름</th>
                <th className="text-center pb-2 font-medium">팀계정</th>
                <th className="text-left pb-2 font-medium">담당 업무</th>
                <th className="text-right pb-2 font-medium">기여도(%)</th>
                <th className="text-right pb-2 font-medium">1차 금액</th>
                <th className="text-center pb-2 font-medium" title="1차 지급 대상 (체크 시 지급)">1차 지급</th>
                <th className="text-right pb-2 font-medium">2차 금액</th>
                <th className="text-center pb-2 font-medium" title="2차 지급 대상 (체크 시 지급)">2차 지급</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-8 text-gray-400">
                    멤버가 없습니다. 아래 [멤버 추가]를 눌러 행을 추가하세요.
                  </td>
                </tr>
              ) : (
                rows.map(r => {
                  const contrib = Number(r.contribution) || 0;
                  const autoFirst = computeFirst(contrib);
                  const autoSecond = computeSecond(contrib);
                  // 지급 대상 자동 디폴트 — 회차 계획일 ≤ 마지막 근무일 이면 지급(true), 그 외 미지급(false)
                  //   1) 팀 계정은 항상 지급 대상
                  //   2) lwd 정보가 없으면 안전하게 true
                  const lwdRaw = r.is_team_account
                    ? null
                    : directory.lastWorkDateByName[r.member_name] ?? null;
                  const lwd = normalizeDate(lwdRaw);
                  const autoPay = (planned: string | null): boolean => {
                    const dN = normalizeDate(planned);
                    if (!lwd || !dN) return true;
                    return dN <= lwd;
                  };
                  const firstPay = r.first_payable ?? autoPay(project.first_payment_date);
                  const secondPay = r.second_payable ?? autoPay(project.second_payment_date);
                  return (
                  <tr key={r.uid} className="border-t border-gray-100">
                    <td className="py-2 pr-2">
                      <select
                        value={r.role}
                        onChange={e => updateRow(r.uid, { role: e.target.value })}
                        className="w-full pl-1.5 pr-1 py-1.5 text-xs border border-gray-200 rounded-md bg-white truncate focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      >
                        <option value="">선택</option>
                        <option value="PL">PL</option>
                        <option value="PJ">PJ팀원</option>
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        value={r.team_name}
                        onChange={e => updateRow(r.uid, { team_name: e.target.value })}
                        className="w-full pl-1.5 pr-1 py-1.5 text-xs border border-gray-200 rounded-md bg-white truncate focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      >
                        <option value="">선택</option>
                        {ADMIN_TEAM_OPTIONS.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        list="member-name-suggestions"
                        type="text"
                        value={r.member_name}
                        onChange={e => updateRow(r.uid, { member_name: e.target.value })}
                        placeholder="이름"
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                      />
                    </td>
                    <td className="py-2 px-1 text-center">
                      <input
                        type="checkbox"
                        checked={r.is_team_account}
                        onChange={e => updateRow(r.uid, { is_team_account: e.target.checked })}
                        className="w-4 h-4 accent-emerald-600"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={r.duty}
                        onChange={e => updateRow(r.uid, { duty: e.target.value })}
                        placeholder="예: 전략 수립, RFP 분석"
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        value={r.contribution}
                        onChange={e =>
                          updateRow(r.uid, { contribution: Number(e.target.value) })
                        }
                        min={0}
                        max={100}
                        step="0.1"
                        className="w-full px-2 py-1.5 text-xs text-right border border-gray-200 rounded-md tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </td>
                    <td className="py-2 pr-2 text-right text-xs text-gray-700 tabular-nums">
                      {formatKRWFull(autoFirst)}
                    </td>
                    <td className="py-2 px-1 text-center">
                      <input
                        type="checkbox"
                        checked={firstPay}
                        onChange={e => updateRow(r.uid, { first_payable: e.target.checked })}
                        title="1차 지급 대상 (체크 해제 시 미지급)"
                        className="w-4 h-4 accent-blue-600"
                      />
                    </td>
                    <td className="py-2 pr-2 text-right text-xs text-gray-700 tabular-nums">
                      {formatKRWFull(autoSecond)}
                    </td>
                    <td className="py-2 px-1 text-center">
                      <input
                        type="checkbox"
                        checked={secondPay}
                        onChange={e => updateRow(r.uid, { second_payable: e.target.checked })}
                        title="2차 지급 대상 (체크 해제 시 미지급)"
                        className="w-4 h-4 accent-blue-600"
                      />
                    </td>
                    <td className="py-2 text-center">
                      <button
                        onClick={() => removeRow(r.uid)}
                        title="이 행 삭제"
                        className="text-gray-400 hover:text-red-600 transition-colors p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
                })
              )}
            </tbody>
          </table>

          {/* 디렉토리 자동완성용 datalist */}
          <datalist id="member-name-suggestions">
            {nameSuggestions.map(n => (
              <option key={n} value={n} />
            ))}
          </datalist>

          <button
            onClick={addRow}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
          >
            <Plus size={13} />
            멤버 추가
          </button>
        </div>

        {/* 에러 / 푸터 */}
        {error && (
          <div className="px-6 pb-2 text-xs text-red-700 flex items-start gap-1.5">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}

        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-60"
          >
            취소
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            <Save size={14} />
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PL 고유 링크 복사 버튼 — 관리자가 Slack/이메일로 PL에게 전달
// ─────────────────────────────────────────────
function PLLinkCopyButton({ projectId }: { projectId: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/pl/projects/${encodeURIComponent(projectId)}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button
      onClick={copy}
      title="PL이 사번 인증 후 양식을 입력할 수 있는 고유 링크"
      className={clsx(
        'flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors',
        copied
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
      )}
    >
      {copied ? <CheckCircle2 size={11} /> : <Link2 size={11} />}
      {copied ? '복사됨' : 'PL 링크 복사'}
    </button>
  );
}

// ─────────────────────────────────────────────
// PL 양식 패널 — 판단 사유 9개 + 위원회 구성을 읽기 전용으로 표시
//   (입력은 /pl/projects/[id] 페이지에서 PL이 직접)
// ─────────────────────────────────────────────
// 관리자 화면에서 PL 양식을 읽기 전용으로 표시 — 케이스 + 정성적 의견 페어
const PL_CASE_LABELS: Record<string, Record<string, string>> = {
  client_importance_case: {
    '1': '1. 높음. 산업군 내 상위 고객사',
    '2': '2. 높음. 레퍼런스 확장 기회',
  },
  rfp_route_case: {
    '1': '1. PL 직접 RFP 수취',
    '2': '2. 세일즈TF에서 RFP 수취',
    '3': '3. 기존 고객사 연장 비딩',
    '4': '4. 경영진 별도 영업',
    '5': '5. 인바운드 인입',
  },
  prep_effort_case: {
    '1': '1. 지속적 사전 영업',
    '2': '2. 사전 영업이 이뤄졌다고 보기 어려움',
  },
  bidding_difficulty_case: {
    '1': '1. 경쟁 비딩 — 어려움',
    '2': '2. 경쟁 비딩 — 우선협상 대상자',
    '3': '3. 단독 비딩',
  },
  proposal_resource_case: {
    '1': '1. 컨텐츠 중요 — 철저한 준비',
    '2': '2. 자사 네임밸류 중요',
    '3': '3. 수수료율에 민감',
  },
  stop_risk_case: {
    '1': '1. 특이사항 없음 — 실집행 가능성 높음',
    '2': '2. 2개 이상 대행사 등으로 실집행 안될 가능성',
    '3': '3. 2년 계약 — 연속 실집행 예정',
  },
};

type PLFieldDef =
  | { kind: 'text'; key: string; label: string }
  | { kind: 'number'; key: string; label: string; suffix?: string; format?: 'krw' | 'pct' }
  | { kind: 'case'; caseKey: string; noteKey: string; label: string };

// 관리자 화면 표시 — 부문대표/C.O1 은 고정값이라 가독성 위해 제외
const PL_FORM_FIELDS: PLFieldDef[] = [
  { kind: 'text', key: 'budget_note', label: '총 예산 및 수수료 참고사항' },
  { kind: 'case', caseKey: 'client_importance_case', noteKey: 'client_importance', label: '고객 중요도' },
  { kind: 'case', caseKey: 'rfp_route_case', noteKey: 'rfp_route', label: '세일즈 케이스 (RFP 수취 루트)' },
  { kind: 'case', caseKey: 'prep_effort_case', noteKey: 'prep_effort', label: '사전 영업 정도' },
  { kind: 'case', caseKey: 'bidding_difficulty_case', noteKey: 'bidding_difficulty', label: '비딩 난이도' },
  { kind: 'case', caseKey: 'proposal_resource_case', noteKey: 'proposal_resource', label: '제안 리소스' },
  { kind: 'case', caseKey: 'external_expert_case', noteKey: 'external_expert', label: '외부 전문가풀 사용 여부' },
  { kind: 'case', caseKey: 'stop_risk_case', noteKey: 'stop_risk', label: '실집행 가능성' },
];

function PLFormPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || data !== null) return;
    setLoading(true);
    // 관리자 전용 — 인증된 라우트로 별도 GET. /api/projects/[id]/pl-form 없음 → 직접 Supabase 호출 라우트 만들기엔 무거우니
    // 이미 /api/projects 에서 한 번에 받아오는 게 적절하지만 별도 단순 라우트 추가.
    fetch(`/api/projects/${encodeURIComponent(projectId)}/pl-form`, { cache: 'no-store' })
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        return j;
      })
      .then(j => setData(j.form ?? {}))
      .catch(e => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [open, data, projectId]);

  function fieldHasValue(f: PLFieldDef) {
    if (!data) return false;
    if (f.kind === 'case') {
      const cv = (data as any)[f.caseKey];
      const nv = (data as any)[f.noteKey];
      return (
        (cv != null && String(cv).trim() !== '') ||
        (typeof nv === 'string' && nv.trim() !== '')
      );
    }
    const v = (data as any)[f.key];
    if (f.kind === 'number') return v != null && v !== '';
    return typeof v === 'string' && v.trim() !== '';
  }
  const hasAny = data && PL_FORM_FIELDS.some(fieldHasValue);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText size={15} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">PL 작성 양식</h2>
          {data && (
            <span className="text-xs text-gray-400 ml-1">
              {hasAny ? '작성됨' : '미작성'}
            </span>
          )}
        </div>
        {open ? (
          <ChevronDown size={15} className="text-gray-400" />
        ) : (
          <ChevronRight size={15} className="text-gray-400" />
        )}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" /> 불러오는 중...
            </div>
          )}
          {error && (
            <div className="text-sm text-red-600 flex items-start gap-1.5">
              <AlertCircle size={13} className="mt-0.5" />
              <span className="break-all">{error}</span>
            </div>
          )}
          {!loading && !error && !hasAny && (
            <p className="text-sm text-gray-400">
              PL이 아직 양식을 작성하지 않았습니다. 상단 [PL 링크 복사]로 PL에게 작성 링크를 전달해 주세요.
            </p>
          )}
          {!loading && !error && hasAny && data && (
            <>
              {/* 마지막 저장 메타 */}
              {data.last_saved_by_name && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-[11px] text-gray-500 mb-1">
                  <span className="font-semibold text-gray-600">마지막 저장</span>
                  <span>·</span>
                  <span>{data.last_saved_by_name}</span>
                  {data.last_saved_at && (
                    <>
                      <span>·</span>
                      <span className="tabular-nums">
                        {new Date(data.last_saved_at).toLocaleString('ko-KR')}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* 총 예산 메모 — 가로 전체 폭 */}
              {(() => {
                const v = (data as any).budget_note;
                if (!v || (typeof v === 'string' && v.trim() === '')) return null;
                return (
                  <div className="bg-blue-50/50 border border-blue-100 rounded-lg px-4 py-3">
                    <p className="text-[11px] font-semibold text-blue-600 mb-1">
                      총 예산 및 수수료 참고사항
                    </p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {v}
                    </p>
                  </div>
                );
              })()}

              {/* 판단 사유 7개 — 2단 카드 그리드 */}
              <div className="grid grid-cols-2 gap-3">
                {PL_FORM_FIELDS.filter(f => f.kind === 'case').map(f => {
                  if (f.kind !== 'case') return null;
                  if (!fieldHasValue(f)) return null;
                  const rawCase = (data as any)[f.caseKey];
                  const note = (data as any)[f.noteKey] ?? '';
                  const caseStr = rawCase != null ? String(rawCase) : '';
                  const labelMap = PL_CASE_LABELS[f.caseKey];
                  const caseLabel =
                    caseStr === '' ? null : labelMap?.[caseStr] ?? caseStr;
                  return (
                    <div
                      key={f.label}
                      className="bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-300 transition-colors"
                    >
                      <p className="text-[11px] font-semibold text-gray-500 mb-2">
                        {f.label}
                      </p>
                      {caseLabel && (
                        <div className="inline-flex items-center px-2 py-1 mb-2 bg-blue-50 text-blue-700 text-xs font-semibold rounded">
                          {caseLabel}
                        </div>
                      )}
                      {note && (
                        <p className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">
                          {note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 변경 이력 (audit log)
// ─────────────────────────────────────────────
interface ChangeRow {
  id: number;
  project_id: string;
  campaign_name: string | null;
  action: 'create' | 'update' | 'delete';
  changed_by_email: string | null;
  changed_by_name: string | null;
  diff: any;
  created_at: string;
}

// 사용자 친화적 한글 라벨 — diff 화면 표시용
const FIELD_LABELS: Record<string, string> = {
  campaign_name: '캠페인명',
  committee_sheet_link: '운영위 시트',
  r_value: 'R값',
  commission: '수수료',
  team: '담당팀',
  pl: 'PL',
  submitted_at: '제출일',
  distributed: '배포 여부',
  distributed_at: '배포일',
  acquisition_status: '수주여부',
  pl_completed: 'PL 작성완료',
  fund_confirmed: '재원 확정',
  incentive_fund: '인센티브 재원',
  first_payment_date: '1차 지급예정일',
  first_payment_ratio: '1차 지급비율',
  first_payment_completed: '1차 지급완료',
  first_payment_skipped: '1차 미지급',
  second_payment_date: '2차 지급예정일',
  second_payment_ratio: '2차 지급비율',
  second_payment_completed: '2차 지급완료',
  second_payment_skipped: '2차 미지급',
  campaign_end_date: '캠페인 종료예정일',
  category: '구분',
  note: '비고',
  _members_replaced: '멤버 일괄 교체',
};

function formatFieldValue(field: string, v: any): string {
  if (v == null) return '∅';
  if (typeof v === 'boolean') return v ? 'O' : 'X';
  if (field === 'acquisition_status' && typeof v === 'string') {
    return ACQUISITION_LABEL[v] ?? v;
  }
  if (field === 'r_value' || field === 'incentive_fund') {
    return formatKRWFull(Number(v));
  }
  if (field === 'commission' && typeof v === 'number') {
    return `${(v * 100).toFixed(1)}%`;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function ChangeHistory({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [changes, setChanges] = useState<ChangeRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || changes !== null) return;
    setLoading(true);
    fetch(`/api/projects/${encodeURIComponent(projectId)}/changes`, { cache: 'no-store' })
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          // 본문에 error 메시지가 있으면 그걸 사용 (예: 테이블 미존재)
          throw new Error(j?.error ?? `HTTP ${r.status}`);
        }
        return j;
      })
      .then(j => setChanges(j.changes ?? []))
      .catch(e => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [open, changes, projectId]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History size={15} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">변경 이력</h2>
          {changes && (
            <span className="text-xs text-gray-400 ml-1">{changes.length}건</span>
          )}
        </div>
        {open ? (
          <ChevronDown size={15} className="text-gray-400" />
        ) : (
          <ChevronRight size={15} className="text-gray-400" />
        )}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" /> 불러오는 중...
            </div>
          )}
          {error && <div className="text-sm text-red-700">조회 실패: {error}</div>}
          {!loading && changes && changes.length === 0 && (
            <div className="text-xs text-gray-400">변경 이력이 없습니다.</div>
          )}
          {!loading && changes && changes.length > 0 && (
            <ol className="space-y-3">
              {changes.map(c => (
                <ChangeRow key={c.id} change={c} />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function ChangeRow({ change: c }: { change: ChangeRow }) {
  const actionLabel =
    c.action === 'create' ? '생성' : c.action === 'update' ? '수정' : '삭제';
  const actionCls =
    c.action === 'create'
      ? 'bg-emerald-50 text-emerald-700'
      : c.action === 'delete'
      ? 'bg-red-50 text-red-700'
      : 'bg-blue-50 text-blue-700';

  const when = new Date(c.created_at).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const who = c.changed_by_name || c.changed_by_email || '시스템';

  // diff 표시: update 면 field 단위, create/delete 는 요약
  let body: React.ReactNode = null;
  if (c.action === 'update' && c.diff && typeof c.diff === 'object') {
    const entries = Object.entries(c.diff as Record<string, any>);
    if (entries.length === 0) {
      body = <p className="text-xs text-gray-400">변경된 필드 없음</p>;
    } else {
      body = (
        <ul className="space-y-0.5 text-xs">
          {entries.map(([field, val]: [string, any]) => {
            if (field === '_members_replaced') {
              return (
                <li key={field} className="text-gray-600">
                  · 참여 멤버 일괄 교체 ({val?.count}건)
                </li>
              );
            }
            const label = FIELD_LABELS[field] ?? field;
            return (
              <li key={field} className="text-gray-600">
                · <b className="text-gray-800">{label}</b>:{' '}
                <span className="text-gray-400">{formatFieldValue(field, val.old)}</span>{' '}
                → <span className="text-gray-800">{formatFieldValue(field, val.new)}</span>
              </li>
            );
          })}
        </ul>
      );
    }
  } else if (c.action === 'create') {
    body = (
      <p className="text-xs text-gray-500">
        새 프로젝트로 생성됨{c.diff?.campaign_name && ` (${c.diff.campaign_name})`}
      </p>
    );
  } else if (c.action === 'delete') {
    body = <p className="text-xs text-gray-500">프로젝트 삭제됨</p>;
  }

  return (
    <li className="flex gap-3 text-sm">
      <div className="flex flex-col items-center pt-0.5">
        <span
          className={clsx(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded',
            actionCls
          )}
        >
          {actionLabel}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-400">
          {when} · <b className="text-gray-600">{who}</b>
        </p>
        <div className="mt-1">{body}</div>
      </div>
    </li>
  );
}

function PaymentStateBadge({
  completed,
  skipped,
  acquisitionLost,
}: {
  completed: boolean;
  skipped: boolean;
  acquisitionLost?: boolean;
}) {
  if (acquisitionLost) {
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
        수주실패 미지급
      </span>
    );
  }
  if (skipped) {
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
        미지급
      </span>
    );
  }
  if (completed) {
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
        완료
      </span>
    );
  }
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
      대기
    </span>
  );
}

function InfoRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-400">{label}</span>
      <span
        className={clsx(
          'text-sm',
          highlight ? 'font-bold text-blue-700' : 'font-medium text-gray-700'
        )}
      >
        {value}
      </span>
    </div>
  );
}
