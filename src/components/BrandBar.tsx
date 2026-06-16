/**
 * Slim sticky app header with the Forma mark + wordmark. Shown across every
 * role's shell so the brand is always present. Pads for the status-bar safe
 * area (notch / Capacitor) so it clears native chrome.
 */
export function BrandBar() {
  return (
    <header
      data-testid="brand-bar"
      className="sticky top-0 z-30 flex items-center justify-center gap-2.5 bg-surface/85 px-5 pt-3 backdrop-blur-md"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <img
        src="/Forma-logo.png"
        alt="Forma"
        className="h-9 w-auto max-w-[60%] rounded-[8px] object-contain"
      />
      {/* <span className="font-display text-[15px] font-bold tracking-tight text-earth">
        Forma
      </span> */}
    </header>
  );
}
