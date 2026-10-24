import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/ListRow';
import { CollectionList, CollectionTable, type CollectionColumn } from '@/components/library/LibraryCollection';
import { SubscriptionTermSheet } from '@/components/coach/SubscriptionTermSheet';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { businessSummary } from '@/lib/coachBusiness';
import { formatDate } from '@/lib/format';
import { coachBusinessQuery } from '@/services/platform/coachBusinessApi';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import { Money, TabState, namesOf, useWriteGate, type BusinessTabProps } from './parts';

interface Row {
  /** B3.8: the term's last covered day. */
  lastDay: string;
  clientId: string;
  name: string;
  endAt: number;
  /** Days left (upcoming) or days since it ran out (lapsed). */
  days: number;
  lapsed: boolean;
  soon: boolean;
  trial: boolean;
  price?: number;
  currency?: string;
  planName?: string;
}

/**
 * Business › Renewals (JR-03 / CO-16): every current client whose package ends in the next 30 days
 * (Today shows the 7-day ones and at most five more — the full list lives here, B3.2) and every one
 * whose package ran out in the last 30 days, each named, with **Renew** right on the row (the same
 * term sheet as the client's Package & billing — history kept, back-dating confirmed). A renewed
 * client leaves the list at once.
 */
export default function RenewalsTab({ coachId }: BusinessTabProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery(coachBusinessQuery(coachId, qc));
  const [now] = useState(() => Date.now());
  const [renewFor, setRenewFor] = useState<string | null>(null);
  const data = q.data;
  const { upcoming, lapsed, subOf } = useMemo(() => {
    if (!data) return { upcoming: [] as Row[], lapsed: [] as Row[], subOf: new Map() };
    const s = businessSummary(data.rels, now);
    const names = namesOf(data.roster);
    const name = (id: string) => names.get(id) ?? t('coach.client');
    return {
      upcoming: s.renewals.map((r): Row => ({ clientId: r.clientId, name: name(r.clientId), endAt: r.endAt, lastDay: r.lastDay, days: r.daysLeft, lapsed: false, soon: r.soon, trial: r.trial, price: r.price, currency: r.currency, planName: r.planName })),
      lapsed: s.lapsed.map((r): Row => ({ clientId: r.clientId, name: name(r.clientId), endAt: r.endAt, lastDay: r.lastDay, days: r.daysAgo, lapsed: true, soon: false, trial: false, price: r.price, currency: r.currency, planName: r.planName })),
      subOf: new Map(data.rels.filter((r) => r.status === 'active').map((r) => [r.clientId, r.subscription])),
    };
  }, [data, now, t]);

  return (
    <TabState q={q} testId="biz-renewals">
      <div className="space-y-6" data-testid="biz-renewals">
        <Section title={t('business.renewals.upcoming')} action={<span className="text-[13px] text-earth-muted">{t('business.renewals.upcomingHint')}</span>} testId="biz-upcoming">
          <Rows rows={upcoming} empty={t('business.renewals.noUpcoming')} testId="biz-upcoming-list" onRenew={setRenewFor} />
        </Section>
        <Section title={t('business.renewals.lapsed')} action={<span className="text-[13px] text-earth-muted">{t('business.renewals.lapsedHint')}</span>} testId="biz-lapsed">
          <Rows rows={lapsed} empty={t('business.renewals.noLapsed')} testId="biz-lapsed-list" onRenew={setRenewFor} />
        </Section>
      </div>
      <SubscriptionTermSheet coachId={coachId} clientId={renewFor ?? ''} sub={renewFor ? subOf.get(renewFor) : undefined} mode="renew" open={!!renewFor} onClose={() => setRenewFor(null)} />
    </TabState>
  );
}

function Rows({ rows, empty, testId, onRenew }: { rows: Row[]; empty: string; testId: string; onRenew: (clientId: string) => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const { canWrite, reason } = useWriteGate();
  const lang = i18n.language;
  if (rows.length === 0) return <p className="card text-sm text-earth-muted" data-testid={`${testId}-empty`}>{empty}</p>;

  const open = (r: Row) => navigate(`/coach/client/${encodeURIComponent(r.clientId)}/subscription`);
  const when = (r: Row) =>
    r.lapsed ? (r.days === 0 ? t('business.renewals.endedToday') : t('business.renewals.endedAgo', { count: r.days })) : t('business.renewals.endsIn', { count: r.days });
  const renew = (r: Row) => (
    <Button size="sm" variant="secondary" data-testid="biz-renew" aria-label={t('business.renewals.renewFor', { name: r.name })} title={reason} disabled={!canWrite} onClick={() => onRenew(r.clientId)}>
      {t('business.renewals.renew')}
    </Button>
  );
  const price = (r: Row) => (r.price != null && r.price > 0 ? <Money amount={r.price} currency={r.currency} /> : t('business.renewals.free'));
  const menu = (r: Row): ActionMenuItem[] => [
    { key: 'message', label: t('coachClients.menu.message'), icon: 'chat', onSelect: () => navigate(`/coach/messages/${encodeURIComponent(r.clientId)}`), testId: 'biz-row-message' },
    { key: 'billing', label: t('coachClients.menu.subscription'), icon: 'calendar', onSelect: () => open(r), testId: 'biz-row-billing' },
  ];

  if (desktop) {
    const columns: CollectionColumn<Row>[] = [
      { key: 'name', header: t('business.renewals.col.client'), primary: true, cell: (r) => <bdi>{r.name}</bdi>, className: 'w-[30%]' },
      {
        key: 'ends',
        header: t(rows[0]?.lapsed ? 'business.renewals.col.ended' : 'business.renewals.col.ends'),
        className: 'w-[24%]',
        cell: (r) => (
          <span className="block min-w-0">
            <span className="block truncate">{formatDate(r.lastDay, lang, 'medium')}</span>
            <span className={`block truncate text-[12.5px] ${r.soon || r.lapsed ? 'text-warn' : 'text-earth-subtle'}`}>{when(r)}</span>
          </span>
        ),
      },
      { key: 'package', header: t('business.renewals.col.package'), className: 'w-[18%] hidden xl:table-cell', cell: (r) => <span className="block truncate">{r.planName || (r.trial ? t('subscription.status.trial') : '—')}</span> },
      { key: 'price', header: t('business.renewals.col.price'), className: 'w-[14%]', align: 'end', cell: price },
      { key: 'action', header: t('business.renewals.col.action'), className: 'w-[14%]', align: 'end', cell: renew },
    ];
    return <CollectionTable columns={columns} caption={t('business.renewals.caption')} rows={rows} rowKey={(r) => r.clientId} rowName={(r) => r.name} onOpen={open} menu={menu} testId={testId} rowTestId="biz-row" />;
  }
  return (
    <CollectionList
      rows={rows}
      rowKey={(r) => r.clientId}
      rowName={(r) => r.name}
      onOpen={open}
      testId={testId}
      rowTestId="biz-row"
      action={renew}
      render={(r) => ({
        // A Latin name keeps its own order inside Arabic text ("=Omar" never becomes "Omar=").
        title: <bdi>{r.name}</bdi>,
        meta: (
          <>
            <span className={r.soon || r.lapsed ? 'text-warn' : undefined}>{when(r)}</span> · {price(r)}
          </>
        ),
      })}
    />
  );
}
