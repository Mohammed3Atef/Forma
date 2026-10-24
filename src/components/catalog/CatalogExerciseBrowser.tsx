import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { SearchField, SelectField } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/ErrorState';
import { OfflineState, useQueryScreen } from '@/components/ui/ScreenState';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTaxonomyLabel } from '@/hooks/useCatalog';
import { searchCatalogExercises, type CatalogExerciseCard, type CatalogTaxonomy } from '@/services/platform/catalogApi';

const PAGE = 30;

/**
 * B4 — browse / search the curated Forma exercise catalog (server-side search: English, Arabic,
 * Egyptian gym words, typos). Filters by muscle and equipment; "With video" shows only playable
 * demonstrations. Rows show the demo honestly (thumbnail, video, or none). Selection is optional
 * (the plan picker uses it; the Library browses). Offline says so — never "no results".
 */
export function CatalogExerciseBrowser({
  taxonomy,
  selected,
  onToggle,
  onOpen,
  testId = 'catalog-exercises',
}: {
  taxonomy: CatalogTaxonomy;
  selected?: ReadonlySet<string>;
  onToggle?: (card: CatalogExerciseCard) => void;
  onOpen: (card: CatalogExerciseCard) => void;
  testId?: string;
}) {
  const { t, i18n } = useTranslation();
  const label = useTaxonomyLabel();
  const ar = i18n.language.startsWith('ar');
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState('');
  const [video, setVideo] = useState(false);
  const dq = useDebouncedValue(q.trim(), 250);
  const input = { q: dq, limit: PAGE, ...(muscle ? { muscle } : {}), ...(equipment ? { equipment } : {}), ...(video ? { video: true } : {}) } as Parameters<typeof searchCatalogExercises>[0];
  const res = useQuery({ queryKey: ['catalog', 'exercises', input], queryFn: () => searchCatalogExercises(input), placeholderData: keepPreviousData, staleTime: 10 * 60_000 });
  const screen = useQueryScreen(res, (d) => d.items.length === 0);
  // A new search typed offline must not show the previous search's results as if they were its own.
  const status = res.isPlaceholderData && res.fetchStatus === 'paused' ? 'offline' : screen.status;
  const opts = (table: 'muscles' | 'equipment') =>
    Object.keys(taxonomy[table])
      .map((id) => ({ id, text: label(taxonomy, table, id) }))
      .sort((a, b) => a.text.localeCompare(b.text, ar ? 'ar' : 'en'));

  return (
    <div className="space-y-3" data-testid={testId}>
      <SearchField aria-label={t('catalog.searchExercises')} placeholder={t('catalog.searchExercises')} value={q} onChange={(e) => setQ(e.target.value)} data-testid={`${testId}-search`} />
      <div className="grid grid-cols-2 gap-2">
        <SelectField label={t('field.muscle')} value={muscle} onChange={(e) => setMuscle(e.target.value)} data-testid={`${testId}-muscle`}>
          <option value="">{t('coachEditor.anyMuscle')}</option>
          {opts('muscles').map((o) => (
            <option key={o.id} value={o.id}>
              {o.text}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('field.equipment')} value={equipment} onChange={(e) => setEquipment(e.target.value)} data-testid={`${testId}-equipment`}>
          <option value="">{t('coachEditor.anyEquipment')}</option>
          {opts('equipment').map((o) => (
            <option key={o.id} value={o.id}>
              {o.text}
            </option>
          ))}
        </SelectField>
      </div>
      <label className="flex min-h-ui-hit items-center gap-2 text-[13px]">
        <input type="checkbox" checked={video} onChange={(e) => setVideo(e.target.checked)} data-testid={`${testId}-video`} />
        {t('catalog.withVideo')}
      </label>

      {status === 'loading' ? (
        <p className="py-6 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : status === 'offline' ? (
        <OfflineState message={t('catalog.offline')} onRetry={screen.retry} testId={`${testId}-offline`} />
      ) : status === 'error' ? (
        <ErrorState message={t('catalog.loadFailed')} onRetry={screen.retry} testId={`${testId}-error`} />
      ) : status === 'empty' ? (
        <p className="py-4 text-center text-sm text-earth-muted" data-testid={`${testId}-empty`}>
          {t('coachLib.noResults')}
        </p>
      ) : (
        <>
          <div className="card divide-y divide-line-soft" aria-busy={res.isFetching}>
            {res.data!.items.map((c) => (
              <CatalogExerciseRow key={c.id} card={c} taxonomy={taxonomy} selected={selected?.has(c.id) ?? false} selectable={!!onToggle} onToggle={() => onToggle?.(c)} onOpen={() => onOpen(c)} />
            ))}
          </div>
          {res.data!.total > res.data!.items.length && (
            <p className="text-center text-[12px] text-earth-subtle" data-testid={`${testId}-more`}>
              {t('coachEditor.pickerTruncated', { shown: res.data!.items.length, total: res.data!.total })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function CatalogExerciseRow({ card, taxonomy, selected, selectable, onToggle, onOpen }: { card: CatalogExerciseCard; taxonomy: CatalogTaxonomy; selected: boolean; selectable: boolean; onToggle: () => void; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  const label = useTaxonomyLabel();
  const ar = i18n.language.startsWith('ar');
  const name = ar ? card.name.ar : card.name.en;
  const meta = [label(taxonomy, 'muscles', card.primaryMuscles[0]), card.equipment.map((q) => label(taxonomy, 'equipment', q)).join(ar ? '، ' : ', ')].filter(Boolean).join(' · ');
  const main = (
    <>
      {/* Line drawings sit on white (their own background); "no demonstration" stays on the sheet's surface. */}
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line-soft ${card.thumb ? 'bg-white' : 'bg-surface-raised'}`}>
        {card.thumb ? <img src={card.thumb.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" /> : <Icon name="dumbbell" size={20} className="text-earth-subtle" />}
      </span>
      <span className="min-w-0 flex-1">
        {/* Two lines: variants share long prefixes ("Barbell bench press" / "… close grip"). */}
        <span className="line-clamp-2 font-medium leading-snug">
          <bdi>{name}</bdi>
        </span>
        <span className="block truncate text-[12px] text-earth-subtle">
          <bdi>{meta}</bdi>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-earth-subtle" data-testid={`catalog-media-${card.media}`} title={t(card.media === 'video' ? 'library.demo.video' : card.media === 'image' ? 'library.demo.image' : 'library.demo.none')}>
        {card.media !== 'none' && <Icon name={card.media === 'video' ? 'video' : 'image'} size={16} />}
        {/* B4.1: several approved demonstrations — say how many. */}
        {card.videoCount > 1 && (
          <span className="text-[11px] font-medium tabular-nums" aria-hidden="true">
            {card.videoCount}
          </span>
        )}
        <span className="sr-only">{card.videoCount > 1 ? t('catalog.videoCount', { n: card.videoCount }) : t(card.media === 'video' ? 'library.demo.video' : card.media === 'image' ? 'library.demo.image' : 'library.demo.none')}</span>
      </span>
    </>
  );
  return (
    <div className={`flex items-center gap-1 ${selected ? 'bg-brand/10' : ''}`} data-testid="catalog-exercise-row" data-id={card.id}>
      <button type="button" className="row min-h-ui-hit min-w-0 flex-1 text-start" aria-pressed={selectable ? selected : undefined} onClick={selectable ? onToggle : onOpen}>
        {main}
        {selectable && <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-brand bg-brand text-brand-ink' : 'border-line'}`}>{selected && <Icon name="check" size={14} />}</span>}
      </button>
      {selectable && (
        <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-earth-muted hover:text-earth" onClick={onOpen} aria-label={t('catalog.previewNamed', { name })} data-testid="catalog-exercise-preview">
          <Icon name="info" size={18} />
        </button>
      )}
    </div>
  );
}
