import { ProjectStatus, STATUS_LABELS } from '@/lib/types';
import clsx from 'clsx';

const STATUS_STYLES: Record<ProjectStatus, string> = {
  PL_PENDING:     'bg-gray-100 text-gray-600',
  PL_COMPLETED:   'bg-sky-100 text-sky-700',
  FUND_CONFIRMED: 'bg-blue-100 text-blue-700',
  FIRST_PENDING:  'bg-amber-100 text-amber-700',
  FIRST_PAID:     'bg-indigo-100 text-indigo-700',
  SECOND_PENDING: 'bg-orange-100 text-orange-700',
  SECOND_PAID:    'bg-violet-100 text-violet-700',
  ALL_PAID:       'bg-emerald-100 text-emerald-700',
};

interface Props {
  status: ProjectStatus;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'md' }: Props) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full font-medium',
        STATUS_STYLES[status],
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
