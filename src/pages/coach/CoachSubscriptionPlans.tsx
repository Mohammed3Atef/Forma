import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Sheet } from '@/components/Sheet';
import { TextInput, SelectField } from '@/components/ui/Field';
import { Icon } from '@/components/Icon';
import { confirmDialog } from '@/stores/dialogStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useCoachPlan } from '@/components/coach/CoachPlanProvider';
import { useSession } from '@/services/auth/sessionStore';
import { deleteCoachPlan, listCoachPlans, saveCoachPlan } from '@/services/platform/coachPlansApi';
import type { CoachSubscriptionPlan } from '@/types';

interface FormState {
  id?: string;
  createdAt?: number;
  name: string;
  unit: 'days' | 'months';
  duration: string;
  price: string;
  isTrial: boolean;
  order: string;
  isNew: boolean;
}

/** Coach: create / edit / delete reusable client subscription plans (name + duration + price). */
export function CoachSubscriptionPlans() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const coachId = useSession((s) => s.account?.id) ?? '';
  const currency = useSession((s) => s.account?.currency) ?? 'EGP';
  const { canWrite } = useCoachPlan();
  const online = useOnlineStatus();
  const [form, setForm] = useState<FormState | null>(null);

  const q = useQuery({ queryKey: ['coachPlans', coachId], queryFn: () => listCoachPlans(coachId, true), enabled: !!coachId });
  const plans = q.data ?? [];
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['coachPlans', coachId] });

  const save = useMutation({
    mutationFn: (f: FormState) =>
      saveCoachPlan({
        id: f.id,
        createdAt: f.createdAt,
        coachId,
        name: f.name.trim() || t('coachPlans.untitled'),
        unit: f.unit,
        duration: Math.max(1, Number(f.duration) || 1),
        price: f.price.trim() ? Number(f.price) || 0 : undefined,
        isTrial: f.isTrial,
        order: Number(f.order) || undefined,
      }),
    onSuccess: () => { setForm(null); invalidate(); },
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteCoachPlan(coachId, id), onSuccess: invalidate });

  const openNew = () => setForm({ name: '', unit: 'months', duration: '1', price: '', isTrial: false, order: String((plans.length + 1) * 10), isNew: true });
  const openEdit = (p: CoachSubscriptionPlan) =>
    setForm({ id: p.id, createdAt: p.createdAt, name: p.name, unit: p.unit, duration: String(p.duration), price: p.price != null ? String(p.price) : '', isTrial: !!p.isTrial, order: String(p.order ?? 99), isNew: false });
  const doDelete = async (p: CoachSubscriptionPlan) => {
    if (await confirmDialog({ title: t('coachPlans.delete'), message: t('coachPlans.confirmDelete', { name: p.name }), danger: true })) remove.mutate(p.id);
  };

  const durationLabel = (p: CoachSubscriptionPlan) => `${p.duration} ${t(`coachPlans.unit.${p.unit}`)}`;

  return (
    <div data-testid="coach-subscription-plans">
      <TopBar
        title={t('coachPlans.title')}
        eyebrow={t('platform.coachPortal')}
        right={
          <button type="button" data-testid="coach-plan-add" className="icon-btn h-[42px] w-[42px] disabled:opacity-40" aria-label={t('coachPlans.add')} disabled={!canWrite || !online} onClick={openNew}>
            <Icon name="plus" size={20} />
          </button>
        }
      />
      <p className="mb-4 text-[13px] text-earth-muted">{t('coachPlans.hint')}</p>

      <div className="card divide-y divide-line-soft p-0" data-testid="coach-plan-list">
        {q.isLoading ? (
          <p className="p-5 text-sm text-earth-muted">{t('auth.working')}</p>
        ) : plans.length === 0 ? (
          <p className="p-5 text-sm text-earth-muted">{t('coachPlans.none')}</p>
        ) : (
          plans.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-5 py-3" data-testid="coach-plan-row" data-plan-id={p.id}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {p.name}
                  {p.isTrial ? ` · ${t('coachPlans.trial')}` : ''}
                </span>
                <span className="block truncate text-[12px] text-earth-subtle">
                  {durationLabel(p)}
                  {p.price != null ? ` · ${p.price} ${currency}` : ` · ${t('coachPlans.free')}`}
                </span>
              </span>
              <button type="button" className="btn-ghost h-9 px-3 text-[13px] disabled:opacity-40" data-testid="coach-plan-edit" disabled={!canWrite} onClick={() => openEdit(p)}>{t('common.edit')}</button>
              <button type="button" className="btn-ghost h-9 px-3 text-[13px] text-danger disabled:opacity-40" data-testid="coach-plan-delete" disabled={!canWrite || remove.isPending || !online} title={!online ? t('offline.actionDisabled') : undefined} onClick={() => void doDelete(p)}>
                {t('common.delete')}
              </button>
            </div>
          ))
        )}
      </div>

      <Sheet open={!!form} onClose={() => setForm(null)} size="md" title={form?.isNew ? t('coachPlans.add') : t('coachPlans.edit')}>
        {form && (
          <div className="space-y-3" data-testid="coach-plan-form">
            <TextInput label={t('coachPlans.name')} data-testid="coach-plan-name" placeholder={t('coachPlans.namePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <TextInput label={t('coachPlans.duration')} inputMode="numeric" data-testid="coach-plan-duration" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
              <SelectField label={t('coachPlans.unitLabel')} data-testid="coach-plan-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as 'days' | 'months' })}>
                <option value="months">{t('coachPlans.unit.months')}</option>
                <option value="days">{t('coachPlans.unit.days')}</option>
              </SelectField>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TextInput label={`${t('coachPlans.price')} (${currency})`} inputMode="decimal" data-testid="coach-plan-price" placeholder={t('coachPlans.free')} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              <TextInput label={t('coachPlans.order')} inputMode="numeric" data-testid="coach-plan-order" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} />
            </div>
            <label className="flex items-center justify-between py-1">
              <span className="label">{t('coachPlans.isTrial')}</span>
              <input type="checkbox" checked={form.isTrial} onChange={(e) => setForm({ ...form, isTrial: e.target.checked })} className="h-5 w-5 accent-brand" data-testid="coach-plan-trial" />
            </label>
            <button
              type="button"
              className="btn-primary w-full disabled:opacity-40"
              data-testid="coach-plan-save"
              disabled={save.isPending || !online || !canWrite || !form.name.trim() || !(Number(form.duration) > 0)}
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
