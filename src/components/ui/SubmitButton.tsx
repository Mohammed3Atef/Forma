import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';

type Variant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  tonal: 'btn-tonal',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export interface SubmitButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'children'> {
  children: ReactNode;
  /** True while the mutation is in flight — shows a spinner in place of the label, keeps the button's width unchanged, and disables it. */
  pending?: boolean;
  /** Extra disable condition beyond `pending` (e.g. a validation failure) — kept separate so callers can still tell the two apart if they need to. */
  disabled?: boolean;
  /** No connectivity — disables the button and shows a native tooltip explaining why, instead of a bare disabled control with no reason. */
  offline?: boolean;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

/**
 * The one submit-button shape for the whole app: pending spinner, disabled
 * state, an offline hint, double-submit prevention (disabled while pending),
 * and a width that never shifts between its label and its pending state
 * (the label stays laid out via `invisible`, not removed, while the spinner
 * overlays it) — every mutation trigger button used to hand-roll its own
 * subset of this, several dropping one or more of these behaviors.
 */
export function SubmitButton({
  children,
  pending = false,
  disabled = false,
  offline = false,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  type = 'submit',
  ...rest
}: SubmitButtonProps) {
  const { t } = useTranslation();
  const isDisabled = pending || disabled || offline;
  const sizeClass = size === 'lg' ? 'btn-lg' : size === 'sm' ? 'btn-sm' : '';
  return (
    <button
      type={type}
      disabled={isDisabled}
      title={offline && !disabled ? t('offline.actionDisabled') : undefined}
      aria-busy={pending || undefined}
      className={`${VARIANT_CLASS[variant]} ${sizeClass} relative ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      <span className={`inline-flex items-center justify-center gap-2 ${pending ? 'invisible' : ''}`}>{children}</span>
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center gap-2">
          <Icon name="rotate" size={16} className="animate-spin" />
          {t('auth.working')}
        </span>
      )}
    </button>
  );
}
