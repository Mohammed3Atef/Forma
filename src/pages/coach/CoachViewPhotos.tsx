import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EntityNotes } from '@/components/EntityNotes';
import { Icon } from '@/components/Icon';
import { viewImages } from '@/stores/imageViewerStore';
import { fetchClientPhotos } from '@/services/platform/coachApi';
import { shortDate } from '@/lib/utils';
import type { ProgressPhoto } from '@/types';

/**
 * Coach view of a client's progress photos. Coaches can only see CDN-uploaded
 * photos (the original blob is device-local); a placeholder is shown otherwise.
 */
export function CoachViewPhotos({ clientId }: { clientId: string }) {
  const { t, i18n } = useTranslation();
  const photosQ = useQuery({ queryKey: ['clientPhotos', clientId], queryFn: () => fetchClientPhotos(clientId), enabled: !!clientId });
  const photos = photosQ.data ?? [];

  // Group by date (newest first; the query already orders desc).
  const byDate = photos.reduce<Record<string, ProgressPhoto[]>>((acc, p) => {
    (acc[p.date] ??= []).push(p);
    return acc;
  }, {});
  const dates = Object.keys(byDate);

  if (photosQ.isLoading) return <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>;
  if (photos.length === 0) return <p className="py-8 text-center text-sm text-earth-muted">{t('progress.noData')}</p>;

  return (
    <div className="space-y-5">
      {dates.map((d) => (
        <section key={d}>
          <h2 className="h2 mb-2">{shortDate(d, i18n.language)}</h2>
          <div className="grid grid-cols-3 gap-2">
            {byDate[d].map((p) => (
              <div key={p.id} className="space-y-1">
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-surface-raised">
                  {p.cdnUrl ? (
                    <img src={p.cdnUrl} alt={p.pose} className="h-full w-full object-cover" loading="lazy" onClick={() => viewImages(p.cdnUrl!)} />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-[10px] text-earth-subtle">
                      <Icon name="image" size={18} />
                      {t('coachView.photoNotUploaded')}
                    </div>
                  )}
                  <span className="absolute bottom-1 start-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] uppercase text-white">{t(`progress.${p.pose}`)}</span>
                </div>
              </div>
            ))}
          </div>
          {byDate[d].map((p) => (
            <EntityNotes key={`n-${p.id}`} screen="photos" date={p.date} entityType="progress_photo" entityId={p.id} label={`${t(`progress.${p.pose}`)} · ${shortDate(p.date, i18n.language)}`} />
          ))}
        </section>
      ))}
    </div>
  );
}
