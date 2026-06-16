import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

interface TopBarProps {
  title: string;
  eyebrow?: string;
  sub?: string;
  right?: ReactNode;
  onBack?: () => void;
  /** Stable hook for the QA suite to detect which screen is mounted. */
  testId?: string;
}

/** Screen header: optional back chevron + copper eyebrow + H1, optional right slot. */
export function TopBar({ title, eyebrow, sub, right, onBack, testId }: TopBarProps) {
  const { i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  return (
    <div className="flex items-end justify-between pb-5 pt-3.5" data-testid={testId}>
      <div className="flex min-w-0 items-center gap-3">
        {onBack && (
          <button type="button" onClick={onBack} className="icon-btn h-[42px] w-[42px]" aria-label="Back">
            <Icon name="chevronLeft" size={20} className={rtl ? 'rotate-180' : ''} />
          </button>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
          <h1 className="h1 truncate">{title}</h1>
          {sub && <div className="mt-1 text-[13px] text-earth-muted">{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}
