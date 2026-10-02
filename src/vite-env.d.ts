/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/**
 * The ONLY `VITE_*` variables the app reads — every one of them is public by
 * design (they are inlined into the browser bundle). Read each by its full
 * static name (`import.meta.env.VITE_X`), never via a bare `import.meta.env`
 * object: a bare reference makes Vite inline every `VITE_*` variable present
 * in the build environment, which is how a storage credential once shipped.
 * Secrets (Mongo, JWT, Bunny, Resend, cron) are `api/`-only and must not use
 * the `VITE_` prefix.
 */
interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_ANALYTICS_SRC?: string;
  readonly VITE_ANALYTICS_DATA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
