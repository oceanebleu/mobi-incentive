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
  Loader2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import clsx from 'clsx';

interface ProjectRow {
  id: string;
  campaign_name: string;
  submitted_at: string | null;
  pl_completed: boolean;
  acquisition_status: string | null;
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
      `/api/pl/projects?emp=${encodeURIComponent(empId)}&code=${encodeURIComponent(code)}`,
      { cache: 'no-store' }
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

  const grouped = useMemo(() => {
    const pending: ProjectRow[] = [];
    const done: ProjectRow[] = [];
    for (const p of projects) {
      if (p.pl_completed) done.push(p);
      else pending.push(p);
    }
    // 오래된 순
    const byOld = (a: ProjectRow, b: ProjectRow) =>
      (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '');
    pending.sort(byOld);
    done.sort(byOld);
    return { pending, done };
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
                  {p.pl_completed && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">
                      <CheckCircle2 size={9} />
                      완료
                    </span>
                  )}
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
