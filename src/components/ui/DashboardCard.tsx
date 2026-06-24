import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/Icon';

/** KPI tile for the coach dashboard: icon, big value, label, optional action. */
export function DashboardCard({
  icon,
  value,
  label,
  hint,
  tone = 'default',
  onClick,
  testId,
}: {
  icon: IconName;
  value: ReactNode;
  label: string;
  hint?: string;
  tone?: 'default' | 'brand' | 'warn' | 'danger' | 'success';
  onClick?: () => void;
  testId?: string;
}) {
  const toneCls =
    tone === 'brand' ? 'text-brand' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-white';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      data-testid={testId}
      className={`card flex flex-col gap-2 text-start ${onClick ? 'transition-transform active:scale-[0.99]' : ''}`}
    >
      <span className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        <Icon name={icon} size={16} className="text-earth-subtle" />
      </span>
      <span className={`font-mono text-[28px] font-medium leading-none ${toneCls}`}>{value}</span>
      {hint && <span className="text-[12px] text-earth-subtle">{hint}</span>}
    </Tag>
  );
}
