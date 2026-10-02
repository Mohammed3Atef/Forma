import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill } from '@/components/ui/Pill';
import { TextInput, TextAreaField, SelectField } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useLocalized } from '@/hooks/useLocalized';
import { listCapacityPackages, reorderCapacityPackages, saveCapacityPackage, setCapacityPackageState } from '@/services/platform/coachCommercialApi';
import { useCapacityPrice } from '@/lib/formaFormat';
import type { CapacityPackage } from '@/types';
import { ToggleRow } from './ToggleRow';

interface Form {
  id?: string;
  nameEn: string;
  nameAr: string;
  descEn: string;
  descAr: string;
  badgeEn: string;
  badgeAr: string;
  additionalClients: string;
  price: string;
  currency: string;
  billingInterval: 'month' | 'one_time';
  durationMonths: string;
  active: boolean;
  coachVisible: boolean;
  promotional: boolean;
  validFrom: string; // yyyy-mm-dd
  validUntil: string;
  targetCoachIds: string; // comma/newline separated
}

const dateIn = (at?: number | null) => (at ? new Date(at).toISOString().slice(0, 10) : '');
const dateOut = (v: string, endOfDay = false) => (v ? new Date(`${v}T${endOfDay ? '23:59:59' : '00:00:00'}`).getTime() : null);

const blank = (): Form => ({
  nameEn: '', nameAr: '', descEn: '', descAr: '', badgeEn: '', badgeAr: '',
  additionalClients: '20', price: '', currency: 'EGP', billingInterval: 'month', durationMonths: '1',
  active: true, coachVisible: true, promotional: false, validFrom: '', validUntil: '', targetCoachIds: '',
});
const toForm = (p: CapacityPackage): Form => ({
  id: p.id,
  nameEn: p.name.en, nameAr: p.name.ar,
  descEn: p.description?.en ?? '', descAr: p.description?.ar ?? '',
  badgeEn: p.badge?.en ?? '', badgeAr: p.badge?.ar ?? '',
  additionalClients: String(p.additionalClients), price: String(p.price), currency: p.currency,
  billingInterval: p.billingInterval, durationMonths: String(p.durationMonths ?? 1),
  active: p.active, coachVisible: p.coachVisible, promotional: !!p.promotional,
  validFrom: dateIn(p.validFrom), validUntil: dateIn(p.validUntil),
  targetCoachIds: (p.targetCoachIds ?? []).join('\n'),
});

/** Internal capacity add-on catalogue — create / edit / activate / archive / reorder. */
export function CapacityPackagesTab() {
  const { t } = useTranslation();
  const loc = useLocalized();
  const price = useCapacityPrice();
  const qc = useQueryClient();
  const online = useOnlineStatus();
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const q = useQuery({ queryKey: ['capacityPackages', showArchived], queryFn: () => listCapacityPackages(showArchived) });
  const rows = q.data ?? [];
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['capacityPackages'] });
  const fail = (title: string) => (e: unknown) => void alertDialog({ title, message: e instanceof Error ? e.message : t('common.errorGeneric') });

  const errors = form
    ? {
        nameEn: !form.nameEn.trim() ? t('forma.admin.errRequired') : undefined,
        additionalClients: !(Math.floor(Number(form.additionalClients)) >= 1) ? t('forma.admin.errMin1') : undefined,
        price: form.price.trim() === '' || !(Number(form.price) >= 0) ? t('forma.admin.errPrice') : undefined,
        durationMonths: form.billingInterval === 'month' && !(Math.floor(Number(form.durationMonths)) >= 1) ? t('forma.admin.errMin1') : undefined,
        validUntil: form.validFrom && form.validUntil && form.validUntil < form.validFrom ? t('forma.admin.errDates') : undefined,
      }
    : {};
  const invalid = Object.values(errors).some(Boolean);

  const save = useMutation({
    mutationFn: (f: Form) =>
      saveCapacityPackage({
        id: f.id,
        name: { en: f.nameEn, ar: f.nameAr },
        description: { en: f.descEn, ar: f.descAr },
        badge: { en: f.badgeEn, ar: f.badgeAr },
        additionalClients: Math.floor(Number(f.additionalClients)),
        price: Number(f.price),
        currency: f.currency.trim() || 'EGP',
        billingInterval: f.billingInterval,
        durationMonths: f.billingInterval === 'month' ? Math.floor(Number(f.durationMonths)) || 1 : undefined,
        active: f.active,
        coachVisible: f.coachVisible,
        promotional: f.promotional,
        validFrom: dateOut(f.validFrom),
        validUntil: dateOut(f.validUntil, true),
        targetCoachIds: f.targetCoachIds.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean),
      }),
    onSuccess: () => { setForm(null); invalidate(); showToast({ title: t('common.saved'), variant: 'success' }); },
    onError: fail(t('forma.admin.packageForm')),
  });
  const setState = useMutation({
    mutationFn: (v: { id: string; active?: boolean; archived?: boolean }) => setCapacityPackageState(v.id, v),
    onSuccess: invalidate,
    onError: fail(t('forma.admin.tabPackages')),
  });
  const reorder = useMutation({ mutationFn: reorderCapacityPackages, onSuccess: invalidate, onError: fail(t('forma.admin.tabPackages')) });

  const move = (i: number, dir: -1 | 1) => {
    const ids = rows.filter((r) => !r.archived).map((r) => r.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  };
  const archive = async (p: CapacityPackage) => {
    if (await confirmDialog({ title: t('forma.admin.archive'), message: t('forma.admin.archiveBody', { name: loc(p.name), count: p.activeHolders ?? 0 }), danger: true })) setState.mutate({ id: p.id, archived: true });
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => form && setForm({ ...form, [k]: v });
  const live = rows.filter((r) => !r.archived);

  return (
    <div data-testid="capacity-packages">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13px] text-earth-muted">{t('forma.admin.packagesHint')}</p>
        <div className="flex items-center gap-2">
          <button type="button" className={`chip ${showArchived ? 'chip-on' : ''}`} onClick={() => setShowArchived((v) => !v)} data-testid="packages-show-archived">
            {t('forma.admin.showArchived')}
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={() => setForm(blank())} data-testid="package-add">
            <Icon name="plus" size={16} /> {t('forma.admin.addPackage')}
          </button>
        </div>
      </div>

      {q.isError && !q.data ? (
        <ErrorState onRetry={() => void q.refetch()} testId="packages-error" />
      ) : q.isLoading ? (
        <LoadingState variant="cards" count={3} />
      ) : rows.length === 0 ? (
        <EmptyState icon="user" title={t('forma.admin.noPackages')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const idx = live.findIndex((x) => x.id === p.id);
            return (
              <div key={p.id} className={`card flex flex-col gap-2 ${p.archived ? 'opacity-60' : ''}`} data-testid="package-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-xl font-bold">+{p.additionalClients}</p>
                    <p className="truncate text-sm font-semibold">{loc(p.name)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {p.archived ? <Pill tone="mute">{t('forma.admin.archived')}</Pill> : p.active ? <Pill tone="ok">{t('forma.admin.active')}</Pill> : <Pill tone="warn">{t('forma.admin.inactive')}</Pill>}
                    {!p.coachVisible && <Pill tone="info" dot={false}>{t('forma.admin.adminOnly')}</Pill>}
                    {p.targetCoachIds?.length ? <Pill tone="brand" dot={false}>{t('forma.admin.targeted', { count: p.targetCoachIds.length })}</Pill> : null}
                  </div>
                </div>
                <p className="text-sm" dir="auto">{price({ ...p, durationMonths: p.billingInterval === 'month' ? p.durationMonths ?? 1 : null })}</p>
                {p.badge && loc(p.badge) ? <span className="chip chip-on self-start text-[11px]">{loc(p.badge)}</span> : null}
                <p className="text-[12px] text-earth-subtle">{t('forma.admin.holders', { count: p.activeHolders ?? 0 })}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  <button type="button" className="btn-tonal btn-sm" onClick={() => setForm(toForm(p))} data-testid="package-edit">{t('common.edit')}</button>
                  {p.archived ? (
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setState.mutate({ id: p.id, archived: false })}>{t('forma.admin.restore')}</button>
                  ) : (
                    <>
                      <button type="button" className="btn-ghost btn-sm" data-testid="package-toggle-active" onClick={() => setState.mutate({ id: p.id, active: !p.active })}>
                        {p.active ? t('forma.admin.deactivate') : t('forma.admin.activate')}
                      </button>
                      <button type="button" className="btn-ghost btn-sm text-danger" data-testid="package-archive" onClick={() => void archive(p)}>{t('forma.admin.archive')}</button>
                      <span className="ms-auto flex gap-1">
                        <button type="button" className="icon-btn h-9 w-9" aria-label={t('forma.admin.moveUp')} disabled={idx <= 0 || reorder.isPending} onClick={() => move(idx, -1)}>
                          <Icon name="chevronDown" size={16} className="rotate-180" />
                        </button>
                        <button type="button" className="icon-btn h-9 w-9" aria-label={t('forma.admin.moveDown')} disabled={idx < 0 || idx >= live.length - 1 || reorder.isPending} onClick={() => move(idx, 1)}>
                          <Icon name="chevronDown" size={16} />
                        </button>
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={!!form} onClose={() => setForm(null)} size="md" title={form?.id ? t('forma.admin.editPackage') : t('forma.admin.addPackage')}>
        {form && (
          <div className="space-y-3" data-testid="package-form">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput label={t('forma.admin.nameEn')} value={form.nameEn} error={errors.nameEn} onChange={(e) => set('nameEn', e.target.value)} data-testid="package-name-en" />
              <TextInput label={t('forma.admin.nameAr')} dir="rtl" value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} />
              <TextInput label={t('forma.admin.additionalClients')} inputMode="numeric" value={form.additionalClients} error={errors.additionalClients} onChange={(e) => set('additionalClients', e.target.value)} data-testid="package-clients" />
              <SelectField label={t('forma.admin.interval')} value={form.billingInterval} onChange={(e) => set('billingInterval', e.target.value as Form['billingInterval'])} data-testid="package-interval">
                <option value="month">{t('forma.admin.intervalMonth')}</option>
                <option value="one_time">{t('forma.admin.intervalOneTime')}</option>
              </SelectField>
              <TextInput label={t('forma.admin.price')} inputMode="decimal" value={form.price} error={errors.price} onChange={(e) => set('price', e.target.value)} data-testid="package-price" />
              <TextInput label={t('forma.admin.currency')} value={form.currency} onChange={(e) => set('currency', e.target.value)} />
              {form.billingInterval === 'month' && (
                <TextInput label={t('forma.admin.durationMonths')} inputMode="numeric" value={form.durationMonths} error={errors.durationMonths} onChange={(e) => set('durationMonths', e.target.value)} />
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextAreaField label={t('forma.admin.descEn')} className="min-h-16" value={form.descEn} onChange={(e) => set('descEn', e.target.value)} />
              <TextAreaField label={t('forma.admin.descAr')} dir="rtl" className="min-h-16" value={form.descAr} onChange={(e) => set('descAr', e.target.value)} />
              <TextInput label={t('forma.admin.badgeEn')} value={form.badgeEn} onChange={(e) => set('badgeEn', e.target.value)} />
              <TextInput label={t('forma.admin.badgeAr')} dir="rtl" value={form.badgeAr} onChange={(e) => set('badgeAr', e.target.value)} />
              <TextInput label={t('forma.admin.validFrom')} type="date" value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)} />
              <TextInput label={t('forma.admin.validUntil')} type="date" value={form.validUntil} error={errors.validUntil} onChange={(e) => set('validUntil', e.target.value)} />
            </div>
            <ToggleRow label={t('forma.admin.active')} on={form.active} onChange={(v) => set('active', v)} testId="package-active" />
            <ToggleRow label={t('forma.admin.coachVisible')} hint={t('forma.admin.coachVisibleHint')} on={form.coachVisible} onChange={(v) => set('coachVisible', v)} testId="package-visible" />
            <ToggleRow label={t('forma.admin.promotional')} on={form.promotional} onChange={(v) => set('promotional', v)} />
            <TextAreaField label={t('forma.admin.targetCoaches')} helper={t('forma.admin.targetCoachesHint')} className="min-h-16 font-mono text-[12px]" value={form.targetCoachIds} onChange={(e) => set('targetCoachIds', e.target.value)} />
            {form.id && <p className="text-[12px] text-earth-subtle">{t('forma.admin.editSnapshotNote')}</p>}
            <SubmitButton type="button" pending={save.isPending} offline={!online} disabled={invalid} fullWidth onClick={() => save.mutate(form)} data-testid="package-save">
              {t('common.save')}
            </SubmitButton>
          </div>
        )}
      </Sheet>
    </div>
  );
}
