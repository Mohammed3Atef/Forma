import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/Button';
import { TextInput, SelectField } from '@/components/ui/Field';
import { parseDecimalOrNull, parseNumber } from '@/lib/utils';

export interface PackageForm {
  id?: string;
  createdAt?: number;
  order?: number;
  archived?: boolean;
  name: string;
  unit: 'days' | 'months';
  duration: string;
  price: string;
  isTrial: boolean;
}

/**
 * One package — create, edit, or delete (confirmed; clients already on it keep their term). Its own
 * chunk: only opening a package needs it (budget §9).
 */
export default function PackageSheet({
  form,
  setForm,
  onClose,
  onSave,
  onDelete,
  saving,
  deleting,
  saveFailed,
  canWrite,
  reason,
}: {
  form: PackageForm | null;
  setForm: (f: PackageForm) => void;
  onClose: () => void;
  onSave: (f: PackageForm) => void;
  onDelete: (f: PackageForm) => void;
  saving: boolean;
  deleting: boolean;
  saveFailed: boolean;
  canWrite: boolean;
  reason: string | undefined;
}) {
  const { t } = useTranslation();
  const nameMissing = !!form && !form.name.trim();
  const durationBad = !!form && !(parseNumber(form.duration) > 0);
  const priceValue = form?.price.trim() ? parseDecimalOrNull(form.price) : null;
  const priceBad = !!form && !!form.price.trim() && (priceValue == null || priceValue < 0);
  return (
    <Sheet open={!!form} onClose={onClose} size="md" title={form?.id ? t('coachPlans.edit') : t('coachPlans.add')}>
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
          <TextInput label={t('subscription.priceEgp')} inputMode="decimal" data-testid="coach-plan-price" placeholder={t('coachPlans.free')} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          <label className="flex items-center justify-between py-1">
            <span className="label">{t('coachPlans.isTrial')}</span>
            <input type="checkbox" checked={form.isTrial} onChange={(e) => setForm({ ...form, isTrial: e.target.checked })} className="h-5 w-5 accent-brand" data-testid="coach-plan-trial" />
          </label>
          {saveFailed ? <p role="alert" className="text-sm text-danger">{t('common.savedFailed')}</p> : null}
          <Button fullWidth data-testid="coach-plan-save" title={reason} pending={saving} disabled={!canWrite || nameMissing || durationBad || priceBad} onClick={() => onSave(form)}>
            {t('common.save')}
          </Button>
          {form.id ? (
            <Button fullWidth variant="ghost" className="text-danger" data-testid="coach-plan-delete" title={reason} pending={deleting} disabled={!canWrite} onClick={() => onDelete(form)}>
              {t('coachPlans.delete')}
            </Button>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
