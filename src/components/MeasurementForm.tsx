import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MeasurementKey, MeasurementLog } from '@/types';
import { useSettings } from '@/stores/settingsStore';
import { shortDate } from '@/lib/utils';

// Full-body measurement list (cm). Shared by the client entry page and the
// coach "view as client" measurement entry.
export const MEASUREMENT_KEYS: MeasurementKey[] = [
  'neck',
  'shoulders',
  'chest',
  'upperBack',
  'arm',
  'forearm',
  'wrist',
  'waist',
  'abdomen',
  'hips',
  'glutes',
  'thigh',
  'calf',
  'ankle',
];

/**
 * Body-measurement entry grid for one day. Seeds from the existing entry and
 * calls `onSave(date, values)` — used by both the client (writes their own store)
 * and the coach (writes the client's measurementLogs via `saveClientMeasurement`).
 * `extras` lets callers render per-field content (e.g. coach note affordances).
 */
export function MeasurementForm({
  date,
  existing,
  onSave,
  saving,
  extras,
}: {
  date: string;
  existing?: MeasurementLog | null;
  onSave: (date: string, values: Record<string, number>) => Promise<void> | void;
  saving?: boolean;
  extras?: (key: MeasurementKey) => React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const customMeasurements = useSettings((s) => s.settings?.customMeasurements);

  const labelOf = (key: string) =>
    t(`measure.parts.${key}`, {
      defaultValue: customMeasurements?.find((m) => m.key === key)?.label ?? key,
    });

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    const seed: Record<string, string> = {};
    for (const k of MEASUREMENT_KEYS) {
      const v = existing?.values[k];
      seed[k] = v != null ? String(v) : '';
    }
    setForm(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, existing?.updatedAt]);

  const submit = async () => {
    const values: Record<string, number> = {};
    for (const k of MEASUREMENT_KEYS) {
      const n = Number(form[k]);
      if (form[k] && !Number.isNaN(n)) values[k] = n;
    }
    await onSave(date, values);
  };

  return (
    <div className="card">
      <h2 className="mb-1 font-bold">{t('measure.forDay')}</h2>
      <p className="mb-3 text-xs text-slate-400">{shortDate(date, i18n.language)} · cm</p>
      <div className="grid grid-cols-3 gap-2">
        {MEASUREMENT_KEYS.map((k) => (
          <div key={k}>
            <label className="label truncate">{labelOf(k)}</label>
            <input
              className="input h-11 text-center"
              inputMode="decimal"
              placeholder="0"
              value={form[k] ?? ''}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            />
            {extras?.(k)}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => void submit()} disabled={saving} className="btn-primary btn-lg mt-3 w-full disabled:opacity-40">
        {t('common.save')}
      </button>
    </div>
  );
}
