import { useSettings } from '@/stores/settingsStore';

/** Fire a vibration pattern if the device supports it and the user enabled it. */
export function vibrate(pattern: number | number[]): void {
  const enabled = useSettings.getState().settings?.vibrationEnabled ?? true;
  if (!enabled) return;
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* some browsers throw if called without a user gesture — ignore */
    }
  }
}

export const HAPTIC = {
  tap: 20,
  success: [30, 40, 30],
  restDone: [200, 100, 200, 100, 200],
};
