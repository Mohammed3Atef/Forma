import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMeasurements } from '@/stores/measurementStore';
import { useDay } from '@/stores/dayStore';
import { DaySwitcher } from '@/components/client/DaySwitcher';
import { useSettings } from '@/stores/settingsStore';
import { MeasurementForm, MEASUREMENT_KEYS as KEYS } from '@/components/MeasurementForm';
import { EntityNotes } from '@/components/EntityNotes';
import { ListGroup, Section } from '@/components/ui/ListRow';
import { formatDate, formatNumber } from '@/lib/format';

/*
 * PROGRESS › BODY › MEASUREMENTS (B2.5). The entry form for the day the
 * switcher shows (today unless it says otherwise, CL-04), a two-date
 * comparison, and the history. The shell header carries Back + title.
 */
export function Measurements() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
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

  const dateSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="input min-h-ui-hit flex-1 py-1 text-[14px]">
      {dates.map((d) => (
        <option key={d} value={d}>
          {formatDate(d, lang, 'medium')}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-7" data-testid="client-measurements">
      <div>
        <DaySwitcher />
        {/* Entry form for the selected day */}
        <MeasurementForm
          date={selected}
          existing={existing}
          onSave={(d, v, clear) => save(d, v, clear)}
          extras={(k) => <EntityNotes screen="measurements" date={selected} entityType="measurement" entityId={k} />}
        />
      </div>

      {/* Comparison */}
      {dates.length >= 2 && (
        <Section title={t('measure.compare')} testId="measure-compare">
          <div className="mb-3 flex gap-2">
            {dateSelect(dateA, setDateA, t('progress.compareFrom'))}
            {dateSelect(dateB, setDateB, t('progress.compareTo'))}
          </div>
          <ListGroup>
            <div className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] gap-x-2 px-4 py-2 text-[12px] font-medium text-earth-muted">
              <span>{t('measure.part')}</span>
              <span className="text-end">{formatDate(dateA, lang, 'short')}</span>
              <span className="text-end">{formatDate(dateB, lang, 'short')}</span>
              <span className="text-end">±</span>
            </div>
            {KEYS.map((k) => {
              const va = a?.values[k];
              const vb = b?.values[k];
              if (va == null && vb == null) return null;
              const delta = va != null && vb != null ? Math.round((vb - va) * 10) / 10 : null;
              return (
                <div key={k} className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] items-center gap-x-2 px-4 py-2.5 text-[14px]">
                  <span className="truncate">{labelOf(k)}</span>
                  <span className="text-end tabular-nums text-earth-muted">{va != null ? formatNumber(va, lang) : '–'}</span>
                  <span className="text-end tabular-nums">{vb != null ? formatNumber(vb, lang) : '–'}</span>
                  <span className="text-end font-semibold tabular-nums text-earth-muted">
                    <span dir="ltr">{delta == null || delta === 0 ? '–' : `${delta > 0 ? '+' : '−'}${formatNumber(Math.abs(delta), lang)}`}</span>
                  </span>
                </div>
              );
            })}
          </ListGroup>
        </Section>
      )}

      {/* History */}
      {logs.length > 0 ? (
        <Section title={t('cardio.history')} testId="measure-history">
          <ListGroup>
            {logs
              .slice()
              .reverse()
              .map((l) => (
                <div key={l.id} className="px-4 py-3">
                  <p className="text-[15px] font-semibold">{formatDate(l.date, lang, 'weekdayShort')}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-earth-muted">
                    {Object.keys(l.values)
                      .map((k) => `${labelOf(k)} ${formatNumber(l.values[k], lang)}`)
                      .join(' · ') || '—'}
                  </p>
                </div>
              ))}
          </ListGroup>
        </Section>
      ) : (
        <p className="text-[14px] text-earth-muted">{t('measure.empty')}</p>
      )}
    </div>
  );
}
