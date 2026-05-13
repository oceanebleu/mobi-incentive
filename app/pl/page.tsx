'use client';

// ─────────────────────────────────────────────────────────────
// /pl — PL 양식 입력 진입 페이지
//   사번 입력 → 검증 → /pl/projects?emp=... 로 이동
//   localStorage('mobi-pl-emp') 에 사번을 기억해 다음 진입 시 자동 채워줌
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';

export default function PLEntryPage() {
  const router = useRouter();
  const [empId, setEmpId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const cached = localStorage.getItem('mobi-pl-emp');
      if (cached) setEmpId(cached);
    } catch {}
  }, []);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (submitting) return;
    setError(null);
    const trimmed = empId.trim();
    if (!trimmed) {
      setError('사번을 입력하세요.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/pl/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_id: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '확인 실패');
      try {
        localStorage.setItem('mobi-pl-emp', trimmed);
      } catch {}
      router.push(`/pl/projects?emp=${encodeURIComponent(trimmed)}`);
    } catch (e: any) {
      setError(e?.message ?? '오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={18} className="text-blue-600" />
          <h1 className="text-base font-bold text-gray-900">PL 양식 입력</h1>
        </div>
        <p className="text-xs text-gray-500 mb-6">
          본인 사번을 입력하면 배정된 프로젝트의 양식 페이지로 이동합니다.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">
              사번
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              autoComplete="off"
              value={empId}
              onChange={e => setEmpId(e.target.value)}
              placeholder="예: 12345"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>

          {error && (
            <div className="flex items-start gap-1.5 text-xs text-red-700">
              <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
              <span className="break-all">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <>
                내 프로젝트 보기 <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>

        <p className="text-[10px] text-gray-400 mt-5 leading-relaxed">
          모비데이즈 수주인센티브 운영위원회 · PL 작성 페이지
        </p>
      </div>
    </div>
  );
}
