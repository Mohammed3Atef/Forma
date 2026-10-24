/**
 * Keeps the shell's keyboard inset current (B1.4 shell contract): the
 * on-screen keyboard height as `--shell-keyboard` on <html>, plus
 * `data-keyboard="open"` while it is up. One listener for the whole app —
 * screens read the variable instead of each wiring its own visualViewport
 * handler.
 */
export function startViewportInsets(): () => void {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return () => undefined;
  const root = document.documentElement;
  let last = -1;
  const update = () => {
    // Height of the layout viewport hidden below the visual viewport.
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    const open = kb > 80; // ignore browser-chrome jitter
    const value = open ? kb : 0;
    if (value === last) return;
    last = value;
    root.style.setProperty('--shell-keyboard', `${value}px`);
    if (open) root.setAttribute('data-keyboard', 'open');
    else root.removeAttribute('data-keyboard');
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
  };
}
