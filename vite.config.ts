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
        theme_color: '#0B0C0F',
        background_color: '#0B0C0F',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'en',
        description: 'Forma — train, track, transform. The all-in-one platform for coaches and their clients.',
        categories: ['health', 'fitness', 'lifestyle'],
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
        // Richer install card (browsers that support it show these).
        screenshots: [
          { src: 'landing_page/hero-dashboard.png', sizes: '1536x1024', type: 'image/png', form_factor: 'wide', label: 'Coach dashboard' },
          { src: 'landing_page/showcase-mobile.png', sizes: '1536x1024', type: 'image/png', label: 'Forma on your phone' },
        ],
        shortcuts: [
          { name: 'Dashboard', url: '/coach', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Today', url: '/workout', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
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
    // NOTE: this used to have a hand-rolled `manualChunks` splitting
    // react/react-dom/react-router into a 'react-vendor' chunk and everything
    // else under node_modules into a catch-all 'vendor' chunk. That produced a
    // genuine circular chunk dependency (Rollup warned "Circular chunk: vendor
    // -> react-vendor -> vendor" at build time) — react-router's own
    // dependency `@remix-run/router` didn't match any of the substring
    // patterns above, so it landed in 'vendor', while everything that needs
    // react's hooks landed in 'react-vendor', creating vendor <-> react-vendor
    // in both directions. That's not just a build-time warning: depending on
    // which chunk's `<script>` tag Rollup happens to order first, the chunk
    // that runs first can execute before the other has finished initializing,
    // which is exactly the "Cannot read properties of undefined (reading
    // 'useLayoutEffect')" crash this caused in production — the whole app
    // failing to render past a blank screen. Manual chunking that isn't
    // provably cycle-free is a correctness risk, not just a caching nicety, so
    // this reverts to Rollup's automatic chunking (which is cycle-safe by
    // construction) rather than re-attempting a more complete manual split.
    chunkSizeWarningLimit: 900,
  },
});
