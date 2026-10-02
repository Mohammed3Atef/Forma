import { Switch } from '@/components/ui/Switch';

/** Labelled boolean row (the bare Switch has no visible label). */
export function ToggleRow({ label, on, onChange, testId, hint }: { label: string; on: boolean; onChange: (v: boolean) => void; testId?: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="min-w-0">
        <span className="label block">{label}</span>
        {hint ? <span className="block text-[12px] text-earth-subtle">{hint}</span> : null}
      </span>
      <Switch on={on} onChange={() => onChange(!on)} label={label} testId={testId} />
    </div>
  );
}
