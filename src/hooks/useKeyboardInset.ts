import { useEffect, useState } from 'react';

/** Height the on-screen keyboard covers at the bottom of the layout viewport (0 when closed or unknown). */
export function keyboardInset(innerHeight: number, vv: { height: number; offsetTop: number } | null | undefined): number {
  if (!vv) return 0;
  const covered = Math.round(innerHeight - vv.height - vv.offsetTop);
  // Ignore browser-chrome jitter (address bar collapse is well under this).
  return covered > 80 ? covered : 0;
}

/**
 * B3.5: lets a full-screen task (the plan editors on phones) keep its bottom bar above the
 * on-screen keyboard. Uses the Visual Viewport API where it exists; elsewhere it stays 0 and the
 * bar keeps its place at the bottom of the screen.
 */
export function useKeyboardInset(enabled = true): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!enabled || !vv) return;
    const update = () => setInset(keyboardInset(window.innerHeight, vv));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);
  return enabled ? inset : 0;
}
