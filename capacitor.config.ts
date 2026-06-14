import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ca.myrocky.forma',
  appName: 'Forma',
  webDir: 'dist',
  backgroundColor: '#000000',
  android: {
    backgroundColor: '#000000',
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#000000',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      launchAutoHide: false, // we hide it from JS once the app has booted
    },
  },
};

export default config;
