import type { ClientPayment, CoachClientRelationship, PaymentMethod, Subscription } from '../types';
import { businessSummary, currencyKey, monthRange, termMonthKey, termsOf, type MonthRange } from './coachBusiness';
import { dayKeyOf } from './format';
import { balanceOf, isLivePayment, paidByTerm, toMinor } from './payments';
import { effectiveSubscriptionStatus, termFirstDay, todayKey } from './subscription';

/**
 * Me › Business › Overview (B3.8 completion, owner decision 5) — every figure, chart and list the
 * analytics show, computed here and pinned by `coachAnalytics.test.ts`. Money is integers of
 * piastres; amounts are EGP (owner decision 8) — a pre-B3.8 test term in another currency is left
 * out of every EGP figure and counted in `otherCurrencyTerms`, never converted.
 *
 * Definitions (what each figure IS — booked is not collected; a recorded payment is the coach's
 * own statement, not a verified transfer; profit cannot be known without expenses):
 *  - Booked — package prices of economic terms (renewals included, corrections never twice;
 *    pending placeholders excluded), in the month of the term's first day.
 *  - Collected — payments the coach recorded and did not reverse, in the month they were received.
 *  - Outstanding — for every term with an id (all clients, current and former): price − recorded
 *    payments, never below zero. Overdue = outstanding on terms that have started (Forma has no
 *    invoices: payment is due when the term starts); the rest is not yet due. A term paid beyond
 *    its (later corrected) price is a credit. Terms from before B3.8 have no id: they cannot hold
 *    payments, so they are not part of outstanding and are counted in `untrackedTerms`.
 *  - Not linked — live payments recorded without a package: they are in Collected (money the
 *    coach received) but are taken off no term's outstanding; counted in `unlinked*` so the screen
 *    can say so. Linking one later is a correction (reversal + a payment for the package).
 *  - Reversed — payments voided this month (by the day they were reversed).
 *  - Active paying clients — current clients whose current term runs (active or paused, not a
 *    trial) and has a price.
 *  - Due / Lost this month, renewals and lapsed — exactly `businessSummary` (B3.8 D1 / D2).
 */

const METHOD_ORDER: PaymentMethod[] = ['cash', 'mobile_wallet', 'instapay'];
const TREND_MONTHS = 12;
const PACKAGE_ROWS = 5;

export interface TrendPoint {
  /** `YYYY-MM`, oldest first; the last one is this month. */
  key: string;
  bookedMinor: number;
  collectedMinor: number;
}

export type PipelineKey = 'overdue' | 'week' | 'twoWeeks' | 'month';
export interface PipelineRow {
  key: PipelineKey;
  count: number;
  minor: number;
}

export interface PackageRow {
  /** The package name on the term; null = a custom term (no package). */
  name: string | null;
  /** True for the folded tail ("Other"). */
  other?: boolean;
  clients: number;
  minor: number;
}

export interface MethodRow {
  method: PaymentMethod;
  minor: number;
  count: number;
}

export interface BusinessAnalytics {
  month: MonthRange;
  today: string;
  bookedAllMinor: number;
  bookedMonthMinor: number;
  bookedMonthTerms: number;
  collectedAllMinor: number;
  collectedMonthMinor: number;
  collectedMonthCount: number;
  outstandingMinor: number;
  overdueMinor: number;
  notYetDueMinor: number;
  overpaidMinor: number;
  /** Terms with a balance (outstanding > 0). */
  owingTerms: number;
  untrackedTerms: number;
  otherCurrencyTerms: number;
  reversedMonthMinor: number;
  reversedMonthCount: number;
  /** Live payments not linked to a package (all time): in Collected, never taken off Outstanding. */
  unlinkedMinor: number;
  unlinkedCount: number;
  dueMonthMinor: number;
  dueMonthTerms: number;
  lostMonthMinor: number;
  lostMonthTerms: number;
  activePaying: number;
  trend: TrendPoint[];
  methodsAll: MethodRow[];
  methodsMonth: MethodRow[];
  pipeline: PipelineRow[];
  packages: PackageRow[];
}

const isEgp = (t: { currency?: string }) => currencyKey(t.currency) === 'EGP';

/** The last `n` calendar months on this device, oldest first (`YYYY-MM`). */
export function lastMonths(now: number, n = TREND_MONTHS): string[] {
  const d = new Date(now);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function businessAnalytics(rels: CoachClientRelationship[], payments: ClientPayment[], now: number): BusinessAnalytics {
  const month = monthRange(now);
  const today = todayKey(now);
  const summary = businessSummary(rels, now);
  const egp = summary.money.find((l) => l.currency === 'EGP');
  const months = lastMonths(now);
  const trend = new Map(months.map((k) => [k, { key: k, bookedMinor: 0, collectedMinor: 0 }]));
  const paid = paidByTerm(payments);

  let bookedAllMinor = 0;
  let bookedMonthMinor = 0;
  let bookedMonthTerms = 0;
  let outstandingMinor = 0;
  let overdueMinor = 0;
  let notYetDueMinor = 0;
  let overpaidMinor = 0;
  let owingTerms = 0;
  let untrackedTerms = 0;
  let otherCurrencyTerms = 0;

  for (const rel of rels) {
    for (const { term } of termsOf(rel)) {
      if (term.status === 'pending') continue;
      const priceMinor = toMinor(term.price);
      if (priceMinor <= 0) continue;
      if (!isEgp(term)) {
        otherCurrencyTerms += 1;
        continue;
      }
      // Booked: the term's own first day decides its month.
      const key = termMonthKey(term);
      bookedAllMinor += priceMinor;
      if (key === month.key) {
        bookedMonthMinor += priceMinor;
        bookedMonthTerms += 1;
      }
      const point = trend.get(key);
      if (point) point.bookedMinor += priceMinor;
      // Outstanding: only terms that can hold payments (they have an id).
      if (!term.termId) {
        untrackedTerms += 1;
        continue;
      }
      const b = balanceOf(priceMinor, paid.get(term.termId) ?? 0);
      overpaidMinor += b.overpaidMinor;
      if (b.outstandingMinor > 0) {
        owingTerms += 1;
        outstandingMinor += b.outstandingMinor;
        if (termFirstDay(term) <= today) overdueMinor += b.outstandingMinor;
        else notYetDueMinor += b.outstandingMinor;
      }
    }
  }

  let collectedAllMinor = 0;
  let collectedMonthMinor = 0;
  let collectedMonthCount = 0;
  let reversedMonthMinor = 0;
  let reversedMonthCount = 0;
  let unlinkedMinor = 0;
  let unlinkedCount = 0;
  const methodsAll = new Map<PaymentMethod, MethodRow>(METHOD_ORDER.map((m) => [m, { method: m, minor: 0, count: 0 }]));
  const methodsMonth = new Map<PaymentMethod, MethodRow>(METHOD_ORDER.map((m) => [m, { method: m, minor: 0, count: 0 }]));
  for (const p of payments) {
    if (p.kind === 'reversal') {
      if (dayKeyOf(p.paidAt).slice(0, 7) === month.key) {
        reversedMonthMinor += p.amountMinor;
        reversedMonthCount += 1;
      }
      continue;
    }
    if (!isLivePayment(p)) continue;
    const key = dayKeyOf(p.paidAt).slice(0, 7);
    collectedAllMinor += p.amountMinor;
    if (!p.termId) {
      unlinkedMinor += p.amountMinor;
      unlinkedCount += 1;
    }
    const all = methodsAll.get(p.method);
    if (all) {
      all.minor += p.amountMinor;
      all.count += 1;
    }
    if (key === month.key) {
      collectedMonthMinor += p.amountMinor;
      collectedMonthCount += 1;
      const mm = methodsMonth.get(p.method);
      if (mm) {
        mm.minor += p.amountMinor;
        mm.count += 1;
      }
    }
    const point = trend.get(key);
    if (point) point.collectedMinor += p.amountMinor;
  }

  // Current clients: who pays now, what renews when, which packages they are on.
  let activePaying = 0;
  const pkg = new Map<string, PackageRow>();
  for (const rel of rels) {
    if (rel.status !== 'active' || !rel.subscription) continue;
    const sub: Subscription = rel.subscription;
    const eff = effectiveSubscriptionStatus(sub, now);
    const running = eff === 'active' || eff === 'trial' || eff === 'frozen';
    if (!running) continue;
    // A head count is not money: a priced term counts whatever its currency; amounts below stay EGP-only.
    if ((eff === 'active' || eff === 'frozen') && sub.status !== 'trial' && toMinor(sub.price) > 0) activePaying += 1;
    const priceMinor = isEgp(sub) ? toMinor(sub.price) : 0;
    const name = sub.planName?.trim() || null;
    const k = name ?? '';
    const row = pkg.get(k) ?? { name, clients: 0, minor: 0 };
    row.clients += 1;
    row.minor += priceMinor;
    pkg.set(k, row);
  }
  const sortedPkgs = [...pkg.values()].sort((a, b) => b.clients - a.clients || b.minor - a.minor || (a.name ?? '').localeCompare(b.name ?? ''));
  const packages: PackageRow[] = sortedPkgs.slice(0, PACKAGE_ROWS);
  if (sortedPkgs.length > PACKAGE_ROWS) {
    const rest = sortedPkgs.slice(PACKAGE_ROWS);
    packages.push({ name: null, other: true, clients: rest.reduce((n, r) => n + r.clients, 0), minor: rest.reduce((n, r) => n + r.minor, 0) });
  }

  const bucket = (key: PipelineKey): PipelineRow => ({ key, count: 0, minor: 0 });
  const pipeline: Record<PipelineKey, PipelineRow> = { overdue: bucket('overdue'), week: bucket('week'), twoWeeks: bucket('twoWeeks'), month: bucket('month') };
  const add = (row: PipelineRow, price: number | undefined, currency: string | undefined) => {
    row.count += 1;
    if (isEgp({ currency })) row.minor += toMinor(price);
  };
  for (const r of summary.lapsed) add(pipeline.overdue, r.price, r.currency);
  for (const r of summary.renewals) add(r.daysLeft <= 7 ? pipeline.week : r.daysLeft <= 14 ? pipeline.twoWeeks : pipeline.month, r.price, r.currency);

  return {
    month,
    today,
    bookedAllMinor,
    bookedMonthMinor,
    bookedMonthTerms,
    collectedAllMinor,
    collectedMonthMinor,
    collectedMonthCount,
    outstandingMinor,
    overdueMinor,
    notYetDueMinor,
    overpaidMinor,
    owingTerms,
    untrackedTerms,
    otherCurrencyTerms,
    reversedMonthMinor,
    reversedMonthCount,
    unlinkedMinor,
    unlinkedCount,
    dueMonthMinor: egp ? toMinor(egp.due) : 0,
    dueMonthTerms: egp?.dueTerms ?? 0,
    lostMonthMinor: egp ? toMinor(egp.lost) : 0,
    lostMonthTerms: egp?.lostTerms ?? 0,
    activePaying,
    trend: months.map((k) => trend.get(k)!),
    methodsAll: METHOD_ORDER.map((m) => methodsAll.get(m)!),
    methodsMonth: METHOD_ORDER.map((m) => methodsMonth.get(m)!),
    pipeline: [pipeline.overdue, pipeline.week, pipeline.twoWeeks, pipeline.month],
    packages,
  };
}

