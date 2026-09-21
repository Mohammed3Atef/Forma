import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useRole } from '@/services/auth/permissions';
import { isBunnyConfigured, listAllImages, type CdnImage } from '@/services/platform/bunnyUploadApi';
import { fetchByRole } from '@/services/platform/accountsApi';

/**
 * Super-admin media gallery — every image uploaded to the Bunny `Forma/` folder
 * (client progress + assessment photos), grouped by client. Read-only oversight.
 */
export function AdminMedia() {
  const { t } = useTranslation();
  const role = useRole();
  const configured = isBunnyConfigured();

  const images = useQuery({
    queryKey: ['cdnImages'],
    queryFn: () => listAllImages(),
    enabled: role === 'super_admin' && configured,
  });
  const clients = useQuery({
    queryKey: ['clientNames'],
    queryFn: () => fetchByRole('client', 500),
    enabled: role === 'super_admin',
  });

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of clients.data ?? []) map.set(u.id, u.displayName || u.email || u.id);
    return (id: string) => map.get(id) ?? id;
  }, [clients.data]);

  const groups = useMemo(() => {
    const m = new Map<string, CdnImage[]>();
    for (const img of images.data ?? []) {
      const arr = m.get(img.clientId) ?? [];
      arr.push(img);
      m.set(img.clientId, arr);
    }
    return [...m.entries()];
  }, [images.data]);

  // `listAllImages()` itself has no server-side cap (it walks the whole CDN
  // folder), so the response can already be every progress/assessment photo
  // ever uploaded platform-wide — rendering all of it in one grid would mount
  // thousands of `<img>` nodes at once. "Load More" over CLIENT GROUPS (not
  // individual images) keeps a client's whole photo set together.
  const GROUP_PAGE = 12;
  const [visibleGroups, setVisibleGroups] = useState(GROUP_PAGE);
  const shownGroups = groups.slice(0, visibleGroups);

  if (role !== 'super_admin') return <Navigate to="/admin" replace />;

  const total = images.data?.length ?? 0;

  return (
    <>
      <TopBar
        testId="admin-media"
        title={t('adminMedia.title')}
        eyebrow={t('nav.groupGovern')}
        right={
          <button type="button" className="icon-btn h-11 w-11" aria-label={t('adminMedia.refresh')} onClick={() => void images.refetch()}>
            <Icon name="rotate" size={18} />
          </button>
        }
      />

      {!configured ? (
        <EmptyState icon="info" title={t('upload.notConfigured')} />
      ) : images.isLoading ? (
        <LoadingState variant="cards" count={6} />
      ) : images.isError ? (
        <EmptyState
          icon="info"
          title={t('adminMedia.loadFailed')}
          message={t('adminMedia.loadFailedMessage')}
          action={<button type="button" className="btn-tonal btn-sm" onClick={() => void images.refetch()}>{t('common.retry')}</button>}
        />
      ) : total === 0 ? (
        <EmptyState icon="image" title={t('adminMedia.empty')} message={t('adminMedia.emptyMessage')} />
      ) : (
        <>
          <p className="mb-3 text-[13px] text-earth-muted">{t('adminMedia.count', { n: total })}</p>
          <div className="space-y-5">
            {shownGroups.map(([clientId, imgs]) => (
              <section key={clientId}>
                <h2 className="h2 mb-2 truncate">{nameOf(clientId)}</h2>
                <div className="grid grid-cols-3 gap-2">
                  {imgs.map((img) => (
                    <a key={img.path} href={img.url} target="_blank" rel="noreferrer" className="relative block" data-testid="admin-media-item">
                      <img src={img.url} alt={img.name} loading="lazy" className="aspect-square w-full rounded-xl bg-surface-raised object-cover" />
                      <span className="absolute bottom-1 start-1 rounded bg-black/60 px-1 text-[9px] uppercase text-white">
                        {t(`adminMedia.context.${img.context}`)}
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            ))}
          </div>
          {visibleGroups < groups.length && (
            <button type="button" className="btn-ghost mx-auto mt-4 block text-[13px]" onClick={() => setVisibleGroups((n) => n + GROUP_PAGE)}>
              {t('common.loadMore')}
            </button>
          )}
        </>
      )}
    </>
  );
}
