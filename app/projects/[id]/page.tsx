'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { formatKRWFull, formatCommission, formatDate } from '@/lib/utils';
import {
  useIncentiveData,
  paymentStageOf,
  PAYMENT_STAGE_LABEL,
  ACQUISITION_LABEL,
} from '@/lib/incentive-data';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { projects, loading, error } = useIncentiveData();

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
          onClick={() => router.back()}
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

  // 회차별 총 지급액 합계 (member 행들의 first_amount / second_amount 합)
  const firstTotal = project.members.reduce((s, m) => s + m.first_amount, 0);
  const secondTotal = project.members.reduce((s, m) => s + m.second_amount, 0);

  return (
    <div className="p-8 space-y-6 fade-in">
      <div>
        <button
          onClick={() => router.back()}
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
        <h2 className="text-sm font-semibold text-gray-700 mb-4">참여 멤버 및 기여도</h2>
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
            {project.members.map(m => (
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
                    {formatKRWFull(m.first_amount)}
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
                    {formatKRWFull(m.second_amount)}
                    {m.second_paid_at && (
                      <span className="ml-1 text-[10px] text-gray-400">
                        {formatDate(m.second_paid_at)}
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-3 text-right font-bold text-gray-900">
                  {formatKRWFull(m.first_amount + m.second_amount)}
                </td>
              </tr>
            ))}
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
    </div>
  );
}

function PaymentStateBadge({
  completed,
  skipped,
}: {
  completed: boolean;
  skipped: boolean;
}) {
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
