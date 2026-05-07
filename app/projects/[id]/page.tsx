'use client';

import { useParams, useRouter } from 'next/navigation';
import { useIncentiveStore } from '@/lib/store';
import { formatKRWFull, formatCommission, formatDate, calcMemberFirstPayment, calcMemberSecondPayment } from '@/lib/utils';
import StatusBadge from '@/components/ui/StatusBadge';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import clsx from 'clsx';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { projects } = useIncentiveStore();
  const project = projects.find(p => p.id === id);

  if (!project) {
    return (
      <div className="p-8 text-center text-gray-400">
        <p>프로젝트를 찾을 수 없습니다.</p>
        <button onClick={() => router.back()} className="mt-4 text-sm text-blue-600 hover:underline">돌아가기</button>
      </div>
    );
  }

  const firstTotal = Math.round(project.incentiveFund * (project.firstPaymentRatio / 100));
  const secondTotal = Math.round(project.incentiveFund * (project.secondPaymentRatio / 100));

  return (
    <div className="p-8 space-y-6 fade-in">
      <div>
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-4 transition-colors">
          <ArrowLeft size={15} />목록으로
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{project.campaignName}</h1>
            <p className="text-sm text-gray-400 mt-1">{project.year}년 · {project.team} · PL: {project.pl}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={project.status} />
            {project.committeeSheetLink && (
              <a href={project.committeeSheetLink} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                <ExternalLink size={12} />운영위원회 시트
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">인센티브 재원</h2>
          <div className="space-y-2.5">
            <InfoRow label="R값" value={formatKRWFull(project.rValue)} />
            <InfoRow label="수수료" value={formatCommission(project.commission)} />
            <InfoRow label="인센티브율" value={`${project.incentiveRate}%`} />
            <div className="border-t border-gray-100 pt-2.5">
              <InfoRow label="인센티브 재원" value={formatKRWFull(project.incentiveFund)} highlight />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">1차 지급</h2>
            <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', project.firstPaymentCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
              {project.firstPaymentCompleted ? '완료' : '대기'}
            </span>
          </div>
          <div className="space-y-2.5">
            <InfoRow label="지급비율" value={`${project.firstPaymentRatio}%`} />
            <InfoRow label="지급 예정액" value={formatKRWFull(firstTotal)} />
            <InfoRow label="지급예정일" value={formatDate(project.firstPaymentDate)} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">2차 지급</h2>
            <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', project.secondPaymentCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
              {project.secondPaymentCompleted ? '완료' : '대기'}
            </span>
          </div>
          <div className="space-y-2.5">
            <InfoRow label="지급비율" value={`${project.secondPaymentRatio}%`} />
            <InfoRow label="지급 예정액" value={formatKRWFull(secondTotal)} />
            <InfoRow label="지급예정일" value={formatDate(project.secondPaymentDate)} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">참여 멤버 및 기여도</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['이름','기여도','1차 지급액','2차 지급액','합계'].map((h, i) => (
                <th key={h} className={clsx('pb-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide', i === 0 ? 'text-left' : 'text-right')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {project.members.map(m => {
              const first = calcMemberFirstPayment(project, m.contribution);
              const second = calcMemberSecondPayment(project, m.contribution);
              return (
                <tr key={m.memberId} className="border-b border-gray-50">
                  <td className="py-3 font-medium text-gray-900">{m.memberName}</td>
                  <td className="py-3 text-right"><span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded">{m.contribution}%</span></td>
                  <td className={clsx('py-3 text-right text-sm', project.firstPaymentCompleted ? 'text-emerald-600 font-medium' : 'text-gray-600')}>
                    {formatKRWFull(first)}{project.firstPaymentCompleted && <span className="ml-1 text-xs">✓</span>}
                  </td>
                  <td className={clsx('py-3 text-right text-sm', project.secondPaymentCompleted ? 'text-emerald-600 font-medium' : 'text-gray-600')}>
                    {formatKRWFull(second)}{project.secondPaymentCompleted && <span className="ml-1 text-xs">✓</span>}
                  </td>
                  <td className="py-3 text-right font-bold text-gray-900">{formatKRWFull(first + second)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200">
              <td className="pt-3 text-xs font-semibold text-gray-400">합계</td>
              <td className="pt-3 text-right text-xs font-semibold text-gray-400">100%</td>
              <td className="pt-3 text-right font-bold text-gray-700">{formatKRWFull(firstTotal)}</td>
              <td className="pt-3 text-right font-bold text-gray-700">{formatKRWFull(secondTotal)}</td>
              <td className="pt-3 text-right font-bold text-blue-700">{formatKRWFull(project.incentiveFund)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {project.note && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">비고</h2>
          <p className="text-sm text-gray-600">{project.note}</p>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={clsx('text-sm', highlight ? 'font-bold text-blue-700' : 'font-medium text-gray-700')}>{value}</span>
    </div>
  );
}
