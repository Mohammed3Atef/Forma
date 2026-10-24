import { useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { Icon, type IconName } from '@/components/Icon';
import { IconButton } from './Button';
import { rovingIndex } from '@/lib/rovingKeys';

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: IconName;
  onSelect: () => void;
  /** Destructive items render last, separated, in the danger tone. */
  danger?: boolean;
  disabled?: boolean;
  testId?: string;
}

/**
 * ActionMenu (B2, doc 17 D7 / VS-08): secondary and destructive actions live
 * here — never as a red icon on every row in read mode. A labelled trigger
 * (`aria-haspopup`, `aria-expanded`) opens a sheet of menu items; destructive
 * items come last, after a divider. The Sheet already traps focus, closes on
 * Esc and returns focus to the trigger.
 */
export function ActionMenu({
  label,
  items,
  title,
  icon = 'dots',
  size = 'md',
  testId,
  triggerClassName = '',
}: {
  /** Accessible name of the trigger (e.g. "Options for Bench press"). */
  label: string;
  items: ActionMenuItem[];
  /** Sheet title; defaults to the trigger label. */
  title?: string;
  icon?: IconName;
  size?: 'sm' | 'md';
  testId?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const regular = items.filter((i) => !i.danger);
  const danger = items.filter((i) => i.danger);
  const row = (it: ActionMenuItem) => (
    <li key={it.key} role="none">
      <button
        type="button"
        role="menuitem"
        disabled={it.disabled}
        data-testid={it.testId}
        onClick={() => {
          setOpen(false);
          it.onSelect();
        }}
        // B3.9 (AX-05): Up / Down / Home / End move between the enabled items.
        onKeyDown={(e) => {
          const menu = e.currentTarget.closest('[role="menu"]');
          const enabled = menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')) : [];
          const next = rovingIndex(e, enabled.indexOf(e.currentTarget), enabled.length, 'vertical');
          if (next < 0) return;
          e.preventDefault();
          enabled[next]?.focus();
        }}
        className={`flex min-h-ui-hit w-full items-center gap-3 rounded-ui-control px-3 text-start text-[15px] font-medium transition-colors hover:bg-white/[0.05] disabled:opacity-40 ${
          it.danger ? 'text-danger' : 'text-earth'
        }`}
      >
        {it.icon ? <Icon name={it.icon} size={20} className={it.danger ? '' : 'text-earth-muted'} /> : null}
        <span className="min-w-0 flex-1">{it.label}</span>
      </button>
    </li>
  );
  return (
    <>
      <IconButton
        icon={icon}
        label={label}
        size={size}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testId}
        onClick={() => setOpen(true)}
        className={`border-transparent ${triggerClassName}`}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title={title ?? label}>
        <ul role="menu" aria-label={title ?? label} className="space-y-0.5">
          {regular.map(row)}
          {danger.length > 0 && regular.length > 0 && <li role="separator" className="my-2 h-px bg-white/[0.08]" />}
          {danger.map(row)}
        </ul>
      </Sheet>
    </>
  );
}
