/**
 * Gradients shared by every chart and progress ring on the page (design
 * #hg1 / #hg2 — defined once in the hero chart, referenced from other
 * sections). Rendered once per page so no section depends on another.
 */
export function SvgDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" className="absolute">
      <defs>
        <linearGradient id="hg1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF8B02" stopOpacity=".28" />
          <stop offset="1" stopColor="#FF8B02" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hg2" x1="0" x2="1">
          <stop offset="0" stopColor="#FFB208" />
          <stop offset="1" stopColor="#FF4C01" />
        </linearGradient>
      </defs>
    </svg>
  );
}
