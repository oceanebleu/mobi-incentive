'use client';

// ─────────────────────────────────────────────────────────────
// /payroll — 월별 인센티브 실지급액
//   · 단계 '재원확정완료' / '1차 지급완료' 인 프로젝트의 미지급 회차를 월별로 묶음
//   · 월 = 익월 10일(또는 그 전 평일)이 지급일이 되도록 역산
//   · 최상단: 인원별 총 수령액 / 캠페인 카드: 재원 산식 + 멤버별 배분
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { Wallet, Loader2, AlertCircle, Calendar } from 'lucide-react';
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
  category: string | null;
  r_value: number | null;
  commission: number | null; // fraction
  fund_rate: number | null;
  incentive_fund: number;
  pay_date: string | null;
  subtotal: number;
  members: MemberLine[];
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

  useEffect(() => {
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
      <div className="flex items-center gap-2">
        <Wallet size={20} className="text-rose-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">월별 인센티브 실지급액</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            당월 급여(N월)는 익월 10일(공휴일이면 직전 평일)에 지급됩니다.
          </p>
        </div>
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
        <>
          {/* 월별 탭 */}
          <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto pb-px">
            {months.map(m => {
              const key = `${m.year}-${String(m.month).padStart(2, '0')}`;
              const isActive = activeKey === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveKey(key)}
                  className={clsx(
                    '-mb-px px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap flex items-center gap-2',
                    isActive
                      ? 'border-rose-500 text-rose-700'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  )}
                >
                  <span className="text-sm font-semibold">
                    {m.year}년 {m.month}월
                  </span>
                  <span className="text-[10px] text-gray-400">지급 {m.pay_date}</span>
                  <span
                    className={clsx(
                      'text-[11px] font-medium px-1.5 py-0.5 rounded-full',
                      isActive ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-500'
                    )}
                  >
                    {m.campaigns.length}건
                  </span>
                </button>
              );
            })}
          </div>

          {/* 활성 월 내용 */}
          {active && (
            <div className="space-y-6">
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

              {/* 인원별 합계 */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-800 mb-3">
                  인원별 총 수령액 ({active.by_person.length}명)
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  {active.by_person.map(p => (
                    <div
                      key={p.name}
                      className="flex items-center justify-between px-3 py-2 bg-gray-50/60 rounded-lg"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {p.lines.length}건 ·{' '}
                          {p.lines
                            .map(l => `${l.campaign_name}(${l.phase}차)`)
                            .join(' / ')}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-gray-900 tabular-nums">
                        {formatKRWFull(p.total)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 캠페인별 카드 */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-800">
                  캠페인별 지급 내역 ({active.campaigns.length}건)
                </h2>
                {active.campaigns.map((c, i) => (
                  <CampaignCardView key={`${c.project_id}-${c.phase}-${i}`} c={c} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CampaignCardView({ c }: { c: CampaignCard }) {
  const ratePct = c.fund_rate != null ? (c.fund_rate * 100).toFixed(0) : '-';
  const commissionPct = c.commission != null ? (c.commission * 100).toFixed(2) : '-';
  const phaseLabel = c.phase === 1 ? '1차' : '2차';
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-sm font-bold text-gray-900">{c.campaign_name}</h3>
        {c.category && (
          <span
            className={clsx(
              'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
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
            'text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap',
            c.phase === 1 ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
          )}
        >
          {phaseLabel}
        </span>
        <span className="ml-auto text-[11px] text-gray-400">
          {c.project_id} · 지급예정 {c.pay_date ?? '미정'}
        </span>
      </div>

      {/* 재원 산식 안내 */}
      <p className="text-[12px] text-gray-600 mb-3 leading-relaxed bg-gray-50 rounded-md px-3 py-2">
        R값 <b className="tabular-nums">{c.r_value != null ? formatKRWFull(c.r_value) : '-'}</b>
        {c.commission != null && (
          <> , 마크업 <b>{commissionPct}%</b></>
        )}
        {c.fund_rate != null && (
          <> 에 따른 재원 <b className="tabular-nums">{formatKRWFull(c.incentive_fund)}</b></>
        )}
        {' 중 '}
        <b>{phaseLabel}({c.phase_ratio}%)</b>를 프로젝트 기여도에 따라 차등 지급함.
      </p>

      {/* 멤버별 배분 */}
      <div className="overflow-hidden rounded-md border border-gray-100">
        <table className="w-full text-xs">
          <thead className="bg-gray-50/70 text-[10px] text-gray-400 uppercase">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium">이름</th>
              <th className="text-right px-2 py-1.5 font-medium">기여도</th>
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
                <td className="px-2 py-1.5 text-right text-blue-700 font-semibold tabular-nums">
                  {m.contribution}%
                </td>
                <td className="px-3 py-1.5 text-right font-bold text-gray-900 tabular-nums">
                  {formatKRWFull(m.amount)}
                </td>
              </tr>
            ))}
            <tr className="bg-gray-50/40 border-t-2 border-gray-200">
              <td className="px-3 py-2 font-semibold text-gray-500" colSpan={2}>
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
