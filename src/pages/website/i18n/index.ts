import i18n from '@/i18n';

/**
 * The public website's copy lives in its own i18next namespace, `website`,
 * one JSON file per section (i18n/<lang>/<section>.json → `<section>.*` keys).
 * It's registered when the website chunk loads, so the signed-in app never
 * downloads it. `ar-eg` falls back to `ar` through the app's fallbackLng chain
 * — the design's Arabic copy is already Egyptian.
 */
export const SITE_NS = 'website';

type Bundle = Record<string, unknown>;
const collect = (files: Record<string, Bundle>): Bundle =>
  Object.fromEntries(Object.entries(files).map(([path, json]) => [path.slice(path.lastIndexOf('/') + 1, -'.json'.length), json]));

const en = collect(import.meta.glob<Bundle>('./en/*.json', { eager: true, import: 'default' }));
const ar = collect(import.meta.glob<Bundle>('./ar/*.json', { eager: true, import: 'default' }));

i18n.addResourceBundle('en', SITE_NS, en, true, true);
i18n.addResourceBundle('ar', SITE_NS, ar, true, true);
