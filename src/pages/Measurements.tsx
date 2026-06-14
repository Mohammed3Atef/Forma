import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MeasurementKey } from '@/types';
import { useMeasurements } from '@/stores/measurementStore';
import { useDay } from '@/stores/dayStore';
import { useSettings } from '@/stores/settingsStore';
import { Icon } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { shortDate } from '@/lib/utils';

// Full-body measurement list (cm).
const KEYS: MeasurementKey[] = [
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

export function Measurements() {
  const { t, i18n } = useTranslation();
  const logs = useMeasurements((s) => s.logs);
  const load = useMeasurements((s) => s.load);
  const loaded = useMeasurements((s) => s.loaded);
  const save = useMeasurements((s) => s.save);
  const forDate = useMeasurements((s) => s.forDate);
  const selected = useDay((s) => s.selected);
  const customMeasurements = useSettings((s) => s.settings?.customMeasurements);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const labelOf = (key: string) =>
    t(`measure.parts.${key}`, {
      defaultValue: customMeasurements?.find((m) => m.key === key)?.label ?? key,
    });

  const existing = forDate(selected);
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    const seed: Record<string, string> = {};
    for (const k of KEYS) {
      const v = existing?.values[k];
      seed[k] = v != null ? String(v) : '';
    }
    setForm(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, existing?.updatedAt]);

  const submit = async () => {
    const values: Record<string, number> = {};
    for (const k of KEYS) {
      const n = Number(form[k]);
      if (form[k] && !Number.isNaN(n)) values[k] = n;
    }
    await save(selected, values);
  };

  const dates = useMemo(() => logs.map((l) => l.date), [logs]);
  const [dateA, setDateA] = useState('');
  const [dateB, setDateB] = useState('');
  const datesKey = dates.join('|');
  useEffect(() => {
    if (!dates.length) return;
    setDateA(dates[0]);
    setDateB(dates[dates.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datesKey]);

  const a = forDate(dateA);
  const b = forDate(dateB);

  const navigate = useNavigate();

  return (
    <div className="anim-rise space-y-4">
      <TopBar title={t('measure.title')} eyebrow={t('gt.body')} onBack={() => navigate('/progress')} />

      {/* Entry form for the selected day */}
      <div className="card">
        <h2 className="mb-1 font-bold">{t('measure.forDay')}</h2>
        <p className="mb-3 text-xs text-slate-400">{shortDate(selected, i18n.language)} · cm</p>
        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((k) => (
            <div key={k}>
              <label className="label truncate">{labelOf(k)}</label>
              <input
                className="input h-11 text-center"
                inputMode="decimal"
                placeholder="0"
                value={form[k] ?? ''}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <button type="button" onClick={() => void submit()} className="btn-primary btn-lg mt-3 w-full">
          {t('common.save')}
        </button>
      </div>

      {/* Comparison */}
      {dates.length >= 2 && (
        <div className="card">
          <h2 className="mb-2 font-bold">{t('measure.compare')}</h2>
          <div className="mb-3 flex gap-2">
            <select value={dateA} onChange={(e) => setDateA(e.target.value)} className="input h-10 flex-1 py-1 text-sm">
              {dates.map((d) => <option key={d} value={d}>{shortDate(d, i18n.language)}</option>)}
            </select>
            <select value={dateB} onChange={(e) => setDateB(e.target.value)} className="input h-10 flex-1 py-1 text-sm">
              {dates.map((d) => <option key={d} value={d}>{shortDate(d, i18n.language)}</option>)}
            </select>
          </div>
          <div className="overflow-hidden rounded-xl ring-1 ring-white/10" dir="ltr">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 bg-surface-raised px-3 py-2 text-[10px] uppercase text-slate-400">
              <span>{t('measure.part')}</span>
              <span className="w-12 text-right">A</span>
              <span className="w-12 text-right">B</span>
              <span className="w-14 text-right">Δ</span>
            </div>
            {KEYS.map((k) => {
              const va = a?.values[k];
              const vb = b?.values[k];
              if (va == null && vb == null) return null;
              const delta = va != null && vb != null ? Math.round((vb - va) * 10) / 10 : null;
              return (
                <div key={k} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 border-t border-white/5 px-3 py-2 text-sm">
                  <span className="text-slate-300">{labelOf(k)}</span>
                  <span className="w-12 text-right tabular-nums">{va ?? '–'}</span>
                  <span className="w-12 text-right tabular-nums">{vb ?? '–'}</span>
                  <span className={`w-14 text-right font-semibold tabular-nums ${delta == null ? 'text-slate-500' : delta > 0 ? 'text-brand-light' : delta < 0 ? 'text-warn' : 'text-slate-400'}`}>
                    {delta == null ? '–' : `${delta > 0 ? '+' : ''}${delta}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* History */}
      {logs.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-bold">{t('cardio.history')}</h2>
          <ul className="space-y-1 text-sm">
            {logs.slice().reverse().map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-2">
                <span>{shortDate(l.date, i18n.language)}</span>
                <span className="text-end text-slate-400" dir="ltr">
                  {Object.keys(l.values).map((k) => `${labelOf(k)} ${l.values[k]}`).join(' · ') || '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {logs.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Icon name="scale" size={16} /> {t('measure.empty')}
        </p>
      )}
    </div>
  );
}
