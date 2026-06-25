import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/Icon";

type Tone = "default" | "brand" | "warn" | "danger" | "success" | "system";

const TONE_ICON: Record<Tone, string> = {
  default: "border-line bg-surface-raised text-earth-muted",
  brand: "border-brand/30 bg-brand/10 text-brand",
  warn: "border-warn/30 bg-warn/10 text-warn",
  danger: "border-danger/30 bg-danger/10 text-danger",
  success: "border-success-light/30 bg-success-light/10 text-success-light",
  system: "border-system/30 bg-system-soft text-system",
};

/**
 * Premium KPI tile: icon chip + big value + label, optional hint/delta. Lifts on
 * hover when clickable. The successor to DashboardCard for the new dashboards.
 */
export function MetricCard({
  icon,
  value,
  label,
  hint,
  delta,
  tone = "default",
  onClick,
  testId,
}: {
  icon: IconName;
  value: ReactNode;
  label: string;
  hint?: string;
  delta?: { value: string; dir: "up" | "down" | "flat" };
  tone?: Tone;
  onClick?: () => void;
  testId?: string;
}) {
  const deltaColor =
    delta?.dir === "up"
      ? "text-success-light"
      : delta?.dir === "down"
        ? "text-danger"
        : "text-earth-muted";
  const cls = `card block w-full text-start flex flex-col justify-between ${onClick ? "card-hover cursor-pointer" : ""}`;
  const body = (
    <>
      <div className="mb-3 flex items-center justify-between">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl border ${TONE_ICON[tone]}`}
        >
          <Icon name={icon} size={18} />
        </span>
        {delta ? (
          <span
            className={`inline-flex items-center gap-1 font-mono text-[11px] ${deltaColor}`}
          >
            {delta.dir !== "flat" ? (
              <Icon
                name="arrowUp"
                size={12}
                className={delta.dir === "down" ? "rotate-180" : ""}
              />
            ) : null}
            {delta.value}
          </span>
        ) : null}
      </div>
      <div className="font-mono text-[30px] font-medium leading-[0.95] tracking-[-0.03em] text-earth">
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-earth-muted">
        {label}
      </div>
      {hint ? (
        <div className="mt-1 text-[12px] text-earth-subtle">{hint}</div>
      ) : null}
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cls}
    >
      {body}
    </button>
  ) : (
    <div data-testid={testId} className={cls}>
      {body}
    </div>
  );
}
