/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  // Bunny CDN (image uploads — optional; absent ⇒ photos stay local-only).
  readonly VITE_BUNNY_STORAGE_ZONE?: string;
  readonly VITE_BUNNY_API_KEY?: string;
  readonly VITE_BUNNY_CDN_URL?: string;
  readonly VITE_BUNNY_STORAGE_REGION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
