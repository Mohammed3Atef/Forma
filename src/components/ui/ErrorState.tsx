import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';

/** Standard query/error fallback with an optional retry. */
export function ErrorState({
  message,
  onRetry,
  className = '',
  testId,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
  testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={`card flex flex-col items-center gap-3 py-10 text-center ${className}`} data-testid={testId} role="alert">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-danger/30 bg-danger/10 text-danger">
        <Icon name="info" size={26} />
      </span>
      <p className="text-sm text-earth-muted">{message ?? t('common.errorGeneric')}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn-ghost">
          {t('common.retry')}
        </button>
      ) : null}
    </div>
  );
}
