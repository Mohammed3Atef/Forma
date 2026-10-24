import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';

export type SaveStatusValue = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Tracks saving / saved / failed for one autosaved field or group (client Settings since B1; the
 * shared Account & preferences page since B3.8, CO-31). A failure clears itself after 3 s unless
 * `stickyError` is set — then it stays until the next save or `retry()`, so a failed save is never
 * missed and the value the person typed is still there to try again.
 */
export function useSaveStatus({ stickyError = false }: { stickyError?: boolean } = {}) {
  const [status, setStatus] = useState<SaveStatusValue>('idle');
  const resetTimer = useRef<number | undefined>(undefined);
  const last = useRef<(() => Promise<void>) | null>(null);
  const run = async (fn: () => Promise<void>) => {
    last.current = fn;
    window.clearTimeout(resetTimer.current);
    setStatus('saving');
    try {
      await fn();
      setStatus('saved');
      resetTimer.current = window.setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      if (!stickyError) resetTimer.current = window.setTimeout(() => setStatus('idle'), 3000);
    }
  };
  const retry = () => (last.current ? run(last.current) : Promise.resolve());
  const reset = () => {
    window.clearTimeout(resetTimer.current);
    setStatus('idle');
  };
  return { status, run, retry, reset };
}

/** Small subtle indicator — "Saving…" / "Saved" / "Couldn't save" (+ Retry when given), announced to screen readers. */
export function SaveStatusBadge({ status, onRetry, testId }: { status: SaveStatusValue; onRetry?: () => void; testId?: string }) {
  const { t } = useTranslation();
  if (status === 'idle') return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[13px] ${status === 'error' ? 'text-warn' : 'text-earth-muted'}`} role={status === 'error' ? 'alert' : 'status'} data-testid={testId} data-status={status}>
      {status === 'saving' && <Icon name="rotate" size={13} className="animate-spin" />}
      {status === 'saved' && <Icon name="check" size={13} className="text-success" />}
      {status === 'saving' ? t('settings.saving') : status === 'saved' ? t('common.saved') : t('settings.saveFailed')}
      {status === 'error' && onRetry ? (
        <button type="button" className="ms-1 font-semibold underline underline-offset-2" onClick={onRetry} data-testid={testId ? `${testId}-retry` : undefined}>
          {t('common.retry')}
        </button>
      ) : null}
    </span>
  );
}
