import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EntityNotes } from '@/components/EntityNotes';
import { Icon } from '@/components/Icon';
import { ErrorState } from '@/components/ui/ErrorState';
import { OfflineState, StaleNotice, useQueryScreen } from '@/components/ui/ScreenState';
import { viewImages } from '@/stores/mediaViewerStore';
import { fetchClientPhotos } from '@/services/platform/coachApi';
import { formatDate } from '@/lib/format';
import type { ProgressPhoto } from '@/types';

/**
 * Workspace › Progress › Photos (B3.9 rebuild). Coaches see CDN-uploaded photos only (the original
 * stays on the client's device); a placeholder says when one isn't uploaded. Each photo opens with a
 * real button and a translated name (pose · date — RTL-09), and a failed or offline read is said,
 * never shown as "no photos" (CO-18).
 */
export function CoachViewPhotos({ clientId }: { clientId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const photosQ = useQuery({ queryKey: ['clientPhotos', clientId], queryFn: () => fetchClientPhotos(clientId), enabled: !!clientId });
  const screen = useQueryScreen(photosQ, (d) => d.length === 0);
  const photos = photosQ.data ?? [];

  // Group by date (newest first; the query already orders desc).
  const byDate = photos.reduce<Record<string, ProgressPhoto[]>>((acc, p) => {
    (acc[p.date] ??= []).push(p);
    return acc;
  }, {});
  const dates = Object.keys(byDate);

  if (screen.status === 'loading') return <div className="grid grid-cols-3 gap-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="sk aspect-[3/4] rounded-xl" />)}</div>;
  if (screen.status === 'offline') return <OfflineState onRetry={screen.retry} testId="photos-offline" />;
  if (screen.status === 'error') return <ErrorState onRetry={screen.retry} testId="photos-error" />;
  if (screen.status === 'empty') return <p className="py-6 text-center text-[14px] text-earth-muted" data-testid="photos-empty">{t('coachView.noPhotos')}</p>;

  return (
    <div className="space-y-6" data-testid="coach-view-photos">
      {screen.stale ? <StaleNotice online={screen.online} /> : null}
      {dates.map((d) => {
        const day = formatDate(d, lang, 'medium');
        return (
          <section key={d}>
            <h2 className="mb-2 text-[15px] font-semibold">{day}</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {byDate[d].map((p) => {
                const pose = t(`progress.${p.pose}`);
                return (
                  <div key={p.id} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-surface-raised">
                    {p.cdnUrl ? (
                      <button type="button" className="block h-full w-full" aria-label={t('coachView.openPhoto', { pose, date: day })} onClick={() => viewImages(p.cdnUrl!)}>
                        <img src={p.cdnUrl} alt={t('coachView.photoAlt', { pose, date: day })} className="h-full w-full object-cover" loading="lazy" />
                      </button>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-[12px] text-earth-subtle">
                        <Icon name="image" size={18} />
                        {t('coachView.photoNotUploaded')}
                      </div>
                    )}
                    <span className="pointer-events-none absolute bottom-1 start-1 rounded bg-black/60 px-1.5 py-0.5 text-[12px] text-white">{pose}</span>
                  </div>
                );
              })}
            </div>
            {byDate[d].map((p) => (
              <EntityNotes key={`n-${p.id}`} screen="photos" date={p.date} entityType="progress_photo" entityId={p.id} label={`${t(`progress.${p.pose}`)} · ${day}`} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
