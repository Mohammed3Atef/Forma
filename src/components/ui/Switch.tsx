/**
 * Toggle switch matching the design system exactly — a pill track (neutral
 * when off, brand gradient when on) with a sliding thumb. Used for boolean
 * settings rows (notifications, vibration, keep-awake, feature flags…).
 */
export function Switch({
  on,
  onChange,
  label,
  testId,
}: {
  on: boolean;
  onChange: () => void;
  label?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      data-testid={testId}
      onClick={onChange}
      // B3.9 (AX-01): a 42 × 25 track with a centred 44 × 44 tap area (`hit-44` keeps it relative).
      className={`hit-44 relative h-[25px] w-[42px] shrink-0 rounded-full border transition-colors ${
        on ? 'border-transparent bg-gradient-brand' : 'border-line bg-surface-strong'
      }`}
    >
      <span
        className={`absolute top-[3px] h-[17px] w-[17px] rounded-full transition-all ${on ? 'bg-white start-[21px]' : 'bg-earth-muted start-[3px]'}`}
      />
    </button>
  );
}
