import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PlanReadOnlyNotice, useWriteGate } from '@/components/coach/CoachPlanProvider';
import { CoachDayNav } from '@/components/coach/CoachDayNav';
import { MeasurementForm, MEASUREMENT_KEYS } from '@/components/MeasurementForm';
import { EntityNotes } from '@/components/EntityNotes';
import { ErrorState } from '@/components/ui/ErrorState';
import { OfflineState, StaleNotice, useQueryScreen } from '@/components/ui/ScreenState';
import { useSession } from '@/services/auth/sessionStore';
import { fetchClientMeasurements, saveClientMeasurement } from '@/services/platform/coachApi';
import { useSettings } from '@/stores/settingsStore';
import { formatDate, formatNumber } from '@/lib/format';
import { today } from '@/lib/utils';

/**
 * Workspace › Progress › Body — measurements (B3.9 rebuild): an entry form for the chosen day, then
 * an A / B comparison. The form only appears once the client's entries have loaded — a failed or
 * offline read is said (CO-18), and saving over values it never saw could clear them. The comparison
 * follows the page's direction (RTL-11): the part name starts the row in Arabic too, numbers are
 * isolated left-to-right, units are stated, and a change is neutral — a smaller waist is not "bad".
 */
export function CoachViewMeasurements({ clientId }: { clientId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  // B3.8 (P2): measurements stay readable; saving is off with a lapsed Forma plan.
  const gate = useWriteGate();
  const qc = useQueryClient();
  const coachId = useSession((s) => s.account?.id) ?? '';
  const customMeasurements = useSettings((s) => s.settings?.customMeasurements);
  const [date, setDate] = useState(today());

  const logsQ = useQuery({ queryKey: ['clientMeasurements', clientId], queryFn: () => fetchClientMeasurements(clientId), enabled: !!clientId });
  const screen = useQueryScreen(logsQ);
  const logs = useMemo(() => logsQ.data ?? [], [logsQ.data]);
  const existing = logs.find((l) => l.id === date) ?? null;

  const labelOf = (key: string) =>
    t(`measure.parts.${key}`, { defaultValue: customMeasurements?.find((m) => m.key === key)?.label ?? key });

  const save = useMutation({
    mutationFn: ({ vals, clear }: { vals: Record<string, number>; clear: string[] }) => saveClientMeasurement(clientId, date, vals, coachId, clear),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clientMeasurements', clientId] }),
  });

  const dates = useMemo(() => logs.map((l) => l.date), [logs]);
  const [dateA, setDateA] = useState('');
  const [dateB, setDateB] = useState('');
  // B3.4 (TB-05): compare the latest entry with the one before it by default, and list every
  // measured part — the coach's custom ones too, not a fixed set.
  const defaultA = dates[dates.length - 2] ?? dates[0];
  const a = logs.find((l) => l.date === (dateA || defaultA));
  const b = logs.find((l) => l.date === (dateB || dates[dates.length - 1]));
  const keys = useMemo(() => {
    const extra = [...new Set([...Object.keys(a?.values ?? {}), ...Object.keys(b?.values ?? {})])].filter((k) => !(MEASUREMENT_KEYS as readonly string[]).includes(k));
    return [...MEASUREMENT_KEYS, ...extra];
  }, [a, b]);
  const cm = t('common.cm');
  const num = (v: number | undefined) => (v == null ? '–' : <bdi dir="ltr">{formatNumber(v, lang)}</bdi>);

  return (
    <section className="space-y-4" data-testid="body-measurements">
      <h2 className="text-[17px] font-semibold">{t('measure.title')}</h2>
      {screen.status === 'loading' ? (
        <div className="sk h-40 rounded-ui-surface" aria-busy="true" />
      ) : screen.status === 'offline' ? (
        <OfflineState onRetry={screen.retry} testId="measurements-offline" />
      ) : screen.status === 'error' ? (
        <ErrorState message={t('coachView.bodyFailed')} onRetry={screen.retry} testId="measurements-error" />
      ) : (
        <>
          {screen.stale ? <StaleNotice online={screen.online} /> : null}
          <CoachDayNav date={date} onChange={setDate} />
          <MeasurementForm
            date={date}
            existing={existing}
            onSave={async (_d, vals, clear) => {
              await save.mutateAsync({ vals, clear });
            }}
            readOnly={gate.planBlocked ? <PlanReadOnlyNotice /> : undefined}
            extras={(k) => <EntityNotes screen="measurements" date={date} entityType="measurement" entityId={k} label={labelOf(k)} />}
          />

          {dates.length >= 2 ? (
            <div className="card" data-testid="measure-compare">
              <h3 className="mb-2 text-[15px] font-semibold">{t('measure.compare')}</h3>
              <div className="mb-3 flex gap-2">
                <select value={dateA || defaultA} onChange={(e) => setDateA(e.target.value)} aria-label={t('workspace.progress.compareFrom')} className="input h-11 flex-1 py-1 text-[14px]">
                  {dates.map((d) => <option key={d} value={d}>{`A · ${formatDate(d, lang, 'medium')}`}</option>)}
                </select>
                <select value={dateB || dates[dates.length - 1]} onChange={(e) => setDateB(e.target.value)} aria-label={t('workspace.progress.compareTo')} className="input h-11 flex-1 py-1 text-[14px]">
                  {dates.map((d) => <option key={d} value={d}>{`B · ${formatDate(d, lang, 'medium')}`}</option>)}
                </select>
              </div>
              <table className="w-full overflow-hidden rounded-ui-control text-[14px] ring-1 ring-white/10">
                <thead className="bg-surface-raised text-[12px] text-earth-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-start font-medium">{t('measure.part')}</th>
                    <th scope="col" className="w-16 px-2 py-2 text-end font-medium">A</th>
                    <th scope="col" className="w-16 px-2 py-2 text-end font-medium">B</th>
                    <th scope="col" className="w-20 px-3 py-2 text-end font-medium">Δ ({cm})</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => {
                    const va = a?.values[k];
                    const vb = b?.values[k];
                    if (va == null && vb == null) return null;
                    const delta = va != null && vb != null ? Math.round((vb - va) * 10) / 10 : null;
                    return (
                      <tr key={k} className="border-t border-white/[0.06]" data-testid="measure-compare-row">
                        <th scope="row" className="px-3 py-2 text-start font-normal text-earth-muted">{labelOf(k)}</th>
                        <td className="px-2 py-2 text-end tabular-nums">{num(va)}</td>
                        <td className="px-2 py-2 text-end tabular-nums">{num(vb)}</td>
                        <td className="px-3 py-2 text-end font-semibold tabular-nums text-earth">
                          {delta == null ? '–' : <bdi dir="ltr">{`${delta > 0 ? '+' : ''}${formatNumber(delta, lang)}`}</bdi>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {logs.length === 0 ? <p className="py-4 text-center text-[14px] text-earth-muted">{t('measure.empty')}</p> : null}
        </>
      )}
    </section>
  );
}
