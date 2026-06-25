import { Icon } from '@/components/Icon';

/**
 * Small theme-styled checkbox for selectable list/table rows. Stops click
 * propagation so toggling selection never triggers the row's own click (open /
 * navigate). `indeterminate` renders the "some selected" dash for select-all.
 */
export function RowCheckbox({
  checked,
  indeterminate = false,
  onToggle,
  label,
  testId,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  label: string;
  testId?: string;
}) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      data-testid={testId}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
        on ? 'border-brand bg-brand text-white' : 'border-line text-transparent hover:border-earth-muted'
      }`}
    >
      <Icon name={indeterminate ? 'minus' : 'check'} size={13} />
    </button>
  );
}
