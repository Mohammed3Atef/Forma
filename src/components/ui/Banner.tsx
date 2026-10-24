import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/Icon';
import { IconButton } from './Button';
import { useBannerRegion } from '@/stores/bannerRegionStore';

export type BannerTone = 'info' | 'success' | 'warning' | 'danger' | 'brand';

const TONE: Record<BannerTone, { box: string; accent: string }> = {
  info: { box: 'border-line bg-surface-raised', accent: 'text-earth' },
  success: { box: 'border-success/40 bg-success/10', accent: 'text-success' },
  warning: { box: 'border-warn/50 bg-warn/10', accent: 'text-warn' },
  danger: { box: 'border-danger/50 bg-danger/10', accent: 'text-danger' },
  brand: { box: 'border-brand/40 bg-brand/10', accent: 'text-brand' },
};

/**
 * The one banner treatment (B1.4 / VS-11): tone, optional icon, title, body,
 * one action and an optional dismiss. Shell-level notices render it inside
 * the shell's `BannerRegion`.
 */
export function Banner({
  tone = 'info',
  icon,
  title,
  children,
  action,
  onDismiss,
  alert = false,
  testId,
  className = '',
}: {
  tone?: BannerTone;
  icon?: IconName;
  title?: ReactNode;
  children?: ReactNode;
  /** One action — a button or link, rendered at the end (wraps below on narrow screens). */
  action?: ReactNode;
  onDismiss?: () => void;
  /** Announce it (role="alert") — for notices that need a decision now. */
  alert?: boolean;
  testId?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const tn = TONE[tone];
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-ui-surface border px-4 py-3 ${tn.box} ${className}`} role={alert ? 'alert' : undefined} data-testid={testId}>
      {icon ? <Icon name={icon} size={18} className={`shrink-0 ${tn.accent}`} /> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className={`text-sm font-semibold ${tn.accent}`}>{title}</p> : null}
        {children ? <div className={`text-[13px] ${title ? 'mt-0.5 text-earth-muted' : tn.accent}`}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
      {onDismiss ? <IconButton icon="close" size="sm" label={t('common.dismiss')} onClick={onDismiss} className="-me-1 border-transparent text-earth-subtle" /> : null}
    </div>
  );
}

/**
 * The shell's banner region: mount the shell's notices inside it (in priority
 * order). Only the top one shows; "+N more" expands the rest.
 */
export function BannerRegion({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { t } = useTranslation();
  const count = useBannerRegion((s) => s.slots.length);
  const expanded = useBannerRegion((s) => s.expanded);
  const toggle = useBannerRegion((s) => s.toggle);
  return (
    <div className={`space-y-2 empty:hidden ${count > 0 ? 'mb-3' : ''} ${className}`} data-testid="banner-region">
      {children}
      {count > 1 && (
        <button type="button" className="hit-44 ms-auto block text-[12px] font-medium text-earth-muted hover:text-earth" data-testid="banner-region-more" aria-expanded={expanded} onClick={toggle}>
          {expanded ? t('banners.showLess') : t('banners.more', { count: count - 1 })}
        </button>
      )}
    </div>
  );
}
