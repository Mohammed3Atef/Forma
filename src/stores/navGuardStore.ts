import { create } from 'zustand';

type Guard = () => Promise<boolean>;

interface NavGuardState {
  /** Set by whichever screen is currently dirty; null when nothing needs guarding. Only one screen is ever mounted/dirty at a time. */
  check: Guard | null;
}

const useNavGuard = create<NavGuardState>(() => ({ check: null }));

/** See `useUnsavedGuard` — screens register/clear this as their dirty state changes. */
export function setNavGuard(check: Guard | null): void {
  useNavGuard.setState({ check });
}

/**
 * Every in-app navigation trigger (back buttons via `useBack`, the workspace
 * tab rail, the bottom nav) calls this before actually navigating. Resolves
 * `true` immediately when nothing is dirty; otherwise runs the registered
 * confirm and resolves to the user's choice.
 */
export async function confirmLeave(): Promise<boolean> {
  const { check } = useNavGuard.getState();
  if (!check) return true;
  return check();
}

/** Synchronous check for triggers (e.g. a `<NavLink>` click) that only want to intercept their default behavior when a guard actually needs to run. */
export function hasNavGuard(): boolean {
  return useNavGuard.getState().check !== null;
}
