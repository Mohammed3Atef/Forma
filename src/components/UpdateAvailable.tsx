import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { confirmDialog } from '@/stores/dialogStore';
import { isCriticalWorkActive, otherTabBusy, useUpdate } from '@/stores/updateStore';

/**
 * Minimal "Update available" pill (B0 / B0.7). Installing happens on its own
 * at a safe point (see updateStore); this lets the user take it now. During a
 * workout / timer / check-in / unsaved edit it asks first.
 */
export function UpdateAvailable() {
  const { t } = useTranslation();
  const ready = useUpdate((s) => s.ready);
  const apply = useUpdate((s) => s.apply);
  if (!ready || !apply) return null;

  const onUpdate = async () => {
    const here = isCriticalWorkActive();
    if (here || otherTabBusy()) {
      const ok = await confirmDialog({
        title: t('trust.update.busyTitle'),
        message: t(here ? 'trust.update.busyBody' : 'trust.update.busyOtherTab'),
        confirmLabel: t('trust.update.now'),
        cancelLabel: t('trust.update.later'),
      });
      if (!ok) return;
    }
    apply();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 z-[45] flex justify-center px-4" style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}>
      <button
        type="button"
        onClick={() => void onUpdate()}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-brand/50 bg-surface-raised/95 px-3.5 py-1.5 text-[12.5px] font-medium text-brand shadow-elevated backdrop-blur"
        data-testid="update-available"
      >
        <Icon name="rotate" size={14} />
        {t('trust.update.available')}
      </button>
    </div>
  );
}
