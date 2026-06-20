import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

interface TopBarProps {
  title: string;
  eyebrow?: string;
  sub?: string;
  right?: ReactNode;
  onBack?: () => void;
  /** Pin the header to the top while the content below scrolls. */
  sticky?: boolean;
  /** Stable hook for the QA suite to detect which screen is mounted. */
  testId?: string;
}

/** Screen header: optional back chevron + copper eyebrow + H1, optional right slot. */
export function TopBar({ title, eyebrow, sub, right, onBack, sticky, testId }: TopBarProps) {
  const { i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  return (
    <div
      className={`flex items-end justify-between pb-5 pt-3.5 ${sticky ? 'sticky z-20 -mx-5 bg-surface/95 px-5 backdrop-blur-md' : ''}`}
      // Stick BELOW the sticky BrandBar (logo h-9 = 2.25rem + its top padding),
      // otherwise both pin to top-0 and the BrandBar clips this title.
      style={sticky ? { top: 'calc(2.25rem + max(0.75rem, env(safe-area-inset-top, 0px)))' } : undefined}
      data-testid={testId}
    >
      <div className="flex min-w-0 items-center gap-3">
        {onBack && (
          <button type="button" onClick={onBack} className="icon-btn h-[42px] w-[42px]" aria-label="Back">
            <Icon name="chevronLeft" size={20} className={rtl ? 'rotate-180' : ''} />
          </button>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
          {/* `.h1` uses a very tight line-height; with `truncate` (overflow-hidden)
              that clips the glyph tops/bottoms — worse in RTL (deep descenders).
              Give the truncated title a taller line-box so nothing is cut. */}
          <h1 className={`h1 truncate ${rtl ? 'leading-[1.45]' : 'leading-[1.3]'}`}>{title}</h1>
          {sub && <div className="mt-1 text-[13px] text-earth-muted">{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}
