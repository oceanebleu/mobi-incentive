'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, X, ShieldCheck, AlertCircle, Undo2 } from 'lucide-react';
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
  synced_at: string;
  updated_at: string;
}

type RoleFilter = 'ALL' | UserRole;
type StatusFilter = 'ACTIVE' | 'ALL' | '퇴사';

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
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '조회 실패');
      setUsers(json.users as UserRow[]);
    } catch (e: any) {
      setError(e?.message ?? '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }

  async function sync() {
    if (syncing) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/users/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '동기화 실패');
      setLastSync(
        `신규 ${json.new} · 갱신 ${json.updated} · 퇴사자 추가 스킵 ${json.skippedResigned}`
      );
      await load();
    } catch (e: any) {
      setError(e?.message ?? '동기화 중 오류');
    } finally {
      setSyncing(false);
    }
  }

  async function changeRole(empId: string, role: UserRole) {
    // 낙관적 업데이트
    setUsers(prev =>
      prev.map(u =>
        u.employee_id === empId ? { ...u, role, role_overridden: true } : u
      )
    );
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(empId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '저장 실패');
    } catch (e: any) {
      setError(e?.message ?? '저장 중 오류');
      await load(); // 롤백
    }
  }

  async function resetOverride(empId: string) {
    if (!confirm('수동 설정을 해제하고 시트 기준으로 되돌릴까요?')) return;
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      if (statusFilter === 'ACTIVE' && u.status === '퇴사') return false;
      if (statusFilter === '퇴사' && u.status !== '퇴사') return false;
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
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
  }, [users, search, roleFilter, statusFilter]);

  const counts = useMemo(() => {
    const active = users.filter(u => u.status !== '퇴사');
    return {
      total: active.length,
      exec: active.filter(u => u.role === 'EXEC').length,
      admin: active.filter(u => u.role === 'ADMIN').length,
      normal: active.filter(u => u.role === 'NORMAL').length,
      resigned: users.length - active.length,
    };
  }, [users]);

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
        <button
          onClick={sync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
        >
          <RefreshCw size={15} className={clsx(syncing && 'animate-spin')} />
          {syncing ? '동기화 중...' : '시트와 동기화'}
        </button>
      </div>

      {/* 알림 */}
      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}
      {lastSync && !error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
          <ShieldCheck size={15} />
          동기화 완료 — {lastSync}
        </div>
      )}

      {/* 통계 */}
      <div className="grid grid-cols-5 gap-3">
        <Stat label="재직 인원" value={counts.total} />
        <Stat label="경영진" value={counts.exec} tone="violet" />
        <Stat label="관리자" value={counts.admin} tone="blue" />
        <Stat label="일반" value={counts.normal} tone="gray" />
        <Stat label="퇴사 (이력 보존)" value={counts.resigned} tone="muted" />
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
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700"
        >
          <option value="ACTIVE">재직만</option>
          <option value="ALL">전체</option>
          <option value="퇴사">퇴사자만</option>
        </select>
        <span className="ml-auto text-xs text-gray-400">{filtered.length}명</span>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['사원', '이메일', '소속(법인/소속1/소속2)', '재직상태', '역할', '동기화'].map(
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
                  <td colSpan={6} className="text-center py-12 text-sm text-gray-400">
                    불러오는 중...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-sm text-gray-400">
                    표시할 사용자가 없습니다. 우측 상단 [시트와 동기화] 버튼을 눌러주세요.
                  </td>
                </tr>
              ) : (
                filtered.map(u => (
                  <tr
                    key={u.employee_id}
                    className={clsx(
                      'border-b border-gray-50 hover:bg-gray-50/70 transition-colors',
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
                          value={u.role}
                          disabled={u.status === '퇴사'}
                          onChange={e =>
                            changeRole(u.employee_id, e.target.value as UserRole)
                          }
                          className={clsx(
                            'text-xs font-medium px-2 py-1 rounded-md border-0 cursor-pointer',
                            ROLE_BADGE[u.role],
                            u.status === '퇴사' && 'cursor-not-allowed'
                          )}
                        >
                          <option value="EXEC">{ROLE_LABELS.EXEC}</option>
                          <option value="ADMIN">{ROLE_LABELS.ADMIN}</option>
                          <option value="NORMAL">{ROLE_LABELS.NORMAL}</option>
                        </select>
                        {u.role_overridden && (
                          <button
                            onClick={() => resetOverride(u.employee_id)}
                            title="수동 설정 해제 (시트 기준으로 되돌림)"
                            className="text-gray-300 hover:text-gray-600 transition-colors"
                          >
                            <Undo2 size={13} />
                          </button>
                        )}
                      </div>
                      {u.role_overridden && (
                        <div className="text-[10px] text-amber-600 mt-0.5">수동 설정</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-gray-400">
                      {u.synced_at ? new Date(u.synced_at).toLocaleString('ko-KR') : '-'}
                    </td>
                  </tr>
                ))
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
