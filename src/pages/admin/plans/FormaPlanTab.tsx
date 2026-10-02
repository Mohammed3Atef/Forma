import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { TextInput, TextAreaField } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { ToggleRow } from './ToggleRow';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { getFormaConfig, saveFormaConfig } from '@/services/platform/coachPlanTiersApi';
import type { FormaConfig } from '@/types';

interface Form {
  trialEnabled: boolean;
  trialDurationDays: string;
  trialClientLimit: string; // '' = same as base
  maxClients: string;
  priceMonthly: string;
  currency: string;
  termDays: string;
  publicVisible: boolean;
  signupEnabled: boolean;
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  featuresEn: string;
  featuresAr: string;
}

const toForm = (c: FormaConfig): Form => ({
  trialEnabled: c.trialEnabled,
  trialDurationDays: String(c.trialDurationDays),
  trialClientLimit: c.trialClientLimit == null ? '' : String(c.trialClientLimit),
  maxClients: String(c.maxClients),
  priceMonthly: String(c.priceMonthly),
  currency: c.currency,
  termDays: String(c.termDays),
  publicVisible: c.publicVisible,
  signupEnabled: c.signupEnabled,
  titleEn: c.marketingTitle.en,
  titleAr: c.marketingTitle.ar,
  descEn: c.marketingDescription.en,
  descAr: c.marketingDescription.ar,
  featuresEn: c.marketingFeatures.en.join('\n'),
  featuresAr: c.marketingFeatures.ar.join('\n'),
});

/** The one Forma product's configuration. Every public / signup / My Plan value comes from here. */
export function FormaPlanTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const online = useOnlineStatus();
  const q = useQuery({ queryKey: ['formaConfig'], queryFn: getFormaConfig });
  const [form, setForm] = useState<Form | null>(null);
  useEffect(() => {
    if (q.data && !form) setForm(toForm(q.data));
  }, [q.data, form]);

  const int = (v: string) => (v.trim() === '' ? NaN : Math.floor(Number(v)));
  const errors = form
    ? {
        maxClients: !(int(form.maxClients) >= 1) ? t('forma.admin.errMin1') : undefined,
        trialDurationDays: form.trialEnabled && !(int(form.trialDurationDays) >= 1 && int(form.trialDurationDays) <= 365) ? t('forma.admin.errTrialDays') : undefined,
        trialClientLimit: form.trialClientLimit.trim() !== '' && !(int(form.trialClientLimit) >= 1) ? t('forma.admin.errMin1') : undefined,
        priceMonthly: !(Number(form.priceMonthly) >= 0) || form.priceMonthly.trim() === '' ? t('forma.admin.errPrice') : undefined,
        termDays: !(int(form.termDays) >= 1 && int(form.termDays) <= 366) ? t('forma.admin.errTerm') : undefined,
        currency: !form.currency.trim() ? t('forma.admin.errRequired') : undefined,
        titleEn: !form.titleEn.trim() ? t('forma.admin.errRequired') : undefined,
      }
    : {};
  const invalid = Object.values(errors).some(Boolean);

  const save = useMutation({
    mutationFn: (f: Form) =>
      saveFormaConfig({
        label: q.data?.label ?? 'Forma',
        trialEnabled: f.trialEnabled,
        trialDurationDays: int(f.trialDurationDays) || q.data?.trialDurationDays || 15,
        trialClientLimit: f.trialClientLimit.trim() === '' ? null : int(f.trialClientLimit),
        maxClients: int(f.maxClients),
        priceMonthly: Number(f.priceMonthly),
        currency: f.currency.trim(),
        termDays: int(f.termDays),
        publicVisible: f.publicVisible,
        signupEnabled: f.signupEnabled,
        marketingTitle: { en: f.titleEn, ar: f.titleAr },
        marketingDescription: { en: f.descEn, ar: f.descAr },
        marketingFeatures: { en: f.featuresEn.split('\n'), ar: f.featuresAr.split('\n') },
      }),
    onSuccess: (res) => {
      setForm(toForm(res.config));
      void qc.invalidateQueries({ queryKey: ['formaConfig'] });
      void qc.invalidateQueries({ queryKey: ['publicForma'] });
      void qc.invalidateQueries({ queryKey: ['coachAdmin'] });
      const raised = res.raisedTrialCoaches + res.raisedPaidCoaches;
      showToast({ title: t('common.saved'), body: raised ? t('forma.admin.raisedCoaches', { count: raised }) : undefined, variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('forma.admin.tabForma'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });

  if (q.isError && !q.data) return <ErrorState onRetry={() => void q.refetch()} testId="forma-config-error" />;
  if (!form || !q.data) return <LoadingState variant="cards" count={2} />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const onSave = async () => {
    const prev = q.data!;
    const lowering = int(form.maxClients) < prev.maxClients;
    if (lowering && !(await confirmDialog({ title: t('forma.admin.lowerTitle'), message: t('forma.admin.lowerBody', { from: prev.maxClients, to: int(form.maxClients) }) }))) return;
    save.mutate(form);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2" data-testid="forma-config">
      <section className="card space-y-3">
        <h3 className="h2">{t('forma.admin.subscriptionSection')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <TextInput label={t('forma.admin.maxClients')} inputMode="numeric" value={form.maxClients} error={errors.maxClients} onChange={(e) => set('maxClients', e.target.value)} data-testid="forma-max-clients" />
          <TextInput label={t('forma.admin.termDays')} inputMode="numeric" value={form.termDays} error={errors.termDays} onChange={(e) => set('termDays', e.target.value)} data-testid="forma-term-days" />
          <TextInput label={t('forma.admin.price')} inputMode="decimal" value={form.priceMonthly} error={errors.priceMonthly} onChange={(e) => set('priceMonthly', e.target.value)} data-testid="forma-price" />
          <TextInput label={t('forma.admin.currency')} value={form.currency} error={errors.currency} onChange={(e) => set('currency', e.target.value)} data-testid="forma-currency" />
        </div>
        <p className="text-[12px] text-earth-subtle">{t('forma.admin.limitHint')}</p>

        <h3 className="h2 pt-2">{t('forma.admin.trialSection')}</h3>
        <ToggleRow on={form.trialEnabled} onChange={(v) => set('trialEnabled', v)} label={t('forma.admin.trialEnabled')} testId="forma-trial-enabled" />
        {form.trialEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <TextInput label={t('forma.admin.trialDays')} inputMode="numeric" value={form.trialDurationDays} error={errors.trialDurationDays} onChange={(e) => set('trialDurationDays', e.target.value)} data-testid="forma-trial-days" />
            <TextInput label={t('forma.admin.trialLimit')} inputMode="numeric" placeholder={form.maxClients} value={form.trialClientLimit} error={errors.trialClientLimit} onChange={(e) => set('trialClientLimit', e.target.value)} data-testid="forma-trial-limit" />
          </div>
        )}
        <p className="text-[12px] text-earth-subtle">{t('forma.admin.trialHint')}</p>

        <h3 className="h2 pt-2">{t('forma.admin.visibilitySection')}</h3>
        <ToggleRow on={form.publicVisible} onChange={(v) => set('publicVisible', v)} label={t('forma.admin.publicVisible')} testId="forma-public-visible" />
        <ToggleRow on={form.signupEnabled} onChange={(v) => set('signupEnabled', v)} label={t('forma.admin.signupEnabled')} testId="forma-signup-enabled" />
      </section>

      <section className="card space-y-3">
        <h3 className="h2">{t('forma.admin.marketingSection')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label={t('forma.admin.titleEn')} value={form.titleEn} error={errors.titleEn} onChange={(e) => set('titleEn', e.target.value)} data-testid="forma-title-en" />
          <TextInput label={t('forma.admin.titleAr')} dir="rtl" value={form.titleAr} onChange={(e) => set('titleAr', e.target.value)} />
          <TextAreaField label={t('forma.admin.descEn')} className="min-h-20" value={form.descEn} onChange={(e) => set('descEn', e.target.value)} />
          <TextAreaField label={t('forma.admin.descAr')} dir="rtl" className="min-h-20" value={form.descAr} onChange={(e) => set('descAr', e.target.value)} />
          <TextAreaField label={t('forma.admin.featuresEn')} className="min-h-40" value={form.featuresEn} onChange={(e) => set('featuresEn', e.target.value)} data-testid="forma-features-en" />
          <TextAreaField label={t('forma.admin.featuresAr')} dir="rtl" className="min-h-40" value={form.featuresAr} onChange={(e) => set('featuresAr', e.target.value)} />
        </div>
        <p className="text-[12px] text-earth-subtle">{t('forma.admin.featuresHint')}</p>
      </section>

      <div className="lg:col-span-2">
        <SubmitButton pending={save.isPending} offline={!online} disabled={invalid} type="button" onClick={() => void onSave()} fullWidth data-testid="forma-save">
          {t('common.save')}
        </SubmitButton>
      </div>
    </div>
  );
}
