import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { CheckInSummary } from '@/components/CheckInSummary';
import { useSession } from '@/services/auth/sessionStore';
import { listCheckIns, requestCheckIn, reviewCheckIn } from '@/services/platform/checkInApi';
import { shortDate, today, weekRange } from '@/lib/utils';
import { Pill, type PillTone } from '@/components/ui/Pill';
import type { CheckInStatus, WeeklyCheckIn } from '@/types';

const TONE: Record<CheckInStatus, PillTone> = {
  requested: 'warn',
  submitted: 'brand',
  reviewed: 'ok',
};

/** Coach weekly check-ins for one client: request, review (feedback + mark reviewed), history. */
export function CoachCheckIns() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { clientId = '' } = useParams();
  const coachId = useSession((s) => s.account?.id) ?? '';

  const list = useQuery({ queryKey: ['checkIns', clientId], queryFn: () => listCheckIns(clientId), enabled: !!clientId });
  const checkIns = list.data ?? [];

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['checkIns', clientId] });
  const thisWeek = weekRange(today());
  const weekExists = checkIns.some((c) => c.weekStart === thisWeek.weekStart);

  const request = useMutation({
    mutationFn: () => requestCheckIn(coachId, clientId, thisWeek.weekStart, thisWeek.weekEnd),
    onSuccess: invalidate,
  });

  return (
    <>
      <TopBar testId="coach-checkins" title={t('checkin.title')} dense />

      <button
        type="button"
        data-testid="checkin-request"
        className="btn-primary w-full disabled:opacity-40"
        disabled={request.isPending || weekExists}
        onClick={() => request.mutate()}
      >
        <Icon name="plus" size={16} /> {weekExists ? t('checkin.requestedThisWeek') : t('checkin.request')}
      </button>

      <div className="mt-4 space-y-2">
        {list.isLoading ? (
          <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
        ) : checkIns.length === 0 ? (
          <p className="py-8 text-center text-sm text-earth-muted">{t('checkin.noCheckins')}</p>
        ) : (
          checkIns.map((c) => (
            <CheckInRow key={c.id} checkIn={c} onReviewed={invalidate} locale={i18n.language} />
          ))
        )}
      </div>
    </>
  );
}

function CheckInRow({ checkIn, onReviewed, locale }: { checkIn: WeeklyCheckIn; onReviewed: () => void; locale: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState(checkIn.coachFeedback ?? '');
  const review = useMutation({
    mutationFn: () => reviewCheckIn(checkIn.clientId, checkIn.id, feedback),
    onSuccess: () => { setOpen(false); onReviewed(); },
  });

  return (
    <div className="card" data-testid="checkin-row">
      <button type="button" className="flex w-full items-center gap-3 text-start" onClick={() => setOpen((v) => !v)}>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{shortDate(checkIn.weekStart, locale)} – {shortDate(checkIn.weekEnd, locale)}</span>
          {checkIn.currentWeight != null && <span className="block font-mono text-[12px] text-earth-subtle">{checkIn.currentWeight} {t('common.kg')}</span>}
        </span>
        <Pill tone={TONE[checkIn.status]}>{t(`checkin.status.${checkIn.status}`)}</Pill>
        <Icon name={open ? 'chevronDown' : 'chevron'} size={16} className="text-earth-subtle" />
      </button>

      {open && checkIn.status === 'requested' && (
        <p className="mt-3 text-sm text-earth-muted">{t('checkin.awaitingClient')}</p>
      )}

      {open && checkIn.status !== 'requested' && (
        <div className="mt-3 space-y-3 border-t border-line-soft pt-3">
          <CheckInSummary checkIn={checkIn} />
          {checkIn.status === 'reviewed' ? (
            <div>
              <p className="label">{t('checkin.coachFeedback')}</p>
              <p className="whitespace-pre-wrap text-sm">{checkIn.coachFeedback || '—'}</p>
            </div>
          ) : (
            <>
              <textarea
                className="input min-h-20"
                data-testid="checkin-feedback"
                placeholder={t('checkin.coachFeedback')}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
              <button type="button" data-testid="checkin-mark-reviewed" className="btn-primary w-full disabled:opacity-40" disabled={review.isPending} onClick={() => review.mutate()}>
                {t('checkin.markReviewed')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
