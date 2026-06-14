import { Capacitor } from '@capacitor/core';

/**
 * Native-only setup for the Capacitor Android/iOS shells. No-op on the web so
 * the PWA path is untouched. Sets the dark status bar to match the black theme
 * and hides the native splash once the web app has booted.
 */
export async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Style.Dark → light icons/text, for our dark (black) background.
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#000000' });
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
