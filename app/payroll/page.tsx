'use client';

// ─────────────────────────────────────────────────────────────
// /payroll — 월별 인센티브 실지급액
//   · 단계 '재원확정완료' / '1차 지급완료' 인 프로젝트의 미지급 회차를 월별로 묶음
//   · 월 = 익월 10일(또는 그 전 평일)이 지급일이 되도록 역산
//   · 최상단: 인원별 총 수령액 / 캠페인 카드: 재원 산식 + 멤버별 배분
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  Loader2,
  AlertCircle,
  Calendar,
  Plus,
  X,
  Trash2,
  Save,
  Copy,
  Check,
} from 'lucide-react';
import clsx from 'clsx';
import { formatKRWFull } from '@/lib/utils';

interface MemberLine {
  name: string;
  contribution: number;
  amount: number;
  is_team_account: boolean;
}
interface CampaignCard {
  project_id: string;
  campaign_name: string;
  phase: 1 | 2;
  phase_ratio: number;
  phase_completed: boolean;
  category: string | null;
  r_value: number | null;
  commission: number | null; // fraction
  fund_rate: number | null;
  incentive_fund: number;
  pay_date: string | null;
  subtotal: number;
  members: MemberLine[];
  is_creative_lab?: boolean;
  cl_batch_ids?: number[];
}
interface PersonLine {
  campaign_name: string;
  phase: 1 | 2;
  amount: number;
}
interface PersonEntry {
  name: string;
  total: number;
  lines: PersonLine[];
}
interface MonthBucket {
  year: number;
  month: number;
  pay_date: string;
  total: number;
  campaigns: CampaignCard[];
  by_person: PersonEntry[];
}

export default function PayrollPage() {
  const [months, setMonths] = useState<MonthBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [clModalOpen, setClModalOpen] = useState(false);

  function loadMonths() {
    setLoading(true);
    fetch(`/api/payroll/monthly?_=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? '조회 실패');
        return j;
      })
      .then(j => {
        const ms = (j.months ?? []) as MonthBucket[];
        setMonths(ms);
        if (ms.length > 0) {
          // 오늘 기준 가장 가까운 미래 월을 기본 활성
          const todayYM = new Date().toISOString().slice(0, 7); // YYYY-MM
          const sorted = [...ms].sort((a, b) => {
            const ak = `${a.year}-${String(a.month).padStart(2, '0')}`;
            const bk = `${b.year}-${String(b.month).padStart(2, '0')}`;
            const aDist = ak >= todayYM ? `0-${ak}` : `1-${ak}`;
            const bDist = bk >= todayYM ? `0-${bk}` : `1-${bk}`;
            return aDist.localeCompare(bDist);
          });
          const def = sorted[0];
          setActiveKey(`${def.year}-${String(def.month).padStart(2, '0')}`);
        }
      })
      .catch(e => setError(e?.message ?? '오류'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadMonths();
  }, []);

  const active = useMemo(() => {
    if (!activeKey) return null;
    return (
      months.find(
        m => `${m.year}-${String(m.month).padStart(2, '0')}` === activeKey
      ) ?? null
    );
  }, [months, activeKey]);

  return (
    <div className="p-8 space-y-6 fade-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet size={20} className="text-rose-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">월별 인센티브 실지급액</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              payroll 담당자와 공유하는 페이지
            </p>
          </div>
        </div>
        <button
          onClick={() => setClModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-lg transition-colors"
        >
          <Plus size={14} />
          Creative.Lab 지급액 입력
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5" />
          <span className="break-all">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-12 justify-center">
          <Loader2 size={14} className="animate-spin" />
          불러오는 중...
        </div>
      ) : months.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">
          현재 지급 예정인 인센티브가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-[200px_1fr] gap-6 items-start">
          {/* 좌측 세로 월 리스트 — 상하 스크롤 */}
          <nav className="bg-white border border-gray-200 rounded-xl p-2 max-h-[calc(100vh-180px)] overflow-y-auto sticky top-4">
            <ul className="space-y-0.5">
              {months.map(m => {
                const key = `${m.year}-${String(m.month).padStart(2, '0')}`;
                const isActive = activeKey === key;
                return (
                  <li key={key}>
                    <button
                      onClick={() => setActiveKey(key)}
                      className={clsx(
                        'w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between gap-2',
                        isActive
                          ? 'bg-rose-50 text-rose-700'
                          : 'text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold whitespace-nowrap">
                          {m.year}년 {m.month}월
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                          지급 {m.pay_date}
                        </p>
                      </div>
                      <span
                        className={clsx(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap',
                          isActive
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-gray-100 text-gray-500'
                        )}
                      >
                        {m.campaigns.length}건
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* 우측 활성 월 내용 */}
          {active && (
            <div className="space-y-6 min-w-0">
              {/* 월 요약 */}
              <div className="bg-rose-50/40 border border-rose-100 rounded-xl px-5 py-4 flex items-center gap-4">
                <Calendar size={18} className="text-rose-500" />
                <div className="flex-1">
                  <p className="text-xs text-rose-600">
                    {active.year}년 {active.month}월 지급분 · 실제 지급일{' '}
                    <b>{active.pay_date}</b>
                  </p>
                  <p className="text-2xl font-bold text-rose-700 mt-0.5 tabular-nums">
                    {formatKRWFull(active.total)}
                  </p>
                </div>
              </div>

              {/* 인원별 합계 — 3 컬럼 그리드 */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-800 mb-3">
                  인원별 총 수령액 ({active.by_person.length}명)
                </h2>
                <div className="grid grid-cols-5 gap-2">
                  {active.by_person.map(p => (
                    <div
                      key={p.name}
                      className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50/60 rounded-lg"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                        <p
                          className="text-[11px] text-gray-400 mt-0.5 truncate"
                          title={p.lines.map(l => `${l.campaign_name}(${l.phase}차)`).join(' / ')}
                        >
                          {p.lines.length}건
                        </p>
                      </div>
                      <p className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">
                        {formatKRWFull(p.total)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 캠페인별 카드 — 2 컬럼 그리드 */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-800">
                  캠페인별 지급 내역 ({active.campaigns.length}건)
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {active.campaigns.map((c, i) => (
                    <CampaignCardView key={`${c.project_id}-${c.phase}-${i}`} c={c} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {clModalOpen && (
        <CreativeLabModal
          onClose={() => setClModalOpen(false)}
          onSaved={() => {
            setClModalOpen(false);
            loadMonths();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Creative.Lab 지급액 입력 모달
//   지급일(공통), 재원(공통) 한 번 입력 + 멤버별 (이름, 기여도)
//   금액은 재원 × 기여도/100 자동 계산 표시
// ─────────────────────────────────────────────────────────────
function CreativeLabModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [payDate, setPayDate] = useState('');
  const [rows, setRows] = useState<{ uid: string; name: string; amount: string }[]>([
    { uid: 'r1', name: '', amount: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onlyDigits = (s: string) => s.replace(/[^\d]/g, '');
  const withCommas = (d: string) => (d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '');

  const totalAmount = useMemo(
    () => rows.reduce((s, r) => s + (Number(onlyDigits(r.amount)) || 0), 0),
    [rows]
  );

  function updateRow(uid: string, patch: Partial<{ name: string; amount: string }>) {
    setRows(prev => prev.map(r => (r.uid === uid ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows(prev => [
      ...prev,
      { uid: `r${Date.now()}-${prev.length}`, name: '', amount: '' },
    ]);
  }
  function removeRow(uid: string) {
    setRows(prev => prev.filter(r => r.uid !== uid));
  }

  async function save() {
    setError(null);
    if (!payDate) {
      setError('지급일을 입력해 주세요.');
      return;
    }
    const cleaned = rows
      .map(r => ({
        name: r.name.trim(),
        amount: Number(onlyDigits(r.amount)),
      }))
      .filter(r => r.name !== '' && Number.isFinite(r.amount) && r.amount > 0);
    if (cleaned.length === 0) {
      setError('이름과 금액을 모두 입력한 멤버가 최소 1명 필요합니다.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/payroll/creative-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pay_date: payDate,
          members: cleaned.map(c => ({ member_name: c.name, amount: c.amount })),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? '저장 실패');
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? '저장 중 오류');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Creative.Lab 지급액 입력</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              캠페인명은 'Creative.Lab 수주인센티브' 로 고정 — 지급일을 한 번 입력하고 멤버별 금액을 직접 기재합니다.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        {/* 공통 입력 — 지급일 */}
        <div className="px-6 py-3 border-b border-gray-100">
          <label className="text-[11px] font-semibold text-gray-500 mb-1 block">
            지급일 (공통)
          </label>
          <input
            type="date"
            value={payDate}
            onChange={e => setPayDate(e.target.value)}
            className="w-full max-w-xs px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-500/30"
          />
        </div>

        {/* 합계 요약 */}
        <div className="px-6 py-3 bg-gray-50/70 border-b border-gray-100 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[11px] text-gray-400">멤버 수</p>
            <p className="font-semibold text-gray-800">{rows.length}명</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400">지급액 합계</p>
            <p className="font-semibold text-rose-700 tabular-nums">
              {formatKRWFull(totalAmount)}
            </p>
          </div>
        </div>

        {/* 멤버 행 — 이름 + 금액 직접 입력 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-400 uppercase tracking-wide">
                <th className="text-left pb-2 font-medium">이름</th>
                <th className="text-right pb-2 font-medium w-44">지급액 (원)</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.uid} className="border-t border-gray-100">
                  <td className="py-2 pr-2">
                    <input
                      type="text"
                      value={r.name}
                      onChange={e => updateRow(r.uid, { name: e.target.value })}
                      placeholder="이름"
                      className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={withCommas(onlyDigits(r.amount))}
                      onChange={e => updateRow(r.uid, { amount: onlyDigits(e.target.value) })}
                      placeholder="예: 1,000,000"
                      className="w-full px-2 py-1.5 text-sm text-right border border-gray-200 rounded-md tabular-nums"
                    />
                  </td>
                  <td className="py-2 text-center">
                    <button
                      onClick={() => removeRow(r.uid)}
                      className="text-gray-400 hover:text-red-600 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={addRow}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-md"
          >
            <Plus size={13} />
            멤버 추가
          </button>
        </div>

        {error && (
          <div className="px-6 pb-2 text-xs text-red-700 flex items-start gap-1.5">
            <AlertCircle size={13} className="mt-0.5" />
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
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-60"
          >
            <Save size={14} />
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 한국식 큰 숫자 축약 — 1.3억 / 5천만 / 1.2조 등 (R값 표기용)
function formatKoreanShort(n: number | null): string {
  if (n == null) return '-';
  const abs = Math.abs(n);
  const trim = (v: number) => v.toFixed(1).replace(/\.0$/, '');
  if (abs >= 1_0000_0000_0000) return `${trim(n / 1_0000_0000_0000)}조`;
  if (abs >= 1_0000_0000) return `${trim(n / 1_0000_0000)}억`;
  if (abs >= 1_0000) return `${trim(n / 1_0000)}만`;
  return n.toLocaleString('en-US');
}

function CampaignCardView({ c }: { c: CampaignCard }) {
  const commissionPct = c.commission != null ? (c.commission * 100).toFixed(2) : '-';
  const phaseLabel = c.phase === 1 ? '1차' : '2차';
  // 급여명세서 표기용 라벨
  //   · Creative.Lab — 그대로 `Creative.Lab 수주인센티브`
  //   · 그 외 — `캠페인명_N차_수주인센티브` (공백 → 언더스코어)
  const paystubLabel = c.is_creative_lab
    ? 'Creative.Lab 수주인센티브'
    : `${c.campaign_name.replace(/\s+/g, '_')}_${phaseLabel}_수주인센티브`;
  const [copied, setCopied] = useState(false);
  const copyLabel = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(paystubLabel).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1 min-w-0">
        {/* 캠페인명 — 길면 말줄임. hover 시 title 로 전체 노출, 복사는 전체값 사용 */}
        <h3
          className="text-sm font-bold text-gray-900 truncate min-w-0"
          title={c.campaign_name}
        >
          {c.campaign_name}
        </h3>
        {c.category && (
          <span
            className={clsx(
              'text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0',
              c.category === '신규'
                ? 'bg-emerald-100 text-emerald-700'
                : c.category === '연장'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600'
            )}
          >
            {c.category}
          </span>
        )}
        <span
          className={clsx(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0',
            c.phase === 1 ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
          )}
        >
          {phaseLabel}
        </span>
        {c.phase_completed ? (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap flex-shrink-0">
            지급 완료
          </span>
        ) : (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap flex-shrink-0">
            지급 예정
          </span>
        )}
        {/* 급여명세서 라벨 복사 — 아이콘만 노출, 클릭 시 전체 paystubLabel 클립보드에 복사 */}
        <button
          onClick={copyLabel}
          title={`'${paystubLabel}' 복사`}
          className={clsx(
            'p-1 rounded transition-colors flex-shrink-0',
            copied
              ? 'text-emerald-600 bg-emerald-50'
              : 'text-gray-400 hover:text-rose-600 hover:bg-rose-50'
          )}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
        <span className="ml-auto text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
          {c.project_id} · {c.phase_completed ? '지급' : '지급예정'} {c.pay_date ?? '미정'}
        </span>
      </div>

      {/* 재원 산식 안내 — Creative.Lab 은 별도 문구, 그 외는 총 예산×마크업×재원 산식 */}
      {c.is_creative_lab ? (
        <p className="text-[12px] text-gray-600 mb-3 leading-relaxed bg-gray-50 rounded-md px-3 py-2">
          Creative.Lab 수주인센티브 — 멤버별 지급액 수동 입력 (총 재원{' '}
          <b className="tabular-nums">{formatKRWFull(c.incentive_fund)}</b>)
        </p>
      ) : (
        <p className="text-[12px] text-gray-600 mb-3 leading-relaxed bg-gray-50 rounded-md px-3 py-2">
          총 예산 <b className="tabular-nums">{c.r_value != null ? formatKRWFull(c.r_value) : '-'}</b>
          {c.commission != null && (
            <> , 마크업 <b>{commissionPct}%</b></>
          )}
          {c.fund_rate != null && (
            <> 에 따른 재원 <b className="tabular-nums">{formatKRWFull(c.incentive_fund)}</b></>
          )}
          {' 중 '}
          <b>{phaseLabel}({c.phase_ratio}%)</b>를 프로젝트 기여도에 따라 차등 지급함.
        </p>
      )}

      {/* 멤버별 배분 — Creative.Lab 은 기여도 컬럼 숨김 (금액만 직접 입력했으므로) */}
      <div className="overflow-hidden rounded-md border border-gray-100">
        <table className="w-full text-xs">
          <thead className="bg-gray-50/70 text-[10px] text-gray-400 uppercase">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium">이름</th>
              {!c.is_creative_lab && (
                <th className="text-right px-2 py-1.5 font-medium">기여도</th>
              )}
              <th className="text-right px-3 py-1.5 font-medium">지급액</th>
            </tr>
          </thead>
          <tbody>
            {c.members.map((m, i) => (
              <tr key={`${m.name}-${i}`} className="border-t border-gray-100">
                <td className="px-3 py-1.5 font-medium text-gray-800">
                  {m.name}
                  {m.is_team_account && (
                    <span className="ml-1 text-[9px] text-emerald-700">[팀]</span>
                  )}
                </td>
                {!c.is_creative_lab && (
                  <td className="px-2 py-1.5 text-right text-blue-700 font-semibold tabular-nums">
                    {m.contribution}%
                  </td>
                )}
                <td className="px-3 py-1.5 text-right font-bold text-gray-900 tabular-nums">
                  {formatKRWFull(m.amount)}
                </td>
              </tr>
            ))}
            <tr className="bg-gray-50/40 border-t-2 border-gray-200">
              <td
                className="px-3 py-2 font-semibold text-gray-500"
                colSpan={c.is_creative_lab ? 1 : 2}
              >
                소계
              </td>
              <td className="px-3 py-2 text-right font-bold text-rose-700 tabular-nums">
                {formatKRWFull(c.subtotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
