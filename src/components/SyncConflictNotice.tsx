import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/components/ui/Banner';
import { BANNER_PRIORITY, useBannerSlot } from '@/stores/bannerRegionStore';
import { keepThisDevice, useOtherDevice, useSyncConflicts, type SyncConflict } from '@/data/sync/conflicts';
import { refreshStoresAfterPull, useCloud } from '@/services/auth/cloudStore';

/**
 * B0 / PWA-06: a record edited on this device AND changed on another device
 * since is never silently overwritten — the user picks which version to keep.
 *
 * `ConflictState` (B1.5) is that decision for ONE conflict — a screen can show
 * it inline next to the record. `SyncConflictNotice` shows the first open
 * conflict as the top-priority slot of the shell's banner region.
 */
export function ConflictState({ conflict, more = 0, testId = 'sync-conflict' }: { conflict: SyncConflict; more?: number; testId?: string }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const what = t(`trust.sync.kinds.${conflict.collection}`, { defaultValue: t('trust.sync.kinds.record') });
  const day = /^\d{4}-\d{2}-\d{2}$/.test(conflict.id) ? conflict.id : typeof conflict.server.data.date === 'string' ? (conflict.server.data.date as string) : '';

  const resolve = async (fn: (c: SyncConflict) => Promise<void>) => {
    setBusy(true);
    try {
      await fn(conflict);
      // The screens hold the pre-resolution copy in memory — reload them so a
      // later tap can't re-save the version the user just discarded.
      await refreshStoresAfterPull();
      await useCloud.getState().syncNow(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Banner
      tone="warning"
      icon="info"
      alert
      testId={testId}
      title={
        <>
          {t('trust.sync.conflictTitle')}
          {more > 0 && <span className="ms-2 text-[12px] font-normal text-earth-muted">({t('trust.sync.more', { n: more })})</span>}
        </>
      }
    >
      <p data-testid={`${testId}-body`}>{t('trust.sync.conflictBody', { what, day: day ? ` · ${day}` : '' })}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" className="btn-ghost h-9 text-[13px]" data-testid={`${testId}-keep-mine`} disabled={busy} onClick={() => void resolve(keepThisDevice)}>
          {t('trust.sync.keepMine')}
        </button>
        <button type="button" className="btn-ghost h-9 text-[13px]" data-testid={`${testId}-use-other`} disabled={busy} onClick={() => void resolve(useOtherDevice)}>
          {t('trust.sync.useOther')}
        </button>
      </div>
    </Banner>
  );
}

export function SyncConflictNotice() {
  const conflicts = useSyncConflicts((s) => s.conflicts);
  // Highest priority in the shell's banner region (B1.4): data needs a decision.
  const show = useBannerSlot('sync-conflict', BANNER_PRIORITY.syncConflict, conflicts.length > 0);

  useEffect(() => {
    void useSyncConflicts.getState().refresh();
  }, []);

  if (!show || conflicts.length === 0) return null;
  const c = conflicts[0];
  return <ConflictState key={`${c.collection}/${c.id}`} conflict={c} more={conflicts.length - 1} />;
}
