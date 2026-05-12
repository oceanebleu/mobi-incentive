'use client';

import { useState } from 'react';
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  Trash2,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import clsx from 'clsx';

interface PreviewMember {
  member_name: string;
  project_campaign_name: string;
  project_id: string | null;
  employee_id: string | null;
  is_team_account: boolean;
  contribution: number;
  first_amount: number;
  first_paid_at: string | null;
  second_amount: number;
  second_paid_at: string | null;
  warnings: string[];
}

interface PreviewResponse {
  summary: {
    proposals: { total: number; toPromote: number; errors: any[] };
    projects: { total: number; acquisitionBreakdown: Record<string, number>; errors: any[] };
    members: {
      total: number;
      teamAccounts: number;
      unmatchedProject: number;
      unmatchedUser: number;
      errors: any[];
    };
  };
  proposals: any[];
  projects: any[];
  members: PreviewMember[];
}

type Slot = 'proposals' | 'projects' | 'members';

const SLOT_LABELS: Record<Slot, string> = {
  proposals: '제안서 ([RAW] 제안서)',
  projects: '프로젝트 (수주인센티브운영관리)',
  members: '개인별 지급 (개인별 인센티브 지급액)',
};

export default function ImportPage() {
  const [files, setFiles] = useState<Record<Slot, File | null>>({
    proposals: null,
    projects: null,
    members: null,
  });
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | 'truncate' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [truncateBefore, setTruncateBefore] = useState(false);

  function onPick(slot: Slot, file: File | null) {
    setFiles(prev => ({ ...prev, [slot]: file }));
    setPreview(null);
    setSuccess(null);
  }

  async function readFileAsText(file: File): Promise<string> {
    // 인코딩 추정: UTF-8 우선, 실패 시 EUC-KR
    const buf = await file.arrayBuffer();
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      return text;
    } catch {
      try {
        return new TextDecoder('euc-kr').decode(buf);
      } catch {
        return new TextDecoder('utf-8').decode(buf);
      }
    }
  }

  async function runPreview() {
    setBusy('preview');
    setError(null);
    setSuccess(null);
    try {
      const payload: any = {};
      if (files.proposals) payload.proposals = await readFileAsText(files.proposals);
      if (files.projects) payload.projects = await readFileAsText(files.projects);
      if (files.members) payload.members = await readFileAsText(files.members);

      const res = await fetch('/api/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '미리보기 실패');
      setPreview(json);
    } catch (e: any) {
      setError(e?.message ?? '오류');
    } finally {
      setBusy(null);
    }
  }

  async function runCommit() {
    if (!preview) return;
    const memberCount = preview.summary.members.total - preview.summary.members.unmatchedProject;
    const msg =
      `다음 데이터를 Supabase에 저장합니다:\n` +
      `  • 제안서 ${preview.summary.proposals.total}건\n` +
      `  • 프로젝트 ${preview.summary.projects.total}건\n` +
      `  • 멤버배정 ${memberCount}건 (프로젝트 매칭 실패 ${preview.summary.members.unmatchedProject}건 제외)\n\n` +
      (truncateBefore ? '⚠️  기존 데이터 전체 삭제 후 진행합니다.\n\n' : '') +
      `진행할까요?`;
    if (!confirm(msg)) return;

    setBusy('commit');
    setError(null);
    setSuccess(null);
    try {
      if (truncateBefore) {
        const tables: string[] = [];
        if (preview.proposals.length > 0) tables.push('proposals');
        if (preview.projects.length > 0) tables.push('projects');
        if (preview.members.length > 0) tables.push('project_members');
        const tr = await fetch('/api/import/truncate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tables }),
        });
        const trJson = await tr.json();
        if (!tr.ok) throw new Error(trJson?.error ?? 'truncate 실패');
      }
      const res = await fetch('/api/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposals: preview.proposals,
          projects: preview.projects,
          members: preview.members,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'import 실패');
      setSuccess(
        `완료 — 제안서 ${json.proposals}건 / 프로젝트 ${json.projects}건 / 멤버 ${json.members}건` +
          (json.memberSkipped > 0 ? ` (프로젝트 매칭 실패 ${json.memberSkipped}건 스킵)` : '')
      );
      setPreview(null);
      setFiles({ proposals: null, projects: null, members: null });
    } catch (e: any) {
      setError(e?.message ?? '오류');
    } finally {
      setBusy(null);
    }
  }

  const canPreview = !!(files.proposals || files.projects || files.members);
  const memberWarnRows = preview?.members.filter(m => m.warnings.length > 0) ?? [];

  return (
    <div className="p-8 space-y-6 fade-in">
      <div>
        <h1 className="text-xl font-bold text-gray-900">데이터 Import</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          마스터시트 3개 탭(제안서 / 운영관리 / 개인별 지급)을 CSV로 export하여 업로드하세요.
        </p>
      </div>

      {/* 가이드 */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-xs text-blue-800 space-y-1">
        <p className="font-medium">📋 Google Sheets에서 CSV export 방법</p>
        <p>각 탭에서 <b>파일 → 다운로드 → 쉼표로 구분된 값(.csv)</b> 선택 → 아래 슬롯에 업로드</p>
        <p>3개 중 일부만 올려도 됩니다. 멤버배정은 프로젝트와 함께 올려야 매칭됩니다.</p>
      </div>

      {/* 파일 슬롯 3개 */}
      <div className="grid grid-cols-3 gap-4">
        {(['proposals', 'projects', 'members'] as Slot[]).map(slot => (
          <FileSlot
            key={slot}
            label={SLOT_LABELS[slot]}
            file={files[slot]}
            onChange={f => onPick(slot, f)}
          />
        ))}
      </div>

      {/* 액션 */}
      <div className="flex items-center gap-3">
        <button
          onClick={runPreview}
          disabled={!canPreview || busy !== null}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === 'preview' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
          미리보기 / 검증
        </button>
        {preview && (
          <>
            <ArrowRight size={15} className="text-gray-300" />
            <label className="flex items-center gap-2 text-xs text-gray-600 mr-2 cursor-pointer">
              <input
                type="checkbox"
                checked={truncateBefore}
                onChange={e => setTruncateBefore(e.target.checked)}
                className="w-3.5 h-3.5 accent-red-600"
              />
              기존 데이터 초기화 후 import
            </label>
            <button
              onClick={runCommit}
              disabled={busy !== null}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {busy === 'commit' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              Supabase에 저장
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-emerald-700">
          <CheckCircle size={15} />
          {success}
        </div>
      )}

      {/* 미리보기 결과 */}
      {preview && (
        <div className="space-y-4">
          {/* 요약 카드 */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard
              title="제안서"
              total={preview.summary.proposals.total}
              detail={`승격 대상 ${preview.summary.proposals.toPromote}건`}
            />
            <SummaryCard
              title="프로젝트"
              total={preview.summary.projects.total}
              detail={Object.entries(preview.summary.projects.acquisitionBreakdown)
                .map(([k, v]) => `${k} ${v}`)
                .join(' · ')}
            />
            <SummaryCard
              title="멤버배정"
              total={preview.summary.members.total}
              detail={
                `팀계정 ${preview.summary.members.teamAccounts} · ` +
                `프로젝트미매칭 ${preview.summary.members.unmatchedProject} · ` +
                `사용자미매칭 ${preview.summary.members.unmatchedUser}`
              }
              warn={
                preview.summary.members.unmatchedProject > 0 ||
                preview.summary.members.unmatchedUser > 0
              }
            />
          </div>

          {/* 경고 멤버 */}
          {memberWarnRows.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 text-xs font-semibold text-amber-800">
                ⚠ 매칭/검증 경고 {memberWarnRows.length}건 — 그대로 import하면 사용자관리 매칭이 NULL이 됩니다
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">사원명</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">프로젝트</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-500">기여도</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">경고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberWarnRows.slice(0, 100).map((m, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="px-3 py-1.5 text-gray-700">
                          {m.member_name}
                          {m.is_team_account && (
                            <span className="ml-1 text-[10px] text-blue-600">[팀]</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-gray-500">{m.project_campaign_name}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">{m.contribution}%</td>
                        <td className="px-3 py-1.5 text-amber-700">
                          {m.warnings.join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {memberWarnRows.length > 100 && (
                  <div className="px-3 py-2 text-xs text-gray-400 bg-gray-50">
                    + {memberWarnRows.length - 100}건 더 (생략)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 파싱 오류 */}
          {(preview.summary.proposals.errors.length > 0 ||
            preview.summary.projects.errors.length > 0 ||
            preview.summary.members.errors.length > 0) && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-xs text-red-700 space-y-1">
              <p className="font-semibold">파싱 오류</p>
              {[
                ...preview.summary.proposals.errors.map((e: any) => `[제안서 ${e.rowIndex}] ${e.reason}`),
                ...preview.summary.projects.errors.map((e: any) => `[프로젝트 ${e.rowIndex}] ${e.reason}`),
                ...preview.summary.members.errors.map((e: any) => `[멤버 ${e.rowIndex}] ${e.reason}`),
              ]
                .slice(0, 20)
                .map((m, i) => (
                  <div key={i}>• {m}</div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FileSlot({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <label
      className={clsx(
        'flex flex-col gap-2 p-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors',
        file ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200 bg-white hover:bg-gray-50'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        {file && (
          <button
            onClick={e => {
              e.preventDefault();
              onChange(null);
            }}
            className="text-gray-300 hover:text-red-500"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <input
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={e => onChange(e.target.files?.[0] ?? null)}
      />
      <div className="flex items-center gap-2 text-xs">
        <Upload size={14} className={file ? 'text-blue-500' : 'text-gray-400'} />
        <span className={file ? 'text-blue-700 truncate' : 'text-gray-400'}>
          {file ? file.name : '클릭하여 CSV 선택'}
        </span>
      </div>
      {file && (
        <div className="text-[10px] text-gray-400">
          {(file.size / 1024).toFixed(1)} KB
        </div>
      )}
    </label>
  );
}

function SummaryCard({
  title,
  total,
  detail,
  warn,
}: {
  title: string;
  total: number;
  detail: string;
  warn?: boolean;
}) {
  return (
    <div
      className={clsx(
        'rounded-xl border px-4 py-3',
        warn ? 'bg-amber-50 border-amber-100' : 'bg-white border-gray-200'
      )}
    >
      <p className="text-[11px] text-gray-400">{title}</p>
      <p className="text-lg font-bold text-gray-900 mt-0.5">{total}건</p>
      <p className="text-[11px] text-gray-500 mt-1">{detail}</p>
    </div>
  );
}
