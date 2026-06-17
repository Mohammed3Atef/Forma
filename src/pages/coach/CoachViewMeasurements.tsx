import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CoachDayNav } from '@/components/coach/CoachDayNav';
import { MeasurementForm, MEASUREMENT_KEYS } from '@/components/MeasurementForm';
import { EntityNotes } from '@/components/EntityNotes';
import { useSession } from '@/services/auth/sessionStore';
import { fetchClientMeasurements, saveClientMeasurement } from '@/services/platform/coachApi';
import { useSettings } from '@/stores/settingsStore';
import { shortDate, today } from '@/lib/utils';

/** Coach view of a client's measurements: history + comparison + an entry form the coach can fill. */
export function CoachViewMeasurements({ clientId }: { clientId: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const coachId = useSession((s) => s.account?.id) ?? '';
  const customMeasurements = useSettings((s) => s.settings?.customMeasurements);
  const [date, setDate] = useState(today());

  const logsQ = useQuery({ queryKey: ['clientMeasurements', clientId], queryFn: () => fetchClientMeasurements(clientId), enabled: !!clientId });
  const logs = logsQ.data ?? [];
  const existing = logs.find((l) => l.id === date) ?? null;

  const labelOf = (key: string) =>
    t(`measure.parts.${key}`, { defaultValue: customMeasurements?.find((m) => m.key === key)?.label ?? key });

  const save = useMutation({
    mutationFn: (vals: Record<string, number>) => saveClientMeasurement(clientId, date, vals, coachId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clientMeasurements', clientId] }),
  });

  const dates = useMemo(() => logs.map((l) => l.date), [logs]);
  const [dateA, setDateA] = useState('');
  const [dateB, setDateB] = useState('');
  const a = logs.find((l) => l.date === (dateA || dates[0]));
  const b = logs.find((l) => l.date === (dateB || dates[dates.length - 1]));

  return (
    <div className="space-y-4">
      <CoachDayNav date={date} onChange={setDate} />

      <MeasurementForm
        date={date}
        existing={existing}
        saving={save.isPending}
        onSave={(_d, vals) => save.mutate(vals)}
        extras={(k) => <EntityNotes screen="measurements" date={date} entityType="measurement" entityId={k} label={labelOf(k)} />}
      />

      {/* Comparison */}
      {dates.length >= 2 && (
        <div className="card">
          <h2 className="mb-2 font-bold">{t('measure.compare')}</h2>
          <div className="mb-3 flex gap-2">
            <select value={dateA || dates[0]} onChange={(e) => setDateA(e.target.value)} className="input h-10 flex-1 py-1 text-sm">
              {dates.map((d) => <option key={d} value={d}>{shortDate(d, i18n.language)}</option>)}
            </select>
            <select value={dateB || dates[dates.length - 1]} onChange={(e) => setDateB(e.target.value)} className="input h-10 flex-1 py-1 text-sm">
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
            {MEASUREMENT_KEYS.map((k) => {
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

      {logs.length === 0 && <p className="py-6 text-center text-sm text-earth-muted">{t('measure.empty')}</p>}
    </div>
  );
}
