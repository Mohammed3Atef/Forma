import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/stores/settingsStore';
import type { Locale } from '@/types';
import { Icon } from './Icon';

const LANGS: { code: Locale; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'ar', label: 'العربية', short: 'ع' },
  { code: 'ar-eg', label: 'مصري', short: 'مصري' },
];

/**
 * Compact language switcher: a globe button showing the current language that
 * opens a small menu of the three locales. Used where there's no full nav menu
 * (e.g. the onboarding wizard) so the user can switch language at any time.
 */
export function LanguageToggle({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const setLocale = useSettings((s) => s.setLocale);
  const [open, setOpen] = useState(false);
  const current = LANGS.find((l) => l.code === i18n.language) ?? LANGS[0];

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        data-testid="lang-toggle"
        aria-label={t('settings.language')}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface-card px-3 text-earth-muted transition-colors hover:text-earth"
      >
        <Icon name="globe" size={18} />
        <span className="font-mono text-[11px] uppercase tracking-[0.04em]">{current.short}</span>
      </button>
      {open && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-50 mt-1 min-w-32 overflow-hidden rounded-xl border border-line bg-surface-raised shadow-elevated" data-testid="lang-menu">
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                data-testid={`lang-${l.code}`}
                onClick={() => { void setLocale(l.code); setOpen(false); }}
                className={`block w-full px-3 py-2 text-start text-sm ${l.code === i18n.language ? 'bg-brand/15 text-brand' : 'text-earth hover:bg-white/5'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
