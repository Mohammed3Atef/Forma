import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import type { TextLang } from '@/lib/localizedText';

/**
 * The OTHER language of a bilingual value, kept light (B1.8 / EX-06, FD-01):
 * collapsed behind one quiet toggle, opened automatically when the primary
 * text changed while a distinct translation exists (so a stale translation is
 * visible, never silently kept or silently overwritten).
 *
 * Accessibility: the toggle is a real button with `aria-expanded`; the field
 * has a programmatic label and `lang`/`dir` for its language.
 */
export function SecondLanguageField({
  lang,
  value,
  onChange,
  multiline = false,
  stale = false,
  testId,
}: {
  /** The language of THIS field (the other one is the form's main field). */
  lang: TextLang;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  /** The main text changed while this translation was kept — show it and say so. */
  stale?: boolean;
  testId?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(!!value && stale);
  useEffect(() => {
    if (stale) setOpen(true);
  }, [stale]);
  const label = lang === 'ar' ? t('i18nField.arabicVersion') : t('i18nField.englishVersion');
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <button type="button" className="inline-flex min-h-ui-hit items-center gap-1.5 t-label text-ui-secondary hover:text-ui-primary" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Icon name="globe" size={14} />
        {label}
        <Icon name="chevronDown" size={14} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div id={id} className="space-y-1">
          <label className="sr-only" htmlFor={`${id}-input`}>
            {label}
          </label>
          {multiline ? (
            <textarea id={`${id}-input`} className="input min-h-20" lang={lang} dir={dir} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId ? `${testId}-input` : undefined} />
          ) : (
            <input id={`${id}-input`} className="input" lang={lang} dir={dir} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId ? `${testId}-input` : undefined} />
          )}
          {stale && <p className="t-caption text-ui-warning">{t('i18nField.mayNeedUpdate')}</p>}
        </div>
      )}
    </div>
  );
}
