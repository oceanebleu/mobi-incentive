'use client';

// ─────────────────────────────────────────────────────────────
// /pl/projects?emp=<사번>
// 사번에 매칭되는 PL의 프로젝트 목록 (작성대기 / 작성완료 분리)
// ─────────────────────────────────────────────────────────────

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import clsx from 'clsx';

interface MemberLite {
  member_name: string;
  contribution: number;
  first_amount: number;
  second_amount: number;
  is_team_account: boolean;
  team_name: string | null;
  role: string | null;
}
interface ProjectRow {
  id: string;
  campaign_name: string;
  submitted_at: string | null;
  pl_completed: boolean;
  acquisition_status: string | null;
  fund_confirmed: boolean;
  first_payment_date: string | null;
  first_payment_ratio: number | null;
  second_payment_date: string | null;
  second_payment_ratio: number | null;
  first_payment_completed: boolean;
  second_payment_completed: boolean;
  incentive_fund: number;
  members: MemberLite[];
}

const ACQ_LABEL: Record<string, string> = {
  WON: '수주성공',
  LOST: '수주실패',
  CANCELLED: '대행종료',
  PENDING: '진행중',
  REVIEWING: '제안진행',
  RESULT_PENDING: '결과대기',
};

// useSearchParams() 는 정적 prerender 와 충돌 — Suspense 안에서 호출되어야 함.
export default function PLProjectsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">
          <Loader2 size={14} className="animate-spin mr-2" />
          불러오는 중...
        </div>
      }
    >
      <PLProjectsPageInner />
    </Suspense>
  );
}

function PLProjectsPageInner() {
  const search = useSearchParams();
  const router = useRouter();
  const empId = search?.get('emp') ?? '';
  const code = search?.get('code') ?? '';

  const [name, setName] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!empId || !code) {
      router.replace('/pl');
      return;
    }
    setLoading(true);
    setError(null);
    fetch(
      `/api/pl/projects?emp=${encodeURIComponent(empId)}&code=${encodeURIComponent(code)}&_=${Date.now()}`,
      { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }
    )
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? '조회 실패');
        return j;
      })
      .then(j => {
        setName(j.name ?? null);
        setProjects(j.projects ?? []);
      })
      .catch(e => setError(e?.message ?? '오류'))
      .finally(() => setLoading(false));
  }, [empId, router]);

  // 분류
  //   · 작성 대기  — pl_completed=false (수주실패 제외)
  //   · 작성 완료  — pl_completed=true 인 모든 건 (위원회 진행/완료 포함 — 언제든 수정 가능)
  //   · 위원회 결과 — fund_confirmed 이상 단계만, 결과 확인용 별도 박스 (작성완료에도 그대로 표시됨)
  const grouped = useMemo(() => {
    const pending: ProjectRow[] = [];
    const done: ProjectRow[] = [];
    const committee: ProjectRow[] = [];
    const isCommittee = (p: ProjectRow) =>
      p.fund_confirmed || p.first_payment_completed || p.second_payment_completed;
    for (const p of projects) {
      if (!p.pl_completed) {
        if (p.acquisition_status === 'LOST') continue;
        pending.push(p);
        continue;
      }
      // pl_completed=true — 작성 완료 박스에 항상 포함
      done.push(p);
      // 위원회 결과 단계면 별도 박스에도 표시
      if (isCommittee(p)) committee.push(p);
    }
    const byOld = (a: ProjectRow, b: ProjectRow) =>
      (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '');
    pending.sort(byOld);
    done.sort(byOld);
    committee.sort(byOld);
    return { pending, done, committee };
  }, [projects]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-5 py-8">
        {/* 헤더 — 본인 사번 외 접근 금지: '다른 사번으로' 진입 경로 제거 */}
        <div className="flex items-center gap-2 mb-6">
          <ShieldCheck size={18} className="text-blue-600" />
          <div>
            <h1 className="text-base font-bold text-gray-900">PL 양식 입력</h1>
            <p className="text-xs text-gray-500">
              {name ? `${name} 님 (${empId})` : `사번 ${empId}`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-12 justify-center">
            <Loader2 size={14} className="animate-spin" />
            불러오는 중...
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-400">
            <FileText size={32} className="mx-auto text-gray-300 mb-3" />
            현재 본인에게 배정된 프로젝트가 없습니다.
          </div>
        ) : (
          <div className="space-y-6">
            <Section
              title="작성 대기"
              tone="amber"
              hint="멤버 기여도와 판단 사유 9개 항목을 입력해 주세요."
              projects={grouped.pending}
              empId={empId}
              code={code}
            />
            <Section
              title="작성 완료"
              tone="emerald"
              hint="저장된 내용을 보거나 수정할 수 있습니다."
              projects={grouped.done}
              empId={empId}
              code={code}
            />
            {grouped.committee.length > 0 && (
              <CommitteeResultSection projects={grouped.committee} />
            )}
          </div>
        )}

        <Link
          href="/pl"
          className="mt-8 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700"
        >
          <ArrowLeft size={12} /> 처음으로
        </Link>
      </div>
    </div>
  );
}

function Section({
  title,
  tone,
  hint,
  projects,
  empId,
  code,
}: {
  title: string;
  tone: 'amber' | 'emerald';
  hint: string;
  projects: ProjectRow[];
  empId: string;
  code: string;
}) {
  const badgeCls =
    tone === 'amber'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-emerald-100 text-emerald-700';
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full', badgeCls)}>
          {projects.length}건
        </span>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">{hint}</p>

      {projects.length === 0 ? (
        <div className="text-xs text-gray-400 py-6 text-center">
          {tone === 'amber' ? '작성할 프로젝트가 없습니다 ✓' : '아직 없습니다'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {projects.map(p => (
            <Link
              key={p.id}
              href={`/pl/projects/${encodeURIComponent(p.id)}?emp=${encodeURIComponent(empId)}&code=${encodeURIComponent(code)}`}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-100 hover:bg-gray-50/70 hover:border-gray-200 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-700">
                    {p.campaign_name}
                  </span>
                  {p.acquisition_status && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
                      {ACQ_LABEL[p.acquisition_status] ?? p.acquisition_status}
                    </span>
                  )}
                  {(() => {
                    const lbl = statusLabel(p);
                    if (!lbl) return null;
                    return (
                      <span
                        className={clsx(
                          'inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap',
                          lbl.tone
                        )}
                      >
                        <CheckCircle2 size={9} />
                        {lbl.text}
                      </span>
                    );
                  })()}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {p.id}
                  {p.submitted_at && <> · 제출 {p.submitted_at}</>}
                </div>
              </div>
              <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-400 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// 행 우측 상태 라벨 결정
//   · 수주실패 + 작성완료 → 수주실패 - 완료
//   · 작성완료 + 재원확정 전 → 운영위원회 진행 중
//   · 작성완료 + 재원확정 후 → 위원회 검토 완료
function statusLabel(p: ProjectRow): { text: string; tone: string } | null {
  if (!p.pl_completed) return null;
  if (p.acquisition_status === 'LOST') {
    return { text: '수주실패 - 완료', tone: 'bg-red-100 text-red-700' };
  }
  if (p.fund_confirmed || p.first_payment_completed || p.second_payment_completed) {
    return { text: '위원회 검토 완료', tone: 'bg-indigo-100 text-indigo-700' };
  }
  return { text: '운영위원회 진행 중', tone: 'bg-amber-100 text-amber-700' };
}

// 위원회 결과 섹션 — 캠페인 리스트(접힘) + 클릭 시 상세 펼침
//   · 멤버 1차/2차 금액이 0이면 'incentive_fund × 비율 × 기여도' 로 자동 환산
function CommitteeResultSection({ projects }: { projects: ProjectRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const fmt = (n: number) =>
    Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // CSV 임포트로 first_amount=0 인 행은 자동 환산
  const memberAmount = (m: MemberLite, p: ProjectRow, phase: 1 | 2): number => {
    const stored = phase === 1 ? m.first_amount : m.second_amount;
    if (stored && stored > 0) return stored;
    const ratio = phase === 1 ? (p.first_payment_ratio ?? 60) : (p.second_payment_ratio ?? 40);
    const fund = p.incentive_fund ?? 0;
    if (fund <= 0) return 0;
    return Math.round((fund * ratio / 100) * ((m.contribution ?? 0) / 100));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-sm font-semibold text-gray-800">위원회 결과</h2>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
          {projects.length}건
        </span>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        재원이 확정된 프로젝트입니다. 캠페인을 클릭하면 지급 일정과 팀원별 배분 결과를 볼 수 있습니다.
      </p>

      <div className="space-y-1.5">
        {projects.map(p => {
          const open = openId === p.id;
          const firstRatio = p.first_payment_ratio ?? 60;
          const secondRatio = p.second_payment_ratio ?? 40;
          return (
            <div
              key={p.id}
              className="border border-gray-100 rounded-lg overflow-hidden"
            >
              {/* 헤더 — 캠페인명 + 단계 배지 + 펼침 아이콘 */}
              <button
                onClick={() => setOpenId(open ? null : p.id)}
                className={clsx(
                  'w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors',
                  open ? 'bg-gray-50' : 'hover:bg-gray-50/70'
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {p.campaign_name}
                    </span>
                    {p.second_payment_completed ? (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">
                        전체 지급 완료
                      </span>
                    ) : p.first_payment_completed ? (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">
                        1차 지급 완료
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 whitespace-nowrap">
                        재원확정 완료
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{p.id}</div>
                </div>
                {open ? (
                  <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                )}
              </button>

              {/* 펼침 상세 */}
              {open && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/30 space-y-3">
                  {/* 지급 일정 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-md border border-gray-100 px-3 py-2">
                      <p className="text-[10px] text-gray-400 uppercase">1차 지급</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">
                        {p.first_payment_date ?? '미정'}
                      </p>
                      <p className="text-[11px] text-gray-500">비율 {firstRatio}%</p>
                    </div>
                    <div className="bg-white rounded-md border border-gray-100 px-3 py-2">
                      <p className="text-[10px] text-gray-400 uppercase">2차 지급</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">
                        {p.second_payment_date ?? '미정'}
                      </p>
                      <p className="text-[11px] text-gray-500">비율 {secondRatio}%</p>
                    </div>
                  </div>

                  {/* 팀원별 확정 배분 — 팀 컬럼 제거 */}
                  {p.members.length > 0 ? (
                    <div className="bg-white rounded-md border border-gray-100 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50/70 text-[10px] text-gray-400 uppercase">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-medium">이름</th>
                            <th className="text-right px-2 py-1.5 font-medium">기여도</th>
                            <th className="text-right px-2 py-1.5 font-medium">1차</th>
                            <th className="text-right px-2 py-1.5 font-medium">2차</th>
                            <th className="text-right px-3 py-1.5 font-medium">합계</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.members.map((m, i) => {
                            const a1 = memberAmount(m, p, 1);
                            const a2 = memberAmount(m, p, 2);
                            return (
                              <tr key={`${m.member_name}-${i}`} className="border-t border-gray-100">
                                <td className="px-3 py-1.5 font-medium text-gray-800">
                                  {m.member_name}
                                  {m.is_team_account && (
                                    <span className="ml-1 text-[9px] text-emerald-700">[팀]</span>
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-right text-blue-700 font-semibold tabular-nums">
                                  {m.contribution}%
                                </td>
                                <td className="px-2 py-1.5 text-right text-gray-700 tabular-nums">
                                  {fmt(a1)}원
                                </td>
                                <td className="px-2 py-1.5 text-right text-gray-700 tabular-nums">
                                  {fmt(a2)}원
                                </td>
                                <td className="px-3 py-1.5 text-right font-bold text-gray-900 tabular-nums">
                                  {fmt(a1 + a2)}원
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-400">멤버 정보가 없습니다.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
