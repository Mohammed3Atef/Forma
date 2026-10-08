import { colors } from '@/theme/colors';

/** The native shell injects `window.Capacitor` before the app loads — no need to bundle @capacitor/core on the web (B1.13). */
function isNativeShell(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/**
 * Native-only setup for the Capacitor Android/iOS shells. No-op on the web so
 * the PWA path is untouched. Sets the dark status bar to match the black theme
 * and hides the native splash once the web app has booted.
 */
export async function initNative(): Promise<void> {
  if (!isNativeShell()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Style.Dark → light icons/text, for our dark charcoal background.
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: colors.background });
  } catch {
    /* status-bar plugin unavailable — ignore */
  }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {
    /* splash-screen plugin unavailable — ignore */
  }
}
