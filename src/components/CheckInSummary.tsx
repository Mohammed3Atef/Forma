import { useTranslation } from 'react-i18next';
import type { WeeklyCheckIn } from '@/types';

/** Read-only display of a submitted check-in's answers + photos (coach review + client view). */
export function CheckInSummary({ checkIn }: { checkIn: WeeklyCheckIn }) {
  const { t } = useTranslation();
  const photos = checkIn.progressPhotos ?? {};
  const poses = (['front', 'side', 'back'] as const).filter((p) => photos[p]);
  const stat = (label: string, value?: number, suffix = '') =>
    value == null ? null : (
      <div>
        <div className="font-mono text-lg">{value}{suffix}</div>
        <div className="stat-label">{label}</div>
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        {stat(t('checkin.weight'), checkIn.currentWeight, ` ${t('common.kg')}`)}
        {stat(t('checkin.trainingAdherence'), checkIn.adherenceTraining, '%')}
        {stat(t('checkin.nutritionAdherence'), checkIn.adherenceNutrition, '%')}
        {stat(t('checkin.hunger'), checkIn.hungerLevel)}
        {stat(t('checkin.energy'), checkIn.energyLevel)}
        {stat(t('checkin.sleep'), checkIn.sleepQuality)}
      </div>
      {checkIn.notes && (
        <div>
          <p className="label">{t('checkin.notes')}</p>
          <p className="whitespace-pre-wrap text-sm text-earth-muted">{checkIn.notes}</p>
        </div>
      )}
      {poses.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {poses.map((p) => (
            <div key={p} className="space-y-1">
              <img src={photos[p]} alt={p} className="aspect-[3/4] w-full rounded-xl object-cover" loading="lazy" />
              <span className="block text-center text-[10px] uppercase text-earth-subtle">{t(`progress.${p}`)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
