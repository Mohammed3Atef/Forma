/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  // Bunny CDN (image uploads — optional; absent ⇒ photos stay local-only).
  readonly VITE_BUNNY_STORAGE_ZONE?: string;
  readonly VITE_BUNNY_API_KEY?: string;
  readonly VITE_BUNNY_CDN_URL?: string;
  readonly VITE_BUNNY_STORAGE_REGION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
