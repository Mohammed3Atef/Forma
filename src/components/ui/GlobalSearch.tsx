import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/**
 * Top-bar search trigger styled like a search field with a ⌘K / Ctrl+K hint.
 * Opens the CommandPalette in search mode (wired in Phase D.5/F).
 */
export function GlobalSearch({ onOpen, className = '' }: { onOpen: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('search.open')}
      data-testid="global-search"
      className={`inline-flex items-center gap-2 rounded-full border border-line bg-surface-card px-3.5 py-2 text-sm text-earth-muted transition-colors hover:bg-surface-hover ${className}`}
    >
      <Icon name="search" size={16} className="shrink-0" />
      <span className="hidden sm:inline">{t('search.placeholder')}</span>
      <kbd className="ms-1 hidden rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-earth-subtle sm:inline-flex">
        {isMac ? '⌘' : 'Ctrl'} K
      </kbd>
    </button>
  );
}
