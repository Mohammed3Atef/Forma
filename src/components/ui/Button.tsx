import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/Icon';

/**
 * Button family (B1.3) — the one action shape for the app, evolved from
 * `SubmitButton` (which is now an alias of `Button`). Every variant keeps the
 * existing `.btn-*` visuals; what the primitive adds is behaviour screens used
 * to hand-roll: pending spinner without a width jump, double-submit
 * prevention, an offline reason, and hit areas of at least 44 px (B1.14 /
 * AX-01) even when the visual is smaller.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  tonal: 'btn-tonal',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};
const SIZE_CLASS: Record<ButtonSize, string> = { sm: 'btn-sm hit-44', md: '', lg: 'btn-lg' };

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'children'> {
  children: ReactNode;
  /** True while the action runs — spinner over the (still laid-out) label, button disabled. */
  pending?: boolean;
  /** Extra disable condition beyond `pending` (e.g. a validation failure). */
  disabled?: boolean;
  /** No connectivity — disabled, with a native tooltip saying why. */
  offline?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Leading icon. */
  icon?: IconName;
}

export function Button({
  children,
  pending = false,
  disabled = false,
  offline = false,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  const { t } = useTranslation();
  const isDisabled = pending || disabled || offline;
  return (
    <button
      type={type}
      disabled={isDisabled}
      title={offline && !disabled ? t('offline.actionDisabled') : undefined}
      aria-busy={pending || undefined}
      className={`${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} relative ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      <span className={`inline-flex items-center justify-center gap-2 ${pending ? 'invisible' : ''}`}>
        {icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
        {children}
      </span>
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center gap-2">
          <Icon name="rotate" size={16} className="animate-spin" />
          {t('auth.working')}
        </span>
      )}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  icon: IconName;
  /** REQUIRED accessible name (B1.14 / AX-02) — an icon alone tells a screen reader nothing. */
  label: string;
  /** Visual size; the hit area is never under 44 px either way. */
  size?: 'sm' | 'md';
  /** Unread / count bubble on the icon. */
  badge?: ReactNode;
}

/** Icon-only button. The label is mandatory and also shown as a tooltip on pointer devices. */
export function IconButton({ icon, label, size = 'md', badge, className = '', type = 'button', title, ...rest }: IconButtonProps) {
  const box = size === 'sm' ? 'h-9 w-9 hit-44' : 'h-11 w-11';
  return (
    <button type={type} aria-label={label} title={title ?? label} className={`icon-btn relative inline-flex shrink-0 items-center justify-center ${box} ${className}`} {...rest}>
      <Icon name={icon} size={size === 'sm' ? 16 : 20} />
      {badge}
    </button>
  );
}

/** A router link that looks like a button (navigation, not an action). */
export function LinkButton({
  to,
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  className = '',
  ...rest
}: { to: LinkProps['to']; children: ReactNode; variant?: ButtonVariant; size?: ButtonSize; icon?: IconName } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'>) {
  return (
    <Link to={to} className={`${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} inline-flex items-center justify-center gap-2 ${className}`} {...rest}>
      {icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </Link>
  );
}

/** Small count bubble (unread messages / notifications) — one shape everywhere. */
export function CountBadge({ count, max = 9, className = '', testId, tone = 'danger' }: { count: number; max?: number; className?: string; testId?: string; /** `solid`: the AA-contrast fill (B3.6, coach shell); the default is unchanged. */ tone?: 'danger' | 'solid' }) {
  if (count <= 0) return null;
  return (
    <span
      data-testid={testId}
      className={`t-numeric flex h-[18px] min-w-[18px] items-center justify-center rounded-ui-pill ${tone === 'solid' ? 'bg-danger-solid' : 'bg-danger'} px-1 text-[12px] font-bold leading-none text-white ${className}`}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}
