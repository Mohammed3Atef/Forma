import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/ListRow';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { clientExportRels, dayRange, termExportRows } from '@/lib/coachBusiness';
import { dayKeyOf } from '@/lib/format';
import { coachBusinessQuery } from '@/services/platform/coachBusinessApi';
import { coachPaymentsQuery } from '@/services/platform/clientPaymentsApi';
import { listClientDashboardSummaries } from '@/services/platform/coachApi';
import { alertDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { TabState, type BusinessTabProps } from './parts';

/**
 * Business › Exports (CO-35 / owner D3): real rows, not counts — one row per current client, one row
 * per package term (current and archived, current and former clients) — inside an optional date
 * range. Built in the browser from the data Business already holds (the client list adds the
 * batched activity summaries, read once on export); CSV-safe (`lib/csv`). Desktop-first: on a phone
 * the file goes through the share sheet, because an installed iPhone app can't download a file.
 */
export default function ExportsTab({ coachId }: BusinessTabProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery(coachBusinessQuery(coachId, qc));
  const pq = useQuery(coachPaymentsQuery(coachId));
  const touch = useMediaQuery('(pointer: coarse)');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [now] = useState(() => Date.now());
  const range = useMemo(() => dayRange(from, to), [from, to]);
  const rangeBad = range.from != null && range.to != null && range.from > range.to;
  const clients = useMemo(() => (q.data ? clientExportRels(q.data.rels, range) : []), [q.data, range]);
  const terms = useMemo(() => (q.data ? termExportRows(q.data.rels, range, now) : []), [q.data, range, now]);
  const stamp = dayKeyOf(now);
  // B3.8: every payment record (payments and reversals) received / reversed inside the range.
  const paymentRows = useMemo(() => (pq.data ?? []).filter((p) => (range.from == null || p.paidAt >= range.from) && (range.to == null || p.paidAt <= range.to)), [pq.data, range]);

  const done = (outcome: string, count: number, kind: 'clients' | 'terms' | 'payments') => {
    if (outcome !== 'cancelled') showToast({ title: t(`business.exports.done.${kind}`, { count }), variant: 'success' });
  };
  const failed = () => void alertDialog({ title: t('business.exports.title'), message: t('business.exports.failed') });

  const exportClients = useMutation({
    mutationFn: async () => {
      const summaries = await qc.fetchQuery({ queryKey: ['coachDashboardSummaries', coachId], queryFn: () => listClientDashboardSummaries(coachId), staleTime: 60_000 });
      const files = await import('./exportFiles');
      return { outcome: await files.saveCsv(`forma-clients-${stamp}`, files.clientsCsv(clients, q.data!.roster, summaries, now, t)), count: clients.length };
    },
    onSuccess: (r) => done(r.outcome, r.count, 'clients'),
    onError: failed,
  });

  const exportTerms = useMutation({
    mutationFn: async () => {
      const files = await import('./exportFiles');
      return { outcome: await files.saveCsv(`forma-package-terms-${stamp}`, files.termsCsv(terms, q.data!.roster, t)), count: terms.length };
    },
    onSuccess: (r) => done(r.outcome, r.count, 'terms'),
    onError: failed,
  });

  const exportPayments = useMutation({
    mutationFn: async () => {
      const files = await import('./exportFiles');
      return { outcome: await files.saveCsv(`forma-payments-${stamp}`, files.paymentsCsv(paymentRows, q.data!.rels, q.data!.roster, t)), count: paymentRows.length };
    },
    onSuccess: (r) => done(r.outcome, r.count, 'payments'),
    onError: failed,
  });

  return (
    <TabState q={q} testId="biz-exports">
      <div className="space-y-6" data-testid="biz-exports">
        {touch ? <p className="card text-[13px] text-earth-muted" data-testid="biz-exports-phone">{t('business.exports.phoneHint')}</p> : null}

        <Section title={t('business.exports.range')} action={from || to ? <button type="button" className="hit-44 text-[13px] font-semibold text-brand hover:underline" onClick={() => { setFrom(''); setTo(''); }} data-testid="biz-export-clear">{t('business.exports.clearRange')}</button> : null} testId="biz-export-range">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="biz-export-from">{t('business.exports.from')}</label>
              <input id="biz-export-from" type="date" className="input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} data-testid="biz-export-from" />
            </div>
            <div>
              <label className="label" htmlFor="biz-export-to">{t('business.exports.to')}</label>
              <input id="biz-export-to" type="date" className="input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} data-testid="biz-export-to" />
            </div>
          </div>
          <p className={`mt-1.5 text-[13px] ${rangeBad ? 'text-warn' : 'text-earth-muted'}`} role={rangeBad ? 'alert' : undefined}>{rangeBad ? t('business.exports.rangeBad') : t('business.exports.rangeHint')}</p>
        </Section>

        <Section title={t('business.exports.clientsTitle')} testId="biz-export-clients-card">
          <div className="card space-y-3">
            <p className="text-[14px] text-earth-muted">{t('business.exports.clientsBody')}</p>
            <Button icon="download" data-testid="biz-export-clients" pending={exportClients.isPending} disabled={rangeBad || clients.length === 0} onClick={() => exportClients.mutate()}>
              {clients.length === 0 ? t('business.exports.clientsNone') : t('business.exports.clientsCta', { count: clients.length })}
            </Button>
          </div>
        </Section>

        <Section title={t('business.exports.termsTitle')} testId="biz-export-terms-card">
          <div className="card space-y-3">
            <p className="text-[14px] text-earth-muted">{t('business.exports.termsBody')}</p>
            <Button icon="download" data-testid="biz-export-terms" pending={exportTerms.isPending} disabled={rangeBad || terms.length === 0} onClick={() => exportTerms.mutate()}>
              {terms.length === 0 ? t('business.exports.termsNone') : t('business.exports.termsCta', { count: terms.length })}
            </Button>
          </div>
        </Section>

        <Section title={t('business.exports.paymentsTitle')} testId="biz-export-payments-card">
          <div className="card space-y-3">
            <p className="text-[14px] text-earth-muted">{t('business.exports.paymentsBody')}</p>
            {pq.isError ? (
              <p role="alert" className="text-[13px] text-warn">
                {t('business.paymentsFailed')}{' '}
                <button type="button" className="hit-44 font-semibold text-brand hover:underline" onClick={() => void pq.refetch()}>{t('common.retry')}</button>
              </p>
            ) : null}
            <Button icon="download" data-testid="biz-export-payments" pending={exportPayments.isPending} disabled={rangeBad || !pq.isSuccess || paymentRows.length === 0} onClick={() => exportPayments.mutate()}>
              {paymentRows.length === 0 ? t('business.exports.paymentsNone') : t('business.exports.paymentsCta', { count: paymentRows.length })}
            </Button>
          </div>
        </Section>
      </div>
    </TabState>
  );
}
