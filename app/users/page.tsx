'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Search,
  X,
  ShieldCheck,
  AlertCircle,
  Undo2,
  Save,
  Copy,
  Check,
  KeyRound,
} from 'lucide-react';
import clsx from 'clsx';
import { ROLE_LABELS, type UserRole } from '@/lib/roles';

interface UserRow {
  employee_id: string;
  name: string;
  corp_group: string | null;
  affiliation1: string | null;
  affiliation2: string | null;
  status: string | null;
  hire_date: string | null;
  email: string | null;
  role: UserRole;
  role_overridden: boolean;
  access_code: string | null;
  synced_at: string;
  updated_at: string;
}

type RoleFilter = 'ALL' | UserRole;
// 상단 탭: 재직(퇴사예정·휴직 포함) / 퇴사자
type StatusTab = 'ACTIVE' | 'RESIGNED';

const ROLE_BADGE: Record<UserRole, string> = {
  EXEC: 'bg-violet-100 text-violet-700',
  ADMIN: 'bg-blue-100 text-blue-700',
  NORMAL: 'bg-gray-100 text-gray-600',
  NONE: 'bg-red-100 text-red-700',
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // 저장되지 않은 역할 변경 (employee_id → 새 role)
  const [pending, setPending] = useState<Record<string, UserRole>>({});

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [statusTab, setStatusTab] = useState<StatusTab>('ACTIVE');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '조회 실패');
      setUsers(json.users as UserRow[]);
      setPending({}); // 새로 불러왔으니 변경사항 초기화
    } catch (e: any) {
      setError(e?.message ?? '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }

  async function sync() {
    if (syncing) return;
    if (Object.keys(pending).length > 0) {
      if (!confirm('저장되지 않은 변경사항이 있습니다. 동기화하면 변경사항이 사라집니다. 계속할까요?'))
        return;
    }
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/users/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '동기화 실패');
      setLastSync(
        `신규 ${json.new}명 (재직 ${json.newActive} / 퇴사 ${json.newResigned}) · ` +
          `갱신 ${json.updated}명 (재직 ${json.updatedActive} / 퇴사 ${json.updatedResigned})`
      );
      await load();
    } catch (e: any) {
      setError(e?.message ?? '동기화 중 오류');
    } finally {
      setSyncing(false);
    }
  }

  // 셀렉트 변경 시 — DB는 아직 안 건드림, pending에만 누적
  function stageRole(empId: string, newRole: UserRole) {
    const original = users.find(u => u.employee_id === empId)?.role;
    setPending(prev => {
      const next = { ...prev };
      if (original === newRole) {
        // 원래 값으로 되돌렸으면 pending 제거
        delete next[empId];
      } else {
        next[empId] = newRole;
      }
      return next;
    });
  }

  // 전체저장: pending 전체를 직렬/병렬 PATCH (실패한 건만 별도 표기)
  async function saveAll() {
    const entries = Object.entries(pending);
    if (entries.length === 0) return;
    if (!confirm(`${entries.length}건의 권한 변경을 저장합니다. 진행할까요?`)) return;

    setSaving(true);
    setError(null);

    const results = await Promise.allSettled(
      entries.map(([empId, role]) =>
        fetch(`/api/users/${encodeURIComponent(empId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        }).then(async res => {
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j?.error ?? `${empId} 저장 실패`);
          }
          return empId;
        })
      )
    );

    const failed = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
    if (failed.length > 0) {
      setError(
        `${failed.length}건 저장 실패: ${failed
          .slice(0, 3)
          .map(f => f.reason?.message ?? f.reason)
          .join(' · ')}`
      );
    }

    setSaving(false);
    await load();
  }

  function discardAll() {
    if (Object.keys(pending).length === 0) return;
    if (!confirm('변경사항을 모두 취소할까요?')) return;
    setPending({});
  }

  async function resetOverride(empId: string) {
    // pending에 있는 경우 먼저 정리
    if (pending[empId]) {
      if (!confirm('이 사용자의 미저장 변경을 버리고 시트 기준으로 되돌립니다. 계속할까요?'))
        return;
    } else {
      if (!confirm('수동 설정을 해제하고 시트 기준으로 되돌릴까요?')) return;
    }
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(empId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearOverride: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '해제 실패');
      await load();
    } catch (e: any) {
      setError(e?.message ?? '해제 중 오류');
    }
  }

  useEffect(() => {
    load();
  }, []);

  // 미저장 변경 있을 때 페이지 이탈/새로고침 경고
  useEffect(() => {
    const dirty = Object.keys(pending).length > 0;
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pending]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      // 탭 필터: 재직(퇴사아닌 모두) vs 퇴사자
      const isResigned = u.status === '퇴사';
      if (statusTab === 'ACTIVE' && isResigned) return false;
      if (statusTab === 'RESIGNED' && !isResigned) return false;
      // 역할 필터는 "현재 보이는 역할"(pending 우선) 기준
      const effRole = pending[u.employee_id] ?? u.role;
      if (roleFilter !== 'ALL' && effRole !== roleFilter) return false;
      if (!q) return true;
      const hay = [
        u.name,
        u.email,
        u.employee_id,
        u.affiliation1,
        u.affiliation2,
        u.corp_group,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [users, search, roleFilter, statusTab, pending]);

  const counts = useMemo(() => {
    const active = users.filter(u => u.status !== '퇴사');
    return {
      active: active.length,
      activeExec: active.filter(u => u.role === 'EXEC').length,
      activeAdmin: active.filter(u => u.role === 'ADMIN').length,
      activeNormal: active.filter(u => u.role === 'NORMAL').length,
      resigned: users.length - active.length,
    };
  }, [users]);

  const pendingCount = Object.keys(pending).length;

  return (
    <div className="p-8 space-y-6 fade-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">사용자관리</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            information_employees 시트와 동기화하여 시스템 권한을 관리합니다
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={sync}
            disabled={syncing || saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            <RefreshCw size={15} className={clsx(syncing && 'animate-spin')} />
            {syncing ? '동기화 중...' : '시트와 동기화'}
          </button>
          <button
            onClick={saveAll}
            disabled={saving || pendingCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={15} className={clsx(saving && 'animate-pulse')} />
            {saving ? '저장 중...' : `전체저장${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
          </button>
        </div>
      </div>

      {/* 미저장 변경 안내 바 */}
      {pendingCount > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-100 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <AlertCircle size={15} />
            <span>
              <b>{pendingCount}건</b>의 권한 변경이 아직 저장되지 않았습니다. 우측 상단{' '}
              <b>전체저장</b>을 눌러야 적용됩니다.
            </span>
          </div>
          <button
            onClick={discardAll}
            className="text-xs font-medium text-amber-700 hover:text-amber-900 underline-offset-2 hover:underline"
          >
            변경취소
          </button>
        </div>
      )}

      {/* 알림 */}
      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}
      {lastSync && !error && pendingCount === 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
          <ShieldCheck size={15} />
          동기화 완료 — {lastSync}
        </div>
      )}

      {/* 통계 — 현재 탭에 맞춰 다르게 표시 */}
      {statusTab === 'ACTIVE' ? (
        <div className="grid grid-cols-4 gap-3">
          <Stat label="재직 인원 (휴직·퇴사예정 포함)" value={counts.active} />
          <Stat label="경영진" value={counts.activeExec} tone="violet" />
          <Stat label="관리자" value={counts.activeAdmin} tone="blue" />
          <Stat label="일반" value={counts.activeNormal} tone="gray" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="퇴사자 (이력 보존)" value={counts.resigned} tone="muted" />
          <Stat label="재직 인원" value={counts.active} tone="default" />
        </div>
      )}

      {/* 상단 탭 — 재직 / 퇴사자 */}
      <div className="flex items-end gap-1 border-b border-gray-200">
        <TabButton
          active={statusTab === 'ACTIVE'}
          onClick={() => setStatusTab('ACTIVE')}
          label="재직"
          hint="휴직·퇴사예정 포함"
          count={counts.active}
        />
        <TabButton
          active={statusTab === 'RESIGNED'}
          onClick={() => setStatusTab('RESIGNED')}
          label="퇴사자"
          count={counts.resigned}
        />
      </div>

      {/* 필터 바 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="이름, 이메일, 소속, 사번 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
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
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value as RoleFilter)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700"
        >
          <option value="ALL">전체 역할</option>
          <option value="EXEC">경영진</option>
          <option value="ADMIN">관리자</option>
          <option value="NORMAL">일반</option>
        </select>
        <span className="ml-auto text-xs text-gray-400">{filtered.length}명</span>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['사원', '이메일', '소속(법인/소속1/소속2)', '재직상태', '역할', 'PL 고유코드', '동기화'].map(
                  h => (
                    <th
                      key={h}
                      className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-sm text-gray-400">
                    불러오는 중...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-sm text-gray-400">
                    표시할 사용자가 없습니다. 우측 상단 [시트와 동기화] 버튼을 눌러주세요.
                  </td>
                </tr>
              ) : (
                filtered.map(u => {
                  const stagedRole = pending[u.employee_id];
                  const effRole = stagedRole ?? u.role;
                  const isDirty = stagedRole !== undefined;
                  return (
                    <tr
                      key={u.employee_id}
                      className={clsx(
                        'border-b border-gray-50 transition-colors',
                        isDirty ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-gray-50/70',
                        u.status === '퇴사' && 'opacity-50'
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{u.name}</div>
                        <div className="text-[11px] text-gray-400">{u.employee_id}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{u.email ?? '-'}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <div className="text-xs">
                          {[u.corp_group, u.affiliation1, u.affiliation2]
                            .filter(Boolean)
                            .join(' / ') || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            'text-xs font-medium px-2 py-0.5 rounded-full',
                            u.status === '퇴사'
                              ? 'bg-gray-100 text-gray-500'
                              : 'bg-emerald-50 text-emerald-700'
                          )}
                        >
                          {u.status ?? '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={effRole}
                            disabled={u.status === '퇴사'}
                            onChange={e =>
                              stageRole(u.employee_id, e.target.value as UserRole)
                            }
                            className={clsx(
                              'text-xs font-medium px-2 py-1 rounded-md border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30',
                              ROLE_BADGE[effRole],
                              isDirty && 'ring-2 ring-amber-400/60',
                              u.status === '퇴사' && 'cursor-not-allowed'
                            )}
                          >
                            <option value="EXEC">{ROLE_LABELS.EXEC}</option>
                            <option value="ADMIN">{ROLE_LABELS.ADMIN}</option>
                            <option value="NORMAL">{ROLE_LABELS.NORMAL}</option>
                          </select>
                          {(u.role_overridden || isDirty) && (
                            <button
                              onClick={() => resetOverride(u.employee_id)}
                              title="수동 설정 해제 (시트 기준으로 되돌림)"
                              className="text-gray-300 hover:text-gray-600 transition-colors"
                            >
                              <Undo2 size={13} />
                            </button>
                          )}
                        </div>
                        <div className="text-[10px] mt-0.5 space-x-1">
                          {isDirty && (
                            <span className="text-amber-700 font-medium">
                              미저장: {ROLE_LABELS[u.role]} → {ROLE_LABELS[effRole]}
                            </span>
                          )}
                          {!isDirty && u.role_overridden && (
                            <span className="text-amber-600">수동 설정</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <AccessCodeCell
                          employeeId={u.employee_id}
                          code={u.access_code}
                          onUpdated={code =>
                            setUsers(prev =>
                              prev.map(x =>
                                x.employee_id === u.employee_id
                                  ? { ...x, access_code: code }
                                  : x
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3 text-[11px] text-gray-400">
                        {u.synced_at ? new Date(u.synced_at).toLocaleString('ko-KR') : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'violet' | 'blue' | 'gray' | 'muted';
}) {
  const toneCls: Record<string, string> = {
    default: 'text-gray-900',
    violet: 'text-violet-700',
    blue: 'text-blue-700',
    gray: 'text-gray-700',
    muted: 'text-gray-400',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className={clsx('text-lg font-bold mt-0.5', toneCls[tone])}>{value}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  hint,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-4 py-2.5 -mb-px border-b-2 transition-colors flex items-center gap-2',
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-gray-500 hover:text-gray-800'
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span
        className={clsx(
          'text-[11px] px-1.5 py-0.5 rounded-full font-medium',
          active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
        )}
      >
        {count}
      </span>
      {hint && <span className="text-[10px] text-gray-400">· {hint}</span>}
    </button>
  );
}

// PL 고유코드 셀 — 표시 + 복사 + 재발급
function AccessCodeCell({
  employeeId,
  code,
  onUpdated,
}: {
  employeeId: string;
  code: string | null;
  onUpdated: (newCode: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  function copy() {
    if (!code) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function regenerate() {
    if (busy) return;
    if (
      !confirm(
        `이 사용자의 PL 고유코드를 새로 발급할까요?\n기존 코드는 즉시 무효화됩니다.`
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/users/${encodeURIComponent(employeeId)}/access-code`,
        { method: 'POST' }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? '재발급 실패');
      onUpdated(j.access_code);
    } catch (e: any) {
      alert(e?.message ?? '재발급 중 오류');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {code ? (
        <code className="text-xs font-bold tracking-widest tabular-nums px-2 py-1 bg-gray-50 border border-gray-200 rounded text-gray-800">
          {code}
        </code>
      ) : (
        <span className="text-[11px] text-gray-400">-</span>
      )}
      {code && (
        <button
          onClick={copy}
          title="클립보드에 복사"
          className="text-gray-400 hover:text-gray-700 transition-colors p-1"
        >
          {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
        </button>
      )}
      <button
        onClick={regenerate}
        disabled={busy}
        title={code ? '새 코드 발급 (기존 무효화)' : '코드 발급'}
        className="text-gray-400 hover:text-blue-600 transition-colors p-1 disabled:opacity-50"
      >
        <KeyRound size={12} />
      </button>
    </div>
  );
}
