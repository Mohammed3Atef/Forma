import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Sheet } from '@/components/Sheet';
import { TextInput, TextAreaField } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Icon } from '@/components/Icon';
import { confirmDialog, alertDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSession } from '@/services/auth/sessionStore';
import { archiveCoachPlanTier, getCoreFeatures, listCoachPlanTiers, saveCoachPlanTier, saveCoreFeatures, tierLabel } from '@/services/platform/coachPlanTiersApi';
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
  // ---- Marketing & Signup ----
  publicVisible: boolean;
  signupEnabled: boolean;
  highlighted: boolean;
  isDefaultSignupPlan: boolean;
  requiresPaymentConfirmation: boolean;
  // English required, Arabic optional — never a single hardcoded string (see LocalizedText).
  marketingTitleEn: string;
  marketingTitleAr: string;
  marketingDescriptionEn: string;
  marketingDescriptionAr: string;
  trialDurationDays: string;
}

interface CoreFeaturesForm {
  en: string;
  ar: string;
}

/** Super-admin: create / edit / archive the coach plan tiers (caps + pricing). */
export function AdminPlans() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isSuper = useSession((s) => s.account?.role === 'super_admin');
  const online = useOnlineStatus();
  const [form, setForm] = useState<FormState | null>(null);
  const [coreForm, setCoreForm] = useState<CoreFeaturesForm | null>(null);

  const q = useQuery({ queryKey: ['coachPlanTiers', 'all'], queryFn: () => listCoachPlanTiers(true), enabled: isSuper });
  const tiers = q.data ?? [];
  const coreQ = useQuery({ queryKey: ['coachPlanTiers', 'coreFeatures'], queryFn: getCoreFeatures, enabled: isSuper });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['coachPlanTiers'] });
  const saveCore = useMutation({
    mutationFn: (f: CoreFeaturesForm) =>
      saveCoreFeatures({
        en: f.en.split('\n').map((s) => s.trim()).filter(Boolean),
        ar: f.ar.split('\n').map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => { invalidate(); showToast({ title: t('common.saved'), variant: 'success' }); },
    onError: (e) => void alertDialog({ title: t('adminPlans.coreFeaturesTitle'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });
  const coreEditing = coreForm ?? (coreQ.data ? { en: coreQ.data.en.join('\n'), ar: coreQ.data.ar.join('\n') } : null);
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
        publicVisible: f.publicVisible,
        signupEnabled: f.signupEnabled,
        highlighted: f.highlighted,
        isDefaultSignupPlan: f.isDefaultSignupPlan,
        requiresPaymentConfirmation: f.requiresPaymentConfirmation,
        marketingTitle: { en: f.marketingTitleEn, ar: f.marketingTitleAr || undefined },
        marketingDescription: { en: f.marketingDescriptionEn, ar: f.marketingDescriptionAr || undefined },
        trialDurationDays: Number(f.trialDurationDays) || undefined,
      }),
    onSuccess: () => { setForm(null); invalidate(); showToast({ title: t('common.saved'), variant: 'success' }); },
    onError: (e) => void alertDialog({ title: t('adminPlans.add'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });
  const archive = useMutation({
    mutationFn: (key: string) => archiveCoachPlanTier(key),
    onSuccess: () => { invalidate(); showToast({ title: t('common.removed'), variant: 'success' }); },
    onError: (e) => void alertDialog({ title: t('adminPlans.archive'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });

  if (!isSuper) return <Navigate to="/admin" replace />;

  const openNew = () =>
    setForm({
      key: '', label: '', maxClients: '25', priceMonthly: '0', currency: 'EGP', order: '99', active: true, isNew: true,
      publicVisible: false, signupEnabled: false, highlighted: false, isDefaultSignupPlan: false, requiresPaymentConfirmation: true,
      marketingTitleEn: '', marketingTitleAr: '', marketingDescriptionEn: '', marketingDescriptionAr: '', trialDurationDays: '',
    });
  const openEdit = (tr: CoachPlanTierConfig) =>
    setForm({
      key: tr.key, label: tr.label ?? '', maxClients: String(tr.maxClients), priceMonthly: String(tr.priceMonthly), currency: tr.currency ?? 'EGP', order: String(tr.order ?? 99), active: tr.active ?? true, isNew: false,
      publicVisible: tr.publicVisible ?? false,
      signupEnabled: tr.signupEnabled ?? false,
      highlighted: tr.highlighted ?? false,
      isDefaultSignupPlan: tr.isDefaultSignupPlan ?? false,
      requiresPaymentConfirmation: tr.requiresPaymentConfirmation ?? true,
      marketingTitleEn: tr.marketingTitle?.en ?? '',
      marketingTitleAr: tr.marketingTitle?.ar ?? '',
      marketingDescriptionEn: tr.marketingDescription?.en ?? '',
      marketingDescriptionAr: tr.marketingDescription?.ar ?? '',
      trialDurationDays: tr.trialDurationDays ? String(tr.trialDurationDays) : '',
    });
  const doArchive = async (tr: CoachPlanTierConfig) => {
    if (await confirmDialog({ title: t('adminPlans.archive'), message: t('adminPlans.confirmArchive', { name: tierLabel(tiers, tr.key, t) }), danger: true })) archive.mutate(tr.key);
  };

  return (
    <div data-testid="admin-plans">
      <TopBar
        title={t('adminPlans.title')}
        eyebrow={t('platform.superAdmin')}
        right={
          <button type="button" data-testid="plan-add" className="icon-btn h-11 w-11" aria-label={t('adminPlans.add')} onClick={openNew}>
            <Icon name="plus" size={20} />
          </button>
        }
      />
      <p className="mb-4 text-[13px] text-earth-muted">{t('adminPlans.hint')}</p>

      <section className="card mb-6 space-y-3" data-testid="core-features-card">
        <h3 className="h2">{t('adminPlans.coreFeaturesTitle')}</h3>
        <p className="text-[12px] text-earth-subtle">{t('adminPlans.coreFeaturesHint')}</p>
        {coreEditing && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <TextAreaField
                label={`${t('adminPlans.marketingFeatures')} (EN)`}
                helper={t('adminPlans.marketingFeaturesHint')}
                className="min-h-24"
                data-testid="core-features-en"
                value={coreEditing.en}
                onChange={(e) => setCoreForm({ ...coreEditing, en: e.target.value })}
              />
              <TextAreaField
                dir="rtl"
                label={`${t('adminPlans.marketingFeatures')} (AR)`}
                helper={t('adminPlans.marketingFeaturesHint')}
                className="min-h-24"
                data-testid="core-features-ar"
                value={coreEditing.ar}
                onChange={(e) => setCoreForm({ ...coreEditing, ar: e.target.value })}
              />
            </div>
            <SubmitButton
              type="button"
              data-testid="core-features-save"
              disabled={!coreEditing.en.trim()}
              offline={!online}
              pending={saveCore.isPending}
              onClick={() => saveCore.mutate(coreEditing)}
            >
              {t('common.save')}
            </SubmitButton>
          </>
        )}
      </section>

      {q.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : tiers.length === 0 ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('adminPlans.none')}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="plan-list">
          {tiers.map((tr) => (
            <div key={tr.key} className={`card ${tr.archived ? 'opacity-60' : ''}`} data-testid="plan-row" data-key={tr.key}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-display text-base font-semibold">{tierLabel(tiers, tr.key, t)}</span>
                  {(tr.archived || tr.active === false) && (
                    <span className="mt-1 inline-block chip text-[10.5px]">{tr.archived ? t('adminPlans.archived') : t('adminPlans.inactive')}</span>
                  )}
                </span>
              </div>
              <p className="font-display text-2xl font-bold leading-none">
                {tr.priceMonthly}<span className="ms-1 text-sm font-normal text-earth-muted">{tr.currency ?? ''}{t('admin.perMonth')}</span>
              </p>
              <p className="mt-2 text-[13px] text-earth-muted">{t('adminCoaches.clientLimit')}: {tr.maxClients}</p>
              <div className="mt-4 flex gap-2">
                <button type="button" className="btn-tonal btn-sm flex-1" data-testid="plan-edit" onClick={() => openEdit(tr)}>{t('common.edit')}</button>
                {tr.key !== 'trial' && !tr.archived && (
                  <button type="button" className="btn-ghost btn-sm flex-1 text-danger" data-testid="plan-archive" disabled={archive.isPending || !online} title={!online ? t('offline.actionDisabled') : undefined} onClick={() => void doArchive(tr)}>
                    {t('adminPlans.archive')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!form} onClose={() => setForm(null)} size="md" title={form?.isNew ? t('adminPlans.add') : t('adminPlans.edit')}>
        {form && (
          <div className="space-y-3" data-testid="plan-form">
            {form.isNew && (
              <TextInput label={t('adminPlans.key')} data-testid="plan-key" placeholder="growth" helper={t('adminPlans.keyHint')} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
            )}
            <TextInput label={t('adminPlans.label')} data-testid="plan-label" placeholder={form.key || t('adminPlans.label')} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <TextInput
              label={t('adminCoaches.clientLimit')}
              inputMode="numeric"
              data-testid="plan-max"
              helper={t('adminPlans.maxClientsHint')}
              value={form.maxClients}
              onChange={(e) => setForm({ ...form, maxClients: e.target.value })}
              error={!(Number(form.maxClients) >= 0) ? t('adminCoaches.limitInvalid') : undefined}
            />
            <TextInput
              label={t('adminPlans.priceMonthly')}
              inputMode="decimal"
              data-testid="plan-price"
              value={form.priceMonthly}
              onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })}
              error={Number(form.priceMonthly) < 0 ? t('transfer.priceInvalid') : undefined}
            />
            <div className="grid grid-cols-2 gap-2">
              <TextInput label={t('field.currency')} data-testid="plan-currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
              <TextInput label={t('adminPlans.order')} inputMode="numeric" data-testid="plan-order" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} />
            </div>
            <label className="flex items-center justify-between py-1">
              <span className="label">{t('adminPlans.active')}</span>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-5 w-5 accent-brand" data-testid="plan-active" />
            </label>

            <h3 className="h2 pt-2">{t('adminPlans.marketingSection')}</h3>
            <label className="flex items-center justify-between py-1">
              <span className="label">{t('adminPlans.publicVisible')}</span>
              <input type="checkbox" checked={form.publicVisible} onChange={(e) => setForm({ ...form, publicVisible: e.target.checked })} className="h-5 w-5 accent-brand" data-testid="plan-public-visible" />
            </label>
            <label className="flex items-center justify-between py-1">
              <span className="label">{t('adminPlans.signupEnabled')}</span>
              <input type="checkbox" checked={form.signupEnabled} onChange={(e) => setForm({ ...form, signupEnabled: e.target.checked })} className="h-5 w-5 accent-brand" data-testid="plan-signup-enabled" />
            </label>
            <label className="flex items-center justify-between py-1">
              <span className="label">{t('adminPlans.highlighted')}</span>
              <input type="checkbox" checked={form.highlighted} onChange={(e) => setForm({ ...form, highlighted: e.target.checked })} className="h-5 w-5 accent-brand" data-testid="plan-highlighted" />
            </label>
            <label className="flex items-center justify-between py-1">
              <span className="label">{t('adminPlans.isDefaultSignupPlan')}</span>
              <input
                type="checkbox"
                checked={form.isDefaultSignupPlan}
                onChange={(e) => setForm({ ...form, isDefaultSignupPlan: e.target.checked, requiresPaymentConfirmation: e.target.checked ? false : form.requiresPaymentConfirmation })}
                className="h-5 w-5 accent-brand"
                data-testid="plan-is-default-signup"
              />
            </label>
            <p className="text-[12px] text-earth-subtle">{t('adminPlans.isDefaultSignupPlanHint')}</p>
            <label className="flex items-center justify-between py-1">
              <span className="label">{t('adminPlans.requiresPaymentConfirmation')}</span>
              <input
                type="checkbox"
                checked={form.requiresPaymentConfirmation}
                disabled={form.isDefaultSignupPlan}
                onChange={(e) => setForm({ ...form, requiresPaymentConfirmation: e.target.checked })}
                className="h-5 w-5 accent-brand disabled:opacity-40"
                data-testid="plan-requires-payment"
              />
            </label>
            {form.isDefaultSignupPlan && (
              <TextInput
                label={t('adminPlans.trialDurationDays')}
                inputMode="numeric"
                data-testid="plan-trial-days"
                value={form.trialDurationDays}
                onChange={(e) => setForm({ ...form, trialDurationDays: e.target.value })}
              />
            )}
            <p className="text-[12px] text-earth-subtle">{t('adminPlans.localizedHint')}</p>
            <div className="grid grid-cols-2 gap-2">
              <TextInput label={`${t('adminPlans.marketingTitle')} (EN)`} data-testid="plan-marketing-title-en" placeholder={form.label || t('adminPlans.marketingTitle')} value={form.marketingTitleEn} onChange={(e) => setForm({ ...form, marketingTitleEn: e.target.value })} />
              <TextInput dir="rtl" label={`${t('adminPlans.marketingTitle')} (AR)`} data-testid="plan-marketing-title-ar" value={form.marketingTitleAr} onChange={(e) => setForm({ ...form, marketingTitleAr: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TextAreaField label={`${t('adminPlans.marketingDescription')} (EN)`} className="min-h-20" data-testid="plan-marketing-description-en" value={form.marketingDescriptionEn} onChange={(e) => setForm({ ...form, marketingDescriptionEn: e.target.value })} />
              <TextAreaField dir="rtl" label={`${t('adminPlans.marketingDescription')} (AR)`} className="min-h-20" data-testid="plan-marketing-description-ar" value={form.marketingDescriptionAr} onChange={(e) => setForm({ ...form, marketingDescriptionAr: e.target.value })} />
            </div>
            <SubmitButton
              type="button"
              fullWidth
              data-testid="plan-save"
              disabled={(form.isNew && !form.key.trim()) || !(Number(form.maxClients) >= 0) || Number(form.priceMonthly) < 0}
              offline={!online}
              pending={save.isPending}
              onClick={() => save.mutate(form)}
            >
              {t('common.save')}
            </SubmitButton>
          </div>
        )}
      </Sheet>
    </div>
  );
}
