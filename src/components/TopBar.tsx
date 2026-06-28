import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

interface TopBarProps {
  title: string;
  eyebrow?: string;
  sub?: string;
  right?: ReactNode;
  onBack?: () => void;
  /** Make the title tappable (e.g. open the client's profile from a thread). */
  onTitleClick?: () => void;
  /** Pin the header to the top while the content below scrolls. */
  sticky?: boolean;
  /** Compact header (smaller title + tighter padding) — e.g. a chat thread, so
   *  the name tucks right under the top nav instead of a tall H1 block. */
  dense?: boolean;
  /** Optional leading avatar (photo/initials) — e.g. the peer in a chat thread. */
  avatar?: { name: string; photoUrl?: string };
  /** Stable hook for the QA suite to detect which screen is mounted. */
  testId?: string;
}

/** Screen header: optional back chevron + copper eyebrow + H1, optional right slot. */
export function TopBar({ title, eyebrow, sub, right, onBack, onTitleClick, sticky, dense, avatar, testId }: TopBarProps) {
  const { i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  // `.h1`/`.h2` use a very tight line-height; with `truncate` (overflow-hidden)
  // that clips glyph tops/bottoms — worse in RTL (deep descenders). Give the
  // truncated title a taller line-box so nothing is cut.
  const titleClass = `${dense ? 'h2' : 'h1'} truncate ${rtl ? 'leading-[1.45]' : 'leading-[1.3]'}`;
  const pad = dense ? 'py-2' : 'pb-5 pt-3.5';
  return (
    <div
      className={`flex ${dense ? 'items-center' : 'items-end'} justify-between ${pad} ${sticky ? 'sticky z-20 -mx-5 bg-surface/95 px-5 backdrop-blur-md' : ''}`}
      // Stick BELOW the sticky BrandBar (logo h-9 = 2.25rem + its top padding),
      // otherwise both pin to top-0 and the BrandBar clips this title.
      style={sticky ? { top: 'calc(2.25rem + max(0.75rem, env(safe-area-inset-top, 0px)))' } : undefined}
      data-testid={testId}
    >
      <div className="flex min-w-0 items-center gap-3">
        {onBack && (
          <button type="button" onClick={onBack} className={`icon-btn ${dense ? 'h-9 w-9' : 'h-[42px] w-[42px]'}`} aria-label="Back">
            <Icon name="chevronLeft" size={20} className={rtl ? 'rotate-180' : ''} />
          </button>
        )}
        {avatar && <Avatar name={avatar.name} photoUrl={avatar.photoUrl} size="sm" rounded="rounded-full" className="shrink-0" />}
        <div className="min-w-0">
          {eyebrow && !dense && <div className="eyebrow mb-1.5">{eyebrow}</div>}
          {onTitleClick ? (
            <button type="button" onClick={onTitleClick} data-testid="topbar-title" className="flex min-w-0 items-center gap-1.5 text-start">
              <h1 className={titleClass}>{title}</h1>
              <Icon name="chevron" size={18} className={`shrink-0 text-earth-subtle ${rtl ? 'rotate-180' : ''}`} />
            </button>
          ) : (
            <h1 className={titleClass}>{title}</h1>
          )}
          {sub && <div className="mt-1 text-[13px] text-earth-muted">{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}
