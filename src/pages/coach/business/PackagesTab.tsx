import { lazy, Suspense, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { CollectionList, CollectionTable, type CollectionColumn } from '@/components/library/LibraryCollection';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { deleteCoachPlan, listCoachPlans, saveCoachPlan } from '@/services/platform/coachPlansApi';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { parseDecimalOrNull, parseNumber } from '@/lib/utils';
import type { CoachSubscriptionPlan } from '@/types';
import { Money, useWriteGate, type BusinessTabProps } from './parts';
import type { PackageForm } from './PackageSheet';

const PackageSheet = lazy(() => import('./PackageSheet'));

const ORDER_STEP = 10;
/** A price is optional (empty = free); anything typed is a number ≥ 0 (Arabic-Indic digits too — the sheet validates it). */
const parsePackagePrice = (raw: string): number | undefined => (raw.trim() ? (parseDecimalOrNull(raw) ?? undefined) : undefined);

/**
 * Business › Packages (was "Client Plans", `/coach/subscription-plans` — CO-36 / TB-06 / TB-08): the
 * terms and prices a coach offers, picked when inviting or assigning a client and when setting a
 * term. One row per package (a table from 1024 px, a list below); a row opens its sheet, where it is
 * edited or deleted (confirmed — clients already on it keep their term). The old free-number "Order"
 * field is replaced by Move up / Move down on every row (D4): the picker order is the list order.
 * Writes are online-only (B1) and need a Forma plan that has not lapsed.
 */
export default function PackagesTab({ coachId }: BusinessTabProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const desktop = useIsDesktop();
  const { canWrite, reason } = useWriteGate();
  const [form, setForm] = useState<PackageForm | null>(null);

  // Distinct key: this list includes archived packages; the pickers' `['coachPlans', coachId]` does
  // not. The prefix invalidation refreshes both.
  const q = useQuery({ queryKey: ['coachPlans', coachId, 'withArchived'], queryFn: () => listCoachPlans(coachId, true), enabled: !!coachId });
  const plans = q.data ?? [];
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['coachPlans', coachId] });

  const save = useMutation({
    mutationFn: (f: PackageForm) =>
      saveCoachPlan({
        id: f.id,
        createdAt: f.createdAt,
        coachId,
        name: f.name.trim(),
        unit: f.unit,
        duration: Math.max(1, parseNumber(f.duration) || 1),
        price: parsePackagePrice(f.price),
        isTrial: f.isTrial,
        // A new package goes after the last one — read when saving, so it is right even if the list was still loading.
        order: f.id ? f.order : Math.max(0, ...plans.map((p) => p.order ?? 0)) + ORDER_STEP,
        archived: f.archived,
      }),
    onSuccess: () => {
      setForm(null);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteCoachPlan(coachId, id),
    onSuccess: () => {
      setForm(null);
      invalidate();
    },
    onError: () => void alertDialog({ title: t('coachPlans.delete'), message: t('common.savedFailed') }),
  });
  // Move one step: the list is re-numbered 10, 20, 30… and only packages whose position changed are saved.
  const move = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const list = [...plans];
      const i = list.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      for (const [k, p] of list.entries()) {
        const order = (k + 1) * ORDER_STEP;
        if (p.order !== order) await saveCoachPlan({ ...p, coachId, order });
      }
    },
    onSettled: invalidate,
    onError: () => void alertDialog({ title: t('business.packages.reorder'), message: t('business.packages.reorderFailed') }),
  });

  const openNew = () => open({ name: '', unit: 'months', duration: '1', price: '', isTrial: false });
  const openEdit = (p: CoachSubscriptionPlan) =>
    open({ id: p.id, createdAt: p.createdAt, order: p.order, archived: p.archived, name: p.name, unit: p.unit, duration: String(p.duration), price: p.price != null ? String(p.price) : '', isTrial: !!p.isTrial });
  const doDelete = async (p: PackageForm) => {
    if (p.id && (await confirmDialog({ title: t('coachPlans.delete'), message: t('coachPlans.confirmDelete', { name: p.name }), danger: true }))) remove.mutate(p.id);
  };

  const length = (p: CoachSubscriptionPlan) => t(`coachPlans.length.${p.unit}`, { count: p.duration }); // "1 month", "3 months" (CO-22)
  const priceOf = (p: CoachSubscriptionPlan) => (p.price != null && p.price > 0 ? <Money amount={p.price} /> : t('coachPlans.free'));
  const tags = (p: CoachSubscriptionPlan) => (
    <>
      {p.isTrial ? <span className="chip text-[12px]">{t('coachPlans.trial')}</span> : null}
      {p.archived ? <span className="chip text-[12px]" data-testid="coach-plan-archived">{t('business.packages.archived')}</span> : null}
    </>
  );
  const moves = (p: CoachSubscriptionPlan) => {
    const i = plans.findIndex((x) => x.id === p.id);
    return (
      <span className="inline-flex items-center gap-1">
        <IconButton icon="arrowUp" size="sm" label={t('business.packages.moveUp', { name: p.name })} disabled={!canWrite || move.isPending || i === 0} onClick={() => move.mutate({ id: p.id, dir: -1 })} data-testid="coach-plan-up" className="border-transparent" />
        <IconButton icon="arrowDown" size="sm" label={t('business.packages.moveDown', { name: p.name })} disabled={!canWrite || move.isPending || i === plans.length - 1} onClick={() => move.mutate({ id: p.id, dir: 1 })} data-testid="coach-plan-down" className="border-transparent" />
      </span>
    );
  };

  let body;
  if (q.isLoading) {
    body = (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-ui-control" />
        ))}
      </div>
    );
  } else if (q.isError && !q.data) {
    body = <ErrorState message={t('business.loadFailed')} onRetry={() => void q.refetch()} testId="coach-plan-list-error" />;
  } else if (plans.length === 0) {
    body = <p className="card text-sm text-earth-muted" data-testid="coach-plan-list">{t('coachPlans.none')}</p>;
  } else if (desktop) {
    const columns: CollectionColumn<CoachSubscriptionPlan>[] = [
      { key: 'name', header: t('business.packages.col.name'), primary: true, className: 'w-[36%]', cell: (p) => p.name },
      { key: 'length', header: t('business.packages.col.length'), className: 'w-[16%]', cell: length },
      { key: 'price', header: t('business.packages.col.price'), className: 'w-[16%]', align: 'end', cell: priceOf },
      { key: 'tags', header: t('business.packages.col.type'), className: 'w-[16%]', cell: (p) => <span className="inline-flex gap-1">{tags(p)}</span> },
      { key: 'order', header: t('business.packages.col.order'), className: 'w-[16%]', align: 'end', cell: moves },
    ];
    body = <CollectionTable columns={columns} caption={t('business.packages.caption')} rows={plans} rowKey={(p) => p.id} rowName={(p) => p.name} onOpen={openEdit} testId="coach-plan-list" rowTestId="coach-plan-row" />;
  } else {
    body = (
      <CollectionList
        rows={plans}
        rowKey={(p) => p.id}
        rowName={(p) => p.name}
        onOpen={openEdit}
        testId="coach-plan-list"
        rowTestId="coach-plan-row"
        action={moves}
        render={(p) => ({ title: p.name, meta: <>{length(p)} · {priceOf(p)}</>, trailing: <span className="inline-flex shrink-0 gap-1">{tags(p)}</span> })}
      />
    );
  }

  const [sheetUsed, setSheetUsed] = useState(false);
  const open = (f: PackageForm) => {
    setSheetUsed(true);
    setForm(f);
  };
  return (
    <div className="space-y-3" data-testid="coach-subscription-plans">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 flex-1 text-[13px] text-earth-muted">{t('coachPlans.hint')}</p>
        <Button icon="plus" className="self-start sm:self-auto" data-testid="coach-plan-add" title={reason} disabled={!canWrite} onClick={openNew}>
          {t('coachPlans.add')}
        </Button>
      </div>
      {body}

      {sheetUsed ? (
        <Suspense fallback={null}>
          <PackageSheet
            form={form}
            setForm={setForm}
            onClose={() => setForm(null)}
            onSave={(f) => save.mutate(f)}
            onDelete={(f) => void doDelete(f)}
            saving={save.isPending}
            deleting={remove.isPending}
            saveFailed={save.isError}
            canWrite={canWrite}
            reason={reason}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
