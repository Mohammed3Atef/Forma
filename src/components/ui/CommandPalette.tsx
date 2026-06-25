import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/Icon';

export interface CommandItem {
  id: string;
  label: string;
  icon?: IconName;
  group?: string;
  /** Extra terms to match on (not shown). */
  keywords?: string;
  hint?: string;
  /** Show even when the query is empty (commands). Entities only show on search. */
  always?: boolean;
  run: () => void;
}

/**
 * Command palette / quick switcher (⌘K). Filterable, grouped, fully
 * keyboard-driven (↑/↓ to move, Enter to run, Esc to close). Reusable for both
 * commands and search results (Phase D.5 / F wire the items + global hotkey).
 */
export function CommandPalette({
  open,
  onClose,
  items,
  placeholder,
}: {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 10);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items.filter((it) => it.always);
    return items.filter((it) => `${it.label} ${it.group ?? ''} ${it.keywords ?? ''}`.toLowerCase().includes(s)).slice(0, 50);
  }, [q, items]);

  useEffect(() => {
    if (idx > filtered.length - 1) setIdx(0);
  }, [filtered.length, idx]);

  if (!open) return null;

  const run = (it: CommandItem) => {
    onClose();
    it.run();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = filtered[idx];
      if (it) run(it);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup: string | undefined;
  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={t('search.commands')}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm anim-fade" onClick={onClose} />
      <div className="absolute inset-x-0 top-[12vh] mx-auto w-[92%] max-w-xl anim-rise">
        <div className="card-elevated overflow-hidden p-0">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <Icon name="search" size={18} className="shrink-0 text-earth-muted" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder ?? t('search.placeholder')}
              data-testid="command-input"
              className="no-focus-ring w-full bg-transparent text-base text-earth outline-none placeholder:text-earth-subtle"
            />
            <kbd className="hidden rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-earth-subtle sm:inline">esc</kbd>
          </div>
          <ul role="listbox" className="max-h-[55vh] overflow-y-auto py-2">
            {filtered.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-earth-muted">{t('search.noResults')}</li>
            ) : (
              filtered.map((it, i) => {
                const header = it.group && it.group !== lastGroup ? it.group : null;
                lastGroup = it.group;
                const active = i === idx;
                return (
                  <li key={it.id}>
                    {header ? (
                      <div className="px-4 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-earth-subtle">{header}</div>
                    ) : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setIdx(i)}
                      onClick={() => run(it)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm transition-colors ${active ? 'bg-surface-hover text-earth' : 'text-earth-muted'}`}
                    >
                      {it.icon ? <Icon name={it.icon} size={17} className="shrink-0 text-brand" /> : null}
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                      {it.hint ? <span className="shrink-0 text-[11px] text-earth-subtle">{it.hint}</span> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
