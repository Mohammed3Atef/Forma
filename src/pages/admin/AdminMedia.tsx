import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
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

  if (role !== 'super_admin') return <Navigate to="/admin" replace />;

  const total = images.data?.length ?? 0;

  return (
    <>
      <TopBar
        testId="admin-media"
        title={t('adminMedia.title')}
        eyebrow={t('platform.superAdmin')}
        right={
          <button type="button" className="icon-btn h-[42px] w-[42px]" aria-label={t('adminMedia.refresh')} onClick={() => void images.refetch()}>
            <Icon name="rotate" size={18} />
          </button>
        }
      />

      {!configured ? (
        <div className="card py-10 text-center text-sm text-earth-muted">{t('upload.notConfigured')}</div>
      ) : images.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : images.isError ? (
        <div className="card py-10 text-center text-sm text-danger">{t('adminMedia.loadFailed')}</div>
      ) : total === 0 ? (
        <div className="card py-10 text-center text-sm text-earth-muted">{t('adminMedia.empty')}</div>
      ) : (
        <>
          <p className="mb-3 text-[13px] text-earth-muted">{t('adminMedia.count', { n: total })}</p>
          <div className="space-y-5">
            {groups.map(([clientId, imgs]) => (
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
        </>
      )}
    </>
  );
}
