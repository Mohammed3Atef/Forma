import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/ui/Pill';
import { SegmentedControl } from '@/components/ui/Tabs';
import { showToast } from '@/stores/toastStore';
import { LIBRARY_KEY, setLibraryFavorite, type LibraryScope } from '@/services/platform/libraryApi';

/** B4.3 — All · Favourites · Mine, the three views of each library list. */
export function ScopeSwitch({ value, onChange, mineLabel, testId }: { value: LibraryScope; onChange: (s: LibraryScope) => void; mineLabel: string; testId: string }) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      label={t('library.scope.label')}
      value={value}
      onChange={onChange}
      testIdPrefix={testId}
      className="seg-quiet w-full sm:max-w-md [&>button]:h-11 [&>button]:flex-1"
      options={[
        { value: 'all', label: t('library.scope.all') },
        { value: 'favorites', label: t('library.scope.favorites') },
        { value: 'mine', label: mineLabel },
      ]}
    />
  );
}

/** Where an own row comes from: the coach made it, or it is their version of a Forma item. */
export function LibraryBadge({ kind }: { kind: 'mine' | 'customized' }) {
  const { t } = useTranslation();
  return (
    <Pill tone={kind === 'customized' ? 'info' : 'brand'} dot={false} className="shrink-0 text-[11px]" testId={`library-badge-${kind}`}>
      {t(kind === 'customized' ? 'library.badge.customized' : 'library.badge.mine')}
    </Pill>
  );
}

/**
 * The favourite star: a light reference (`coachFavorites`), never a copy. Flips at once and settles
 * with the server; a failure puts it back and says so.
 */
export function FavoriteButton({ kind, id, on, name }: { kind: 'exercise' | 'food'; id: string; on: boolean; name: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [value, setValue] = useState(on);
  useEffect(() => setValue(on), [on]);
  const m = useMutation({
    mutationFn: (next: boolean) => setLibraryFavorite(kind, id, next),
    onMutate: (next) => setValue(next),
    onError: (_e, next) => {
      setValue(!next);
      showToast({ title: t('library.favoriteFailed'), variant: 'danger' });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: LIBRARY_KEY }),
  });
  return (
    <button
      type="button"
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${value ? 'text-brand' : 'text-earth-subtle hover:text-earth'}`}
      aria-pressed={value}
      aria-label={t(value ? 'library.unfavorite' : 'library.favorite', { name })}
      disabled={m.isPending}
      onClick={(e) => {
        e.stopPropagation();
        m.mutate(!value);
      }}
      data-testid="library-favorite"
      data-on={value ? 'true' : 'false'}
    >
      <Icon name="star" size={18} fill={value ? 'currentColor' : 'none'} />
    </button>
  );
}
