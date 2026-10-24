import { useTranslation } from 'react-i18next';
import type { CatalogInstructionSet, MediaCredit } from '@/types';

/**
 * B4 — an exercise's structured instructions (Forma catalog), in the reader's language: setup,
 * the numbered steps, coaching cues, common mistakes and safety. EX-11: readable sections, not
 * one block of text. Egyptian Arabic readers get the Arabic text.
 */
export function ExerciseInstructions({ instructions, className = '' }: { instructions: { en: CatalogInstructionSet; ar: CatalogInstructionSet }; className?: string }) {
  const { t, i18n } = useTranslation();
  const set = i18n.language.startsWith('ar') ? instructions.ar : instructions.en;
  const sections: { key: keyof CatalogInstructionSet; title: string; ordered?: boolean; tone?: string }[] = [
    { key: 'setup', title: t('catalog.instructions.setup') },
    { key: 'steps', title: t('catalog.instructions.steps'), ordered: true },
    { key: 'cues', title: t('catalog.instructions.cues') },
    { key: 'mistakes', title: t('catalog.instructions.mistakes') },
    { key: 'safety', title: t('catalog.instructions.safety'), tone: 'text-warn' },
  ];
  return (
    <div className={`space-y-4 ${className}`} data-testid="exercise-instructions">
      {sections.map(({ key, title, ordered, tone }) => {
        const lines = set[key];
        if (!lines?.length) return null;
        const List = ordered ? 'ol' : 'ul';
        return (
          <section key={key} aria-label={title}>
            <h3 className={`label mb-1.5 ${tone ?? ''}`}>{title}</h3>
            <List className={`space-y-1.5 ps-5 text-[14.5px] leading-relaxed text-earth ${ordered ? 'list-decimal' : 'list-disc'}`}>
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
  return (
    <ul className={`space-y-0.5 text-[12px] leading-relaxed text-earth-subtle ${className}`} data-testid="media-credits" aria-label={t('catalog.credits')}>
      {credits.map((c) => (
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
