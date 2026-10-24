import { useEffect, useState } from 'react';
import { NumericField } from '@/components/ui/NumericField';
import { useTranslation } from 'react-i18next';
import type { MeasurementKey, MeasurementLog } from '@/types';
import { useSettings } from '@/stores/settingsStore';
import { showToast } from '@/stores/toastStore';
import { SubmitButton } from '@/components/ui/SubmitButton';
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
  readOnly,
}: {
  date: string;
  existing?: MeasurementLog | null;
  /** `clear` = keys the user emptied (previously set) — the save must remove them. */
  onSave: (date: string, values: Record<string, number>, clear: string[]) => Promise<void> | void;
  saving?: boolean;
  extras?: (key: MeasurementKey) => React.ReactNode;
  /** B3.8 (P2): shown, not editable (a coach whose Forma plan lapsed); this node replaces Save. */
  readOnly?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const customMeasurements = useSettings((s) => s.settings?.customMeasurements);

  const labelOf = (key: string) =>
    t(`measure.parts.${key}`, {
      defaultValue: customMeasurements?.find((m) => m.key === key)?.label ?? key,
    });

  // Numbers (null = empty); unreadable text is tracked per field by the canonical NumericField (B1.8).
  const [form, setForm] = useState<Record<string, number | null>>({});
  const [unreadable, setUnreadable] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const seed: Record<string, number | null> = {};
    for (const k of MEASUREMENT_KEYS) seed[k] = existing?.values[k] ?? null;
    setForm(seed);
    setUnreadable({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, existing?.updatedAt]);

  // Self-contained pending/error state — a caller not wiring up its own
  // `saving`/error handling (this used to be the client entry page: it never
  // passed `saving`, and neither `onSave` implementation was itself
  // guarded, so a failed IndexedDB/network write was completely silent)
  // still gets working feedback for free.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);
  const submit = async () => {
    const values: Record<string, number> = {};
    // Fields that HAD a value and are now empty — must be sent explicitly or
    // the save merges them back in and the "cleared" value reappears.
    const clear: string[] = [];
    // A typed value that can't be read is flagged — never silently dropped (RTL-04).
    const bad: string[] = [];
    for (const k of MEASUREMENT_KEYS) {
      const n = form[k] ?? null;
      if (unreadable[k]) bad.push(k);
      else if (n != null) values[k] = n;
      else if (existing?.values?.[k] != null) clear.push(k);
    }
    setInvalid(bad);
    if (bad.length) return;
    setBusy(true);
    setError(false);
    try {
      await onSave(date, values, clear);
      showToast({ title: t('common.saved'), variant: 'success' });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      {/* B3.9 (B2-R03): rebuilt once for both roles — no "0" placeholders that read as values, the unit
          on every field, the 12 px floor, tokens instead of slate. */}
      <h2 className="mb-1 text-[17px] font-semibold">{t('measure.forDay')}</h2>
      <p className="mb-3 text-[12px] text-earth-subtle">{shortDate(date, i18n.language)} · {t('common.cm')}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
        {MEASUREMENT_KEYS.map((k) => (
          <div key={k}>
            <label className="mb-1 block truncate text-[12px] font-medium text-earth-muted" htmlFor={`measure-${k}`}>{labelOf(k)}</label>
            <NumericField
              id={`measure-${k}`}
              invalid="flag"
              disabled={!!readOnly}
              placeholder="—"
              suffix={t('common.cm')}
              value={form[k] ?? null}
              error={invalid.includes(k)}
              onValidityChange={(valid) => setUnreadable((cur) => ({ ...cur, [k]: !valid }))}
              onChange={(n) => {
                setInvalid((cur) => cur.filter((x) => x !== k));
                setForm((cur) => ({ ...cur, [k]: n }));
              }}
            />
            {invalid.includes(k) && (
              <p className="mt-0.5 text-[12px] text-danger-text" role="alert" data-testid={`measure-invalid-${k}`}>
                {t('trust.numbers.invalid')}
              </p>
            )}
            {extras?.(k)}
          </div>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{t('common.savedFailed')}</p>}
      {readOnly ? (
        <div className="mt-3">{readOnly}</div>
      ) : (
        <SubmitButton type="button" onClick={() => void submit()} pending={busy || !!saving} className="mt-3" fullWidth size="lg">
          {t('common.save')}
        </SubmitButton>
      )}
    </div>
  );
}
