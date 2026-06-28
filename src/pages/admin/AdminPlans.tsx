import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Sheet } from '@/components/Sheet';
import { TextInput } from '@/components/ui/Field';
import { Icon } from '@/components/Icon';
import { confirmDialog } from '@/stores/dialogStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSession } from '@/services/auth/sessionStore';
import { archiveCoachPlanTier, listCoachPlanTiers, saveCoachPlanTier, tierLabel } from '@/services/platform/coachPlanTiersApi';
import type { CoachPlanTierConfig } from '@/types';

interface FormState {
  key: string;
  label: string;
  maxClients: string;
  priceMonthly: string;
  currency: string;
  order: string;
  active: boolean;
  isNew: boolean;
}

/** Super-admin: create / edit / archive the coach plan tiers (caps + pricing). */
export function AdminPlans() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isSuper = useSession((s) => s.account?.role === 'super_admin');
  const online = useOnlineStatus();
  const [form, setForm] = useState<FormState | null>(null);

  const q = useQuery({ queryKey: ['coachPlanTiers', 'all'], queryFn: () => listCoachPlanTiers(true), enabled: isSuper });
  const tiers = q.data ?? [];
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['coachPlanTiers'] });
  const save = useMutation({
    mutationFn: (f: FormState) =>
      saveCoachPlanTier({
        key: f.key,
        label: f.label,
        maxClients: Number(f.maxClients),
        priceMonthly: Number(f.priceMonthly),
        currency: f.currency,
        order: Number(f.order) || undefined,
        active: f.active,
      }),
    onSuccess: () => { setForm(null); invalidate(); },
  });
  const archive = useMutation({ mutationFn: (key: string) => archiveCoachPlanTier(key), onSuccess: invalidate });

  if (!isSuper) return <Navigate to="/admin" replace />;

  const openNew = () => setForm({ key: '', label: '', maxClients: '25', priceMonthly: '0', currency: 'EGP', order: '99', active: true, isNew: true });
  const openEdit = (tr: CoachPlanTierConfig) =>
    setForm({ key: tr.key, label: tr.label ?? '', maxClients: String(tr.maxClients), priceMonthly: String(tr.priceMonthly), currency: tr.currency ?? 'EGP', order: String(tr.order ?? 99), active: tr.active ?? true, isNew: false });
  const doArchive = async (tr: CoachPlanTierConfig) => {
    if (await confirmDialog({ title: t('adminPlans.archive'), message: t('adminPlans.confirmArchive', { name: tierLabel(tiers, tr.key, t) }), danger: true })) archive.mutate(tr.key);
  };

  return (
    <div data-testid="admin-plans">
      <TopBar
        title={t('adminPlans.title')}
        eyebrow={t('platform.superAdmin')}
        right={
          <button type="button" data-testid="plan-add" className="icon-btn h-[42px] w-[42px]" aria-label={t('adminPlans.add')} onClick={openNew}>
            <Icon name="plus" size={20} />
          </button>
        }
      />
      <p className="mb-4 text-[13px] text-earth-muted">{t('adminPlans.hint')}</p>

      <div className="card divide-y divide-line-soft p-0" data-testid="plan-list">
        {q.isLoading ? (
          <p className="p-5 text-sm text-earth-muted">{t('auth.working')}</p>
        ) : tiers.length === 0 ? (
          <p className="p-5 text-sm text-earth-muted">{t('adminPlans.none')}</p>
        ) : (
          tiers.map((tr) => (
            <div key={tr.key} className="flex items-center gap-3 px-5 py-3" data-testid="plan-row" data-key={tr.key}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {tierLabel(tiers, tr.key, t)}
                  {tr.archived ? ` · ${t('adminPlans.archived')}` : tr.active === false ? ` · ${t('adminPlans.inactive')}` : ''}
                </span>
                <span className="block truncate text-[12px] text-earth-subtle">
                  {t('adminCoaches.clientLimit')}: {tr.maxClients} · {tr.priceMonthly} {tr.currency ?? ''}{t('admin.perMonth')}
                </span>
              </span>
              <button type="button" className="btn-ghost h-9 px-3 text-[13px]" data-testid="plan-edit" onClick={() => openEdit(tr)}>{t('common.edit')}</button>
              {tr.key !== 'trial' && !tr.archived && (
                <button type="button" className="btn-ghost h-9 px-3 text-[13px] text-danger" data-testid="plan-archive" disabled={archive.isPending || !online} title={!online ? t('offline.actionDisabled') : undefined} onClick={() => void doArchive(tr)}>
                  {t('adminPlans.archive')}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <Sheet open={!!form} onClose={() => setForm(null)} size="md" title={form?.isNew ? t('adminPlans.add') : t('adminPlans.edit')}>
        {form && (
          <div className="space-y-3" data-testid="plan-form">
            {form.isNew && (
              <TextInput label={t('adminPlans.key')} data-testid="plan-key" placeholder="growth" helper={t('adminPlans.keyHint')} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
            )}
            <TextInput label={t('adminPlans.label')} data-testid="plan-label" placeholder={form.key || t('adminPlans.label')} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <TextInput label={t('adminCoaches.clientLimit')} inputMode="numeric" data-testid="plan-max" value={form.maxClients} onChange={(e) => setForm({ ...form, maxClients: e.target.value })} />
            <TextInput label={t('adminPlans.priceMonthly')} inputMode="decimal" data-testid="plan-price" value={form.priceMonthly} onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <TextInput label={t('field.currency')} data-testid="plan-currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
              <TextInput label={t('adminPlans.order')} inputMode="numeric" data-testid="plan-order" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} />
            </div>
            <label className="flex items-center justify-between py-1">
              <span className="label">{t('adminPlans.active')}</span>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-5 w-5 accent-brand" data-testid="plan-active" />
            </label>
            <button
              type="button"
              className="btn-primary w-full disabled:opacity-40"
              data-testid="plan-save"
              disabled={save.isPending || !online || (form.isNew && !form.key.trim()) || !(Number(form.maxClients) >= 0)}
              title={!online ? t('offline.actionDisabled') : undefined}
              onClick={() => save.mutate(form)}
            >
              {t('common.save')}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
