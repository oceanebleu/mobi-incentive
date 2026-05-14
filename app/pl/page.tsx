'use client';

// ─────────────────────────────────────────────────────────────
// /pl — PL 양식 입력 진입
//   사번 + 개인 고유코드(5자, 알파벳3 + 숫자2) 동시 입력 → 검증 후 본인 프로젝트 목록으로 이동
//   보안상 사번/코드 둘 다 localStorage 에 저장하지 않습니다 (매번 입력)
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import { AlertCircle, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';

export default function PLEntryPage() {
  const [empId, setEmpId] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (submitting) return;
    setError(null);
    const empTrim = empId.trim();
    const codeTrim = code.trim().toUpperCase();
    if (!empTrim) {
      setError('사번을 입력하세요.');
      return;
    }
    if (!codeTrim) {
      setError('개인 고유코드를 입력하세요.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/pl/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_id: empTrim, code: codeTrim }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? '확인 실패');
      // 페이지 transition 안정성을 위해 hard navigation 사용
      const url = `/pl/projects?emp=${encodeURIComponent(empTrim)}&code=${encodeURIComponent(codeTrim)}`;
      window.location.assign(url);
    } catch (e: any) {
      setError(e?.message ?? '오류가 발생했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={18} className="text-blue-600" />
          <h1 className="text-base font-bold text-gray-900">프로젝트 정보 입력</h1>
        </div>
        <p className="text-xs text-gray-500 mb-6">
          본인 사번과 개인 고유코드를 입력해 주세요.
          <br />
          고유코드를 모르실 경우 HRBP팀에 문의바랍니다.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">사번</label>
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

          <div>
            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">
              개인 고유코드 <span className="text-[10px] text-gray-400 font-normal">(5자 · 알파벳 3 + 숫자 2)</span>
            </label>
            <input
              type="text"
              autoComplete="off"
              maxLength={5}
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="예: ABC23"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 tracking-widest tabular-nums uppercase"
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
