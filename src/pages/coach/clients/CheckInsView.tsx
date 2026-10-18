import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListGroup, Section } from '@/components/ui/ListRow';
import { CheckInReviewForm } from '@/components/coach/CheckInReview';
import { requestCheckIn } from '@/services/platform/checkInApi';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { formatDate } from '@/lib/format';
import { addDays } from '@/lib/utils';
import { bulkCheckInEligible, type CheckInState, type DirectoryRow } from '@/lib/coachDirectory';
import type { TodayItem } from '@/lib/coachToday';
import { StatePill } from './parts';

const GROUPS: CheckInState[] = ['review', 'overdue', 'awaiting', 'notRequested', 'done'];
/** Requests go out in small batches — never a hundred parallel writes. */
const BATCH = 10;

/**
 * Weekly check-ins (B3.3) — the `/coach/checkins` page folded into Clients
 * (`?view=checkins`, the old URL redirects here). Same workflows: who is to
 * review / overdue / awaiting / not asked this week / done; review them in
 * order (the shared `CheckInReviewForm`); ask everyone not yet asked this
 * week in one go. Only THIS coach's check-ins count (a previous coach's never
 * shows as "to review"), and the bulk request goes only to clients with a
 * running package and an active account.
 */
export function CheckInsView({ rows, known, coachId, weekStart, onRetry }: { rows: DirectoryRow[]; known: boolean; coachId: string; weekStart: string; onRetry: () => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const groups = useMemo(() => {
    const m = new Map<CheckInState, DirectoryRow[]>(GROUPS.map((g) => [g, []]));
    for (const r of rows) if (r.checkIn) m.get(r.checkIn)!.push(r);
    return m;
  }, [rows]);
  const eligible = rows.filter(bulkCheckInEligible);
  // The review queue: this coach's latest submitted check-ins (reviewable in place), oldest first.
  const reviewable = useMemo(
    () =>
      rows
        .map((r) => ({ row: r, item: r.needs.find((n): n is TodayItem & { checkIn: NonNullable<TodayItem['checkIn']> } => n.kind === 'checkin' && !!n.checkIn) }))
        .filter((x): x is { row: DirectoryRow; item: TodayItem & { checkIn: NonNullable<TodayItem['checkIn']> } } => !!x.item)
        .sort((a, b) => (a.item.at ?? 0) - (b.item.at ?? 0)),
    [rows],
  );
  const [queueOpen, setQueueOpen] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const queue = reviewable.filter((x) => !done.has(x.row.id));
  const current = queueOpen ? queue[0] ?? null : null;
  const advance = (id: string) => {
    setDone((prev) => new Set(prev).add(id));
    if (queue.length <= 1) setQueueOpen(false);
  };

  const [sending, setSending] = useState(false);
  const requestWeek = async () => {
    const ok = await confirmDialog({ title: t('coachClients.checkins.requestConfirmTitle'), message: `${t('coachClients.checkins.requestConfirm', { count: eligible.length })} ${t('coachClients.checkins.eligibleNote')}` });
    if (!ok) return;
    setSending(true);
    const weekEnd = addDays(weekStart, 6);
    let failed = 0;
    for (let i = 0; i < eligible.length; i += BATCH) {
      const results = await Promise.allSettled(eligible.slice(i, i + BATCH).map((r) => requestCheckIn(coachId, r.id, weekStart, weekEnd)));
      failed += results.filter((x) => x.status === 'rejected').length;
    }
    setSending(false);
    for (const r of eligible) void qc.invalidateQueries({ queryKey: ['checkIns', r.id] });
    void qc.invalidateQueries({ queryKey: ['coachCheckInSummaries', coachId] });
    const sent = eligible.length - failed;
    if (sent > 0) showToast({ title: t('coachClients.checkins.requested', { count: sent }), variant: 'success' });
    if (failed > 0) void alertDialog({ title: t('coachClients.checkins.title'), message: t('coachClients.checkins.requestFailed', { failed, total: eligible.length }) });
  };

  if (!known) return <ErrorState message={t('coachClients.checkins.loadFailed')} onRetry={onRetry} testId="checkins-view-error" />;

  return (
    <div className="space-y-6" data-testid="checkins-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold">{t('coachClients.checkins.title')}</h2>
          <p className="text-[13px] text-earth-muted">{t('coachClients.checkins.week', { date: formatDate(weekStart, i18n.language, 'dayMonth') })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {reviewable.length > 0 ? (
            <Button variant="primary" size="sm" data-testid="start-review-queue" onClick={() => { setDone(new Set()); setQueueOpen(true); }}>
              {t('coachClients.checkins.reviewAll')} ({reviewable.length})
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" data-testid="checkins-request-week" disabled={eligible.length === 0 || sending} pending={sending} onClick={() => void requestWeek()}>
            {t('coachClients.checkins.requestWeek', { count: eligible.length })}
          </Button>
        </div>
      </div>

      {GROUPS.map((g) => {
        const list = groups.get(g)!;
        if (list.length === 0) return null;
        return (
          <Section key={g} testId={`checkins-group-${g}`} title={<span className="flex items-center gap-2">{t(`coachClients.checkin.${g}`)}<span className="text-[14px] font-medium text-earth-subtle">{list.length}</span></span>}>
            <ListGroup>
              {list.map((r) => (
                <Link key={r.id} to={`/coach/client/${encodeURIComponent(r.id)}/checkins`} data-testid="checkins-row" data-client-id={r.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03]">
                  <Avatar name={r.name} photoUrl={r.photoUrl} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{r.name}</span>
                  <StatePill row={r} />
                  <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle" />
                </Link>
              ))}
            </ListGroup>
          </Section>
        );
      })}
      {rows.length === 0 ? <p className="text-[14px] text-earth-muted">{t('coachClients.checkins.empty')}</p> : null}

      <Sheet open={!!current} onClose={() => setQueueOpen(false)} size="lg" title={current ? current.row.name : ''}>
        {current ? (
          <div className="space-y-4" data-testid="review-queue-panel">
            <p className="text-[12px] text-earth-subtle" data-testid="review-queue-progress">
              {t('checkin.queueProgress', { n: done.size + 1, total: done.size + queue.length })}
            </p>
            <CheckInReviewForm
              key={current.row.id}
              clientId={current.row.id}
              coachId={coachId}
              checkIn={current.item.checkIn}
              previous={current.item.previousCheckIn}
              onReviewed={() => advance(current.row.id)}
              onSkip={() => advance(current.row.id)}
              primaryLabel={queue.length > 1 ? t('checkin.markReviewedNext') : t('checkin.markReviewed')}
            />
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
