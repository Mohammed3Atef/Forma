import type { CSSProperties, ReactNode } from "react";
import { cx } from "../cx";
import { Icon } from "./Icon";

/*
 * Mock-UI primitives (design site.css "mock primitives"): the product
 * screenshots are drawn, not images. Everything is em-based so a mock scales
 * with its frame — set the frame's font-size (design .mk) and the rest follows.
 * Sample data inside mocks is English in both languages, as in the design.
 */

type P = { className?: string; style?: CSSProperties; children?: ReactNode };

/** Mock text scale root (design .mk) — pass the frame-specific font-size via className/style. */
export const mkClass = "leading-[1.4] text-earth";

export const MCard = ({
  className,
  style,
  children,
  dir,
}: P & { dir?: "ltr" }) => (
  <div
    dir={dir}
    className={cx(
      "rounded-[1em] border border-site-line bg-surface-card p-[1em]",
      dir === "ltr" && "rtl:font-sans",
      className,
    )}
    style={style}
  >
    {children}
  </div>
);

export const MRow = ({ className, style, children }: P) => (
  <div
    className={cx("flex min-w-0 items-center gap-[.8em]", className)}
    style={style}
  >
    {children}
  </div>
);

/** Secondary line (design .m-s). English sample data keeps its own direction in Arabic. */
export const msClass =
  "overflow-hidden text-ellipsis whitespace-nowrap text-[.82em] text-site-tx3 [unicode-bidi:plaintext]";
export const MS = ({
  className,
  style,
  children,
  grow,
}: P & { grow?: boolean }) => (
  <span
    className={cx(msClass, grow && "min-w-0 flex-1", className)}
    style={style}
  >
    {children}
  </span>
);

export const mnumClass = "font-mono font-medium tracking-[-.02em]";
export const MNum = ({ className, style, children }: P) => (
  <span className={cx(mnumClass, className)} style={style}>
    {children}
  </span>
);

export type Tone = "ok" | "warn" | "bad" | "info" | "brand" | "mute" | "none";
const TONE: Record<Tone, string> = {
  ok: "text-success bg-site-ok-tint",
  warn: "text-warn bg-site-warn-tint",
  bad: "text-danger bg-site-bad-tint",
  info: "text-info bg-site-info-tint",
  brand: "text-brand-hover bg-site-brand-tint",
  mute: "text-site-tx3 bg-site-tint",
  none: "",
};

/**
 * Status pill (design .m-pill + .t-*). Dot by default. Its label keeps its own
 * direction in Arabic so "+1 set" doesn't render as "SET 1+".
 */
export const MPill = ({
  tone,
  dot = true,
  className,
  style,
  children,
}: P & { tone: Tone; dot?: boolean }) => (
  <span
    className={cx(
      "inline-flex items-center gap-[.4em] whitespace-nowrap rounded-full px-[.75em] py-[.3em] font-mono text-[.68em] uppercase tracking-[.05em] rtl:[unicode-bidi:plaintext]",
      dot &&
        "before:h-[.5em] before:w-[.5em] before:rounded-full before:bg-current before:content-['']",
      TONE[tone],
      className,
    )}
    style={style}
  >
    {children}
  </span>
);

/** Initials avatar (design .m-av / .m-av.lg). */
export const MAv = ({
  lg,
  className,
  style,
  children,
}: P & { lg?: boolean }) => (
  <span
    className={cx(
      "grid flex-none place-items-center rounded-full border border-[rgba(255,178,8,.25)] bg-[linear-gradient(150deg,#3a2a1c,#1c140e)] font-mono text-brand-light",
      lg
        ? "h-[3.4em] w-[3.4em] text-[1em]"
        : "h-[2.3em] w-[2.3em] text-[.78em]",
      className,
    )}
    style={style}
  >
    {children}
  </span>
);

/** Voice-note waveform bars (design %%WAVE%%): n bars of a fixed pseudo-random height pattern. */
export function Wave({ n = 22 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <i
          key={i}
          className="flex-1 rounded-[2px] bg-current opacity-[.55]"
          style={{ height: `${30 + ((i * 37) % 70)}%` }}
        />
      ))}
    </>
  );
}

/** Voice note (design .voice): play button + waveform, coloured by `currentColor`. */
export function Voice({
  className,
  style,
  playStyle,
  iconWidth,
  bars = 22,
}: {
  className?: string;
  style?: CSSProperties;
  playStyle?: CSSProperties;
  iconWidth?: string;
  bars?: number;
}) {
  return (
    <div
      className={cx("flex min-w-[15em] items-center gap-[.7em]", className)}
      style={style}
    >
      <span
        className="grid h-[2.2em] w-[2.2em] flex-none place-items-center rounded-full bg-[rgba(26,14,5,.18)]"
        style={playStyle}
      >
        {/* design: .i is 18px square; a width override keeps the 18px height */}
        <Icon
          name="play"
          style={iconWidth ? { width: iconWidth } : undefined}
        />
      </span>
      <span className="flex h-[1.8em] flex-1 items-center gap-[2px]">
        <Wave n={bars} />
      </span>
    </div>
  );
}

/** A <p> inside a mock keeps the browser's default 1em block margins — the design never reset them. */
export const UA_P = "my-[1em]";

/** Title line (design .m-t). */
export const mtClass =
  "overflow-hidden text-ellipsis whitespace-nowrap text-[1em] font-semibold leading-[1.25] [unicode-bidi:plaintext]";
/** Mono label (design .m-l). */
export const mlClass =
  "font-mono text-[.7em] uppercase tracking-[.08em] text-site-tx3 [unicode-bidi:plaintext]";
/** Orange mono eyebrow (design .m-ey). */
export const meyClass =
  "font-mono text-[.72em] uppercase tracking-[.08em] text-brand-hover";
/** Mock heading (design .m-h). */
export const mhClass = "font-bold leading-[1.08] tracking-[-.03em]";
/** Hairline divider (design .m-div). */
export const MDiv = ({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) => <div className={cx("h-px bg-site-line", className)} style={style} />;

/** Icon tile (design .m-ic): colour/background come from the caller. */
export function MIc({
  name,
  className,
  style,
  iconStyle,
}: {
  name: Parameters<typeof Icon>[0]["name"];
  className?: string;
  style?: CSSProperties;
  iconStyle?: CSSProperties;
}) {
  return (
    <span
      className={cx(
        "grid h-[2.4em] w-[2.4em] flex-none place-items-center rounded-[.7em]",
        className,
      )}
      style={style}
    >
      <Icon name={name} size="1.25em" style={iconStyle} />
    </span>
  );
}

/**
 * Progress bar (design .m-bar). `grow` = the design's [data-w] bar that fills
 * when its revealed ancestor (Reveal group `rv`) comes into view.
 */
export function MBar({
  value,
  grow,
  className,
  style,
  fillStyle,
}: {
  value: string;
  grow?: boolean;
  className?: string;
  style?: CSSProperties;
  fillStyle?: CSSProperties;
}) {
  return (
    <div
      className={cx(
        "h-[.42em] overflow-hidden rounded-full bg-[rgba(255,238,228,.08)]",
        className,
      )}
      style={style}
    >
      <i
        className={cx(
          "block h-full origin-left rounded-[inherit] bg-gradient-brand transition-transform duration-[1200ms] ease-card motion-reduce:transition-none rtl:origin-right",
          grow &&
            "scale-x-0 group-data-[in=true]/rv:scale-x-100 motion-reduce:scale-x-100",
        )}
        style={{ width: value, ...fillStyle }}
      />
    </div>
  );
}

/** Mock button (design .m-btn / .m-btn.sec). */
export const MBtn = ({
  sec,
  className,
  style,
  children,
}: P & { sec?: boolean }) => (
  <span
    className={cx(
      "flex h-[2.9em] px-2 flex-shrink-0 items-center justify-center gap-[.5em] self-center rounded-full font-mono text-[.78em] uppercase tracking-[.06em]",
      sec
        ? "border border-site-line2 bg-[rgba(255,238,228,.06)] text-earth"
        : "bg-gradient-brand text-brand-ink",
      className,
    )}
    style={style}
  >
    {children}
  </span>
);

/** Chat bubble (design .m-bub them/me). */
export const MBub = ({
  me,
  className,
  style,
  children,
}: P & { me?: boolean }) => (
  <div
    className={cx(
      "max-w-[82%] rounded-[1.15em] px-[1em] py-[.7em] text-[.92em] leading-[1.45] [unicode-bidi:plaintext]",
      me
        ? "self-end rounded-ee-[.35em] bg-gradient-brand text-brand-ink"
        : "self-start rounded-es-[.35em] bg-surface-hover",
      className,
    )}
    style={style}
  >
    {children}
  </div>
);

/** Highlighted card with the warm halo (design .m-hi). */
export const MHi = ({ className, style, children }: P) => (
  <div
    className={cx(
      "relative overflow-hidden rounded-[1.1em] border border-site-line2 bg-gradient-surface-hi p-[1.1em] after:pointer-events-none after:absolute after:inset-0 after:bg-gradient-halo after:content-['']",
      className,
    )}
    style={style}
  >
    {children}
  </div>
);

/** KPI tile (design .kpi): label, big mono value, optional green delta. */
export function Kpi({
  label,
  value,
  delta,
  valueStyle,
  className,
  style,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  valueStyle?: CSSProperties;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cx(
        "rounded-[.9em] border border-site-line bg-surface-raised px-[.9em] py-[.8em]",
        className,
      )}
      style={style}
    >
      <span className={mlClass}>{label}</span>
      <b
        className="mt-[.25em] block font-mono text-[1.55em] font-medium tracking-[-.03em]"
        style={valueStyle}
      >
        {value}
      </b>
      {delta && (
        <small className="font-mono text-[.68em] text-success">{delta}</small>
      )}
    </div>
  );
}
