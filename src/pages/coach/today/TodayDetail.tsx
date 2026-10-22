import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { CheckInReviewForm } from '@/components/coach/CheckInReview';
import { TransferRequestCard } from '@/components/coach/TransferRequestCard';
import { formatDate } from '@/lib/format';
import type { TodayItem } from '@/lib/coachToday';
import type { DirectoryRow } from '@/lib/coachDirectory';
import { StatePill, useActivityText } from '@/pages/coach/clients/parts';
import type { ClientTransferRequest } from '@/types';
import type { TodayPerson } from './TodayRow';

const ws = (id: string) => `/coach/client/${encodeURIComponent(id)}`;

/**
 * The selected item's context and its action (B3.2, desktop ≥ 1024; the
 * check-in review and transfer decision also open as sheets on phones).
 * A check-in is reviewed and a transfer decided right here; everything else
 * opens the exact place that resolves it.
 */
export function TodayDetail({
  item,
  person,
  reason,
  coachId,
  onResolved,
  compact = false,
  context,
}: {
  item: TodayItem;
  person: TodayPerson;
  reason: string;
  coachId: string;
  /** The item is done here (reviewed / decided) — move on. */
  onResolved: () => void;
  /** Inside a phone sheet: no header (the sheet has the client's name). */
  compact?: boolean;
  /** B3.9: the client at a glance (desktop panel) — Today's own directory row, no extra reads. */
  context?: DirectoryRow;
}) {
  const { t, i18n } = useTranslation();
  const activity = useActivityText();
  // B3.9: content-width actions in the wide desktop panel; full-width only inside a phone sheet.
  const grow = compact ? 'flex-1' : '';
  const primary = (to: string, label: string, testId = 'today-detail-primary') => (
    <Link to={to} className={`btn-primary justify-center ${grow}`} data-testid={testId}>
      {label}
    </Link>
  );
  const secondary = (to: string, label: string, testId: string) => (
    <Link to={to} className={`btn-ghost justify-center ${grow}`} data-testid={testId}>
      {label}
    </Link>
  );
  const message = secondary(`/coach/messages/${encodeURIComponent(item.clientId)}`, t('coachToday.detail.message'), 'today-detail-message');

  let body: ReactNode;
  switch (item.kind) {
    case 'checkin':
      body = item.checkIn ? (
        <CheckInReviewForm key={item.checkIn.weekStart} clientId={item.clientId} coachId={coachId} checkIn={item.checkIn} previous={item.previousCheckIn} onReviewed={onResolved} />
      ) : (
        <>
          <p className="text-[14px] text-earth-muted">{t('coachToday.detail.olderWeek')}</p>
          <div className="flex gap-2">{primary(item.to, t('coachToday.detail.openCheckins'))}</div>
        </>
      );
      break;
    case 'transfer':
      body = item.transfer ? (
        <div className="overflow-hidden rounded-ui-surface border border-white/[0.07]">
          <TransferRequestCard req={item.transfer as ClientTransferRequest} coachId={coachId} clientName={person.name} onResolved={onResolved} />
        </div>
      ) : null;
      break;
    case 'assessment':
      body = <div className="flex gap-2">{primary(item.to, t('coachToday.detail.openAssessment'))}{message}</div>;
      break;
    case 'freeze':
      body = <div className="flex gap-2">{primary(item.to, t('coachToday.detail.decideFreeze'))}{message}</div>;
      break;
    case 'message':
      body = <div className="flex gap-2">{primary(item.to, t('coachToday.detail.reply'))}</div>;
      break;
    case 'renewal':
    case 'lapsed':
      body = (
        <>
          {item.at ? (
            <p className="text-[14px] text-earth-muted" data-testid="today-detail-term">
              {t(item.kind === 'renewal' ? 'coachToday.detail.endsOn' : 'coachToday.detail.endedOn', { date: formatDate(item.at, i18n.language, 'long') })}
            </p>
          ) : null}
          <div className="flex gap-2">{primary(item.to, t('coachToday.detail.renew'))}{message}</div>
        </>
      );
      break;
    case 'noPlan':
      body = (
        <div className="flex gap-2">
          {primary(item.to, t('coachToday.detail.buildWorkout'))}
          {secondary(`${ws(item.clientId)}/nutrition`, t('coachToday.detail.buildNutrition'), 'today-detail-nutrition')}
        </div>
      );
      break;
    case 'inactive':
      body = <div className="flex gap-2">{primary(item.to, t('coachToday.detail.message'))}{secondary(ws(item.clientId), t('coachToday.openClient'), 'today-detail-client')}</div>;
      break;
  }

  return (
    <div className="space-y-4" data-testid="today-detail" data-kind={item.kind}>
      {compact ? null : (
        <div className="flex items-start gap-3">
          <Avatar name={person.name} photoUrl={person.photoUrl} size="md" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[18px] font-semibold leading-tight">{person.name}</h2>
            <p className="mt-0.5 text-[13px] text-earth-muted">{reason}</p>
            <Link to={ws(item.clientId)} className="mt-1 inline-flex min-h-ui-hit items-center text-[13px] font-semibold text-brand-hover hover:underline" data-testid="today-detail-open-client">
              {t('coachToday.openClient')}
            </Link>
          </div>
        </div>
      )}
      {context && !compact ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-ui-control border border-line-soft p-3 text-[13px] 2xl:grid-cols-4" data-testid="today-detail-context">
          <div className="min-w-0">
            <dt className="text-[12px] text-earth-subtle">{t('coachClients.col.package')}</dt>
            <dd className="mt-1">{context.state ? <StatePill row={context} /> : '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-earth-subtle">{t('coachClients.col.lastWorkout')}</dt>
            <dd className="mt-1 truncate">{activity(context)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-earth-subtle">{t('coachClients.col.workouts')}</dt>
            <dd className="mt-1 tabular-nums">{context.workouts7d ?? '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-earth-subtle">{t('checkin.title')}</dt>
            <dd className="mt-1 truncate">{context.checkIn ? t(`coachClients.checkin.${context.checkIn}`) : '—'}</dd>
          </div>
        </dl>
      ) : null}
      {body}
    </div>
  );
}
