import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered manually in src/main.tsx (with update polling)
      includeAssets: ['icons/apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Forma',
        short_name: 'Forma',
        description: 'Forma — mobile-first fitness coaching platform.',
        theme_color: '#0B0C0F',
        background_color: '#0B0C0F',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'en',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Marketing landing images are web-only (the installed PWA opens straight
        // to /login) — keep them out of the install precache; they're runtime-cached below.
        globIgnores: ['**/landing_page/**'],
        navigateFallback: '/index.html',
        // Take control of open pages immediately and drop old precaches so a new
        // build replaces the old one without needing a reinstall.
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Marketing landing images — fetched on demand by web visitors only,
            // so cache at runtime instead of bloating the install precache.
            urlPattern: ({ url }) => url.pathname.startsWith('/landing_page/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'landing-images',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Exercise videos: cache on first play (range-request aware so
            // seeking works offline). Not precached — too large for install.
            urlPattern: ({ url }) => url.pathname.startsWith('/exercise_videos/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-videos',
              rangeRequests: true,
              cacheableResponse: { statuses: [0, 200, 206] },
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 180 },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Public-domain exercise images (free-exercise-db on GitHub). Immutable
            // by path → cache on first view so the library/picker is instant offline.
            urlPattern: ({ url }) => url.origin === 'https://raw.githubusercontent.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-images',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 180 },
            },
          },
          {
            // App data bundles (e.g. the exercise library JSON) — revalidate in the
            // background so a returning coach/admin gets instant loads.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/data/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'app-data', expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    // Split the heaviest, slowest-changing dependencies into their own long-lived
    // chunks so returning visitors (coach/admin on the web) get cache hits and
    // only re-download app code that actually changed.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase';
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/react-router') || id.includes('/scheduler/')) return 'react-vendor';
          if (id.includes('/@tanstack/')) return 'query';
          if (id.includes('/i18next') || id.includes('/react-i18next/')) return 'i18n';
          return 'vendor';
        },
      },
    },
  },
});
