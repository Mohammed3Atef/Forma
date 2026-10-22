import type { TFunction } from 'i18next';
import type { ClientPayment, CoachClientRelationship, UserRecord } from '@/types';
import { payableTerms } from '@/lib/payments';
import type { ClientDashboardSummary } from '@/services/platform/coachApi';
import type { TermExportRow } from '@/lib/coachBusiness';
import { clientStateOf } from '@/lib/coachDirectory';
import { toCsv } from '@/lib/csv';
import { dayKeyOf } from '@/lib/format';
import { termFirstDay, termLastDay } from '@/lib/subscription';
import { currencyKey } from '@/lib/coachBusiness';

export { saveCsv } from '@/lib/csv';

/**
 * The two Business exports (owner D3), loaded on the first export only (budget §9). Headers are in
 * the reader's language; dates are `YYYY-MM-DD` calendar days (B3.8: a term's first and LAST day, the
 * end inclusive; other dates in this device's time zone); prices stay numbers (EGP) with
 * their own currency column; a former client is named as such (their profile is no longer this
 * coach's to read) and keeps a stable client ID so rows can be matched.
 */
export function clientsCsv(rels: CoachClientRelationship[], roster: UserRecord[], summaries: ClientDashboardSummary[], now: number, t: TFunction): string {
  const users = new Map(roster.map((u) => [u.id, u]));
  const sumOf = new Map(summaries.map((s) => [s.clientId, s]));
  const rows = rels.map((rel) => {
    const u = users.get(rel.clientId);
    const s = sumOf.get(rel.clientId);
    const sub = rel.subscription;
    return [
      u?.displayName || u?.email || t('coach.client'),
      u?.email ?? '',
      u?.phone ?? '',
      t(`coachClients.state.${clientStateOf(rel, now).state}`),
      sub?.planName ?? '',
      sub && sub.status !== 'pending' ? termFirstDay(sub) : '',
      sub && sub.status !== 'pending' ? termLastDay(sub) : '',
      sub?.price ?? '',
      sub?.price != null ? currencyKey(sub.currency) : '',
      dayKeyOf(rel.createdAt),
      s?.lastActivity ?? '',
      s?.workouts7d ?? '',
      s ? t(`assessment.status.${s.assessment}`) : '',
    ];
  });
  const headers = ['name', 'email', 'phone', 'state', 'package', 'start', 'end', 'price', 'currency', 'since', 'lastWorkout', 'workouts7d', 'assessment'].map((k) => t(`business.exports.col.${k}`));
  return toCsv(headers, rows);
}

export function termsCsv(terms: TermExportRow[], roster: UserRecord[], t: TFunction): string {
  const names = new Map(roster.map((u) => [u.id, u.displayName || u.email || t('coach.client')]));
  const rows = terms.map((r) => [
    r.currentClient ? (names.get(r.clientId) ?? t('coach.client')) : t('business.formerClient'),
    r.clientId,
    r.currentClient ? t('business.exports.currentClient') : t('business.exports.formerClient', { date: r.relationshipEndedAt ? dayKeyOf(r.relationshipEndedAt) : '—' }),
    r.currentTerm ? t('business.exports.currentTerm') : t('business.exports.pastTerm'),
    r.firstDay,
    r.lastDay,
    r.renewed ? t('subscription.renewedPill') : t(`subscription.status.${r.status}`),
    r.planName ?? '',
    r.days ?? (r.months != null ? r.months * 30 : ''),
    r.price ?? '',
    r.currency ?? '',
    r.termId ?? '',
  ]);
  const headers = ['client', 'clientId', 'clientStatus', 'term', 'start', 'end', 'status', 'package', 'days', 'price', 'currency', 'termId'].map((k) => t(`business.exports.col.${k}`));
  return toCsv(headers, rows);
}

/**
 * B3.8 (owner decision 1): one row per payment record inside the range — payments and the
 * reversals that voided some of them — so the file reconciles: live payments sum to "collected";
 * a reversed payment is marked as such and its reversal row points at it. Amounts are EGP with
 * two decimals (piastres kept exact); the package is named by its first day and id.
 */
export function paymentsCsv(rows: ClientPayment[], rels: CoachClientRelationship[], roster: UserRecord[], t: TFunction): string {
  const names = new Map(roster.map((u) => [u.id, u.displayName || u.email || t('coach.client')]));
  const terms = new Map(rels.flatMap((r) => payableTerms(r).map((pt) => [pt.termId, termFirstDay(pt.term)] as const)));
  const status = (p: ClientPayment) => (p.kind === 'reversal' ? t('business.exports.payment.reversal') : p.reversedById ? t('payments.reversed') : p.correctsId ? t('payments.correction') : t('business.exports.payment.recorded'));
  const out = [...rows]
    .sort((a, b) => a.paidAt - b.paidAt || a.createdAt - b.createdAt)
    .map((p) => [
      dayKeyOf(p.paidAt),
      names.get(p.clientId) ?? t('business.formerClient'),
      p.clientId,
      status(p),
      t(`payments.method.${p.method}`),
      (p.kind === 'reversal' ? -p.amountMinor : p.amountMinor) / 100,
      'EGP',
      // A payment recorded without a package says so (it is in collected, taken off no package).
      p.termId ? (terms.get(p.termId) ?? '') : t('payments.noTerm'),
      p.termId ?? '',
      p.reference ?? '',
      p.note ?? p.reason ?? '',
      p.id,
      p.reversesId ?? p.correctsId ?? '',
      dayKeyOf(p.createdAt),
    ]);
  const headers = ['date', 'client', 'clientId', 'status', 'method', 'amount', 'currency', 'package', 'termId', 'reference', 'note', 'paymentId', 'relatedId', 'recordedOn'].map((k) => t(`business.exports.payment.col.${k}`));
  return toCsv(headers, out);
}
