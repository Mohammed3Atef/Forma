import { useTranslation } from 'react-i18next';
import type { CatalogInstructionSet, MediaCredit } from '@/types';

/**
 * B4 — an exercise's structured instructions (Forma catalog), in the reader's language: setup,
 * the numbered steps, coaching cues, common mistakes and safety. EX-11: readable sections, not
 * one block of text. Egyptian Arabic readers get the Arabic text.
 *
 * B4.2: an exercise with English steps only (ExerciseDB) shows them to an Arabic reader, labelled
 * "in English" and laid out left-to-right — never an empty section, never a machine translation.
 */
export function ExerciseInstructions({ instructions, className = '' }: { instructions: { en: CatalogInstructionSet; ar: CatalogInstructionSet | null }; className?: string }) {
  const { t, i18n } = useTranslation();
  const wantsAr = i18n.language.startsWith('ar');
  const englishOnly = wantsAr && !instructions.ar;
  const set = wantsAr ? (instructions.ar ?? instructions.en) : instructions.en;
  const sections: { key: keyof CatalogInstructionSet; title: string; ordered?: boolean; tone?: string }[] = [
    { key: 'setup', title: t('catalog.instructions.setup') },
    { key: 'steps', title: t('catalog.instructions.steps'), ordered: true },
    { key: 'cues', title: t('catalog.instructions.cues') },
    { key: 'mistakes', title: t('catalog.instructions.mistakes') },
    { key: 'safety', title: t('catalog.instructions.safety'), tone: 'text-warn' },
  ];
  return (
    <div className={`space-y-4 ${className}`} data-testid="exercise-instructions" data-lang={englishOnly ? 'en' : undefined}>
      {englishOnly && (
        <p className="text-[12.5px] text-earth-subtle" data-testid="instructions-english-only">
          {t('catalog.instructions.englishOnly')}
        </p>
      )}
      {sections.map(({ key, title, ordered, tone }) => {
        const lines = set[key];
        if (!lines?.length) return null;
        const List = ordered ? 'ol' : 'ul';
        return (
          <section key={key} aria-label={title}>
            <h3 className={`label mb-1.5 ${tone ?? ''}`}>{title}</h3>
            <List dir={englishOnly ? 'ltr' : undefined} lang={englishOnly ? 'en' : undefined} className={`space-y-1.5 ps-5 text-[14.5px] leading-relaxed text-earth ${ordered ? 'list-decimal' : 'list-disc'}`}>
              {lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </List>
          </section>
        );
      })}
    </div>
  );
}

const LICENSE_TEXT: Record<string, string> = { 'CC-BY-SA-3.0': 'CC BY-SA 3.0', 'CC-BY-SA-4.0': 'CC BY-SA 4.0', 'CC0-1.0': 'CC0' };
/** B4.2: ExerciseDB demonstrations carry one credit line (the provider requires attribution to AscendAPI). */
const EDB_LICENSE = 'EXERCISEDB';
const LICENSE_URL: Record<string, string> = {
  'CC-BY-SA-3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  'CC-BY-SA-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/**
 * B4 / EX-19 — the credit a CC BY-SA demonstration must carry wherever it is shown: what it is,
 * the author, the licence (linked) and the source page (linked).
 */
export function MediaCredits({ credits, className = '' }: { credits: MediaCredit[] | undefined; className?: string }) {
  const { t } = useTranslation();
  if (!credits?.length) return null;
  const edb = credits.find((c) => c.license === EDB_LICENSE);
  const others = credits.filter((c) => c.license !== EDB_LICENSE);
  return (
    <ul className={`space-y-0.5 text-[12px] leading-relaxed text-earth-subtle ${className}`} data-testid="media-credits" aria-label={t('catalog.credits')}>
      {edb && (
        <li data-testid="credit-exercisedb">
          {t('catalog.creditEdb')} ·{' '}
          <a href={edb.sourcePage || 'https://ascendapi.com'} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
            ascendapi.com
          </a>
        </li>
      )}
      {others.map((c) => (
        <li key={c.url}>
          {t(c.kind === 'video' ? 'catalog.creditVideo' : 'catalog.creditImage')}: <bdi>{c.author}</bdi> ·{' '}
          {LICENSE_URL[c.license] ? (
            <a href={LICENSE_URL[c.license]} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
              {LICENSE_TEXT[c.license] ?? c.license}
            </a>
          ) : (
            (LICENSE_TEXT[c.license] ?? c.license)
          )}
          {c.sourcePage && (
            <>
              {' · '}
              <a href={c.sourcePage} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                {hostOf(c.sourcePage)}
              </a>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
