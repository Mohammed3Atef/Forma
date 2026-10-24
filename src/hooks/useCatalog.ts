import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { catalogMetaQuery, type CatalogTaxonomy } from '@/services/platform/catalogApi';

/**
 * B4 — whether the curated Forma catalog is on here, and its bilingual vocabulary. `enabled` is
 * false while loading, offline before the first fetch, and wherever the owner has not switched the
 * catalog on (production until approval) — callers then show exactly what they showed before B4.
 */
export function useCatalogMeta() {
  const q = useQuery(catalogMetaQuery());
  const meta = q.data;
  return {
    enabled: !!meta?.enabled,
    taxonomy: meta?.enabled ? meta.taxonomy : null,
    licenses: meta?.enabled ? meta.licenses : null,
    loading: q.isLoading,
  };
}

type Table = Record<string, { en: string; ar: string }>;

/** A vocabulary label in the reader's language (Egyptian Arabic reads the Arabic label). */
export function useTaxonomyLabel() {
  const { i18n } = useTranslation();
  const ar = i18n.language.startsWith('ar');
  return (taxonomy: CatalogTaxonomy | null, table: keyof CatalogTaxonomy, id: string): string => {
    const entry = (taxonomy?.[table] as Table | undefined)?.[id];
    return entry ? (ar ? entry.ar : entry.en) : id;
  };
}
