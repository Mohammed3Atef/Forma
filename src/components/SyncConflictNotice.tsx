import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { keepThisDevice, useOtherDevice, useSyncConflicts, type SyncConflict } from '@/data/sync/conflicts';
import { refreshStoresAfterPull, useCloud } from '@/services/auth/cloudStore';

/**
 * B0 / PWA-06: a record edited on this device AND changed on another device
 * since is never silently overwritten — the user picks which version to keep.
 * Shown at the top of the client app until every conflict is resolved.
 */
export function SyncConflictNotice() {
  const { t } = useTranslation();
  const conflicts = useSyncConflicts((s) => s.conflicts);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void useSyncConflicts.getState().refresh();
  }, []);

  if (conflicts.length === 0) return null;
  const c = conflicts[0];
  const id = `${c.collection}/${c.id}`;
  const what = t(`trust.sync.kinds.${c.collection}`, { defaultValue: t('trust.sync.kinds.record') });
  const day = /^\d{4}-\d{2}-\d{2}$/.test(c.id) ? c.id : typeof c.server.data.date === 'string' ? (c.server.data.date as string) : '';

  const resolve = async (fn: (c: SyncConflict) => Promise<void>) => {
    setBusy(id);
    try {
      await fn(c);
      // The screens hold the pre-resolution copy in memory — reload them so a
      // later tap can't re-save the version the user just discarded.
      await refreshStoresAfterPull();
      await useCloud.getState().syncNow(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-3 rounded-xl border border-warn/50 bg-warn/10 px-4 py-3" role="alert" data-testid="sync-conflict">
      <p className="flex items-center gap-2 text-sm font-semibold text-warn">
        <Icon name="info" size={16} /> {t('trust.sync.conflictTitle')}
        {conflicts.length > 1 && <span className="text-[12px] font-normal text-earth-muted">({t('trust.sync.more', { n: conflicts.length - 1 })})</span>}
      </p>
      <p className="mt-1 text-[13px] text-earth-muted" data-testid="sync-conflict-body">
        {t('trust.sync.conflictBody', { what, day: day ? ` · ${day}` : '' })}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" className="btn-ghost h-9 text-[13px]" data-testid="sync-conflict-keep-mine" disabled={busy === id} onClick={() => void resolve(keepThisDevice)}>
          {t('trust.sync.keepMine')}
        </button>
        <button type="button" className="btn-ghost h-9 text-[13px]" data-testid="sync-conflict-use-other" disabled={busy === id} onClick={() => void resolve(useOtherDevice)}>
          {t('trust.sync.useOther')}
        </button>
      </div>
    </div>
  );
}
