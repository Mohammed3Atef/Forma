import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToasts, type Toast, type ToastVariant } from '@/stores/toastStore';
import { Avatar } from './Avatar';
import { Icon, type IconName, type IconTone } from './Icon';

/** Per-variant accent: left border tint + icon + bottom countdown-bar fill. */
const VARIANT: Record<ToastVariant, { bar: string; track: string; icon: IconName; tone: IconTone }> = {
  info: { bar: 'border-s-brand', track: 'bg-brand', icon: 'bell', tone: 'brand' },
  success: { bar: 'border-s-success', track: 'bg-success', icon: 'check', tone: 'success' },
  warning: { bar: 'border-s-warn', track: 'bg-warn', icon: 'info', tone: 'warning' },
  danger: { bar: 'border-s-danger', track: 'bg-danger', icon: 'info', tone: 'danger' },
};

const AUTO_DISMISS_MS = 5000;

/**
 * Renders the active toast stack — top-centre on mobile, top-end on desktop.
 * Mounted once at the app root (inside the Router so toasts can deep-link).
 */
export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[55] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:end-4 sm:items-end"
      style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
      data-testid="toast-host"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const { t } = useTranslation();
  const dismiss = useToasts((s) => s.dismiss);
  const v = VARIANT[toast.variant];

  useEffect(() => {
    const id = window.setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [toast.id, dismiss]);

  const clickable = !!toast.onClick;
  const activate = () => {
    toast.onClick?.();
    dismiss(toast.id);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="toast"
      onClick={clickable ? activate : undefined}
      className={`anim-rise card-elevated relative flex w-full max-w-sm items-start gap-3 overflow-hidden border-s-4 p-3.5 pointer-events-auto sm:w-[28rem] sm:max-w-none ${v.bar} ${
        clickable ? 'cursor-pointer hover:bg-surface-hover' : ''
      }`}
    >
      <span
        className={`toast-timer absolute inset-x-0 bottom-0 h-[3px] opacity-70 ${v.track}`}
        style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }}
        aria-hidden="true"
      />
      {toast.avatar ? (
        <Avatar name={toast.avatar.name} photoUrl={toast.avatar.photoUrl} size="sm" className="shrink-0" />
      ) : (
        <span className="row-av h-9 w-9 shrink-0 bg-white/5">
          <Icon name={v.icon} size={18} tone={v.tone} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{toast.title}</p>
        {toast.body && <p className="mt-0.5 line-clamp-2 text-[13px] text-earth-muted">{toast.body}</p>}
      </div>
      <button
        type="button"
        data-testid="toast-close"
        aria-label={t('common.close')}
        onClick={(e) => {
          e.stopPropagation();
          dismiss(toast.id);
        }}
        className="icon-btn h-8 w-8 shrink-0 text-earth-subtle"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
