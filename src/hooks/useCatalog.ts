import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { catalogMetaQuery, type CatalogTaxonomy } from '@/services/platform/catalogApi';

/**
 * The catalog's bilingual vocabulary (muscles, equipment, food categories …). B4.3: the catalog is
 * always on (it is the shared library); `enabled` only says the vocabulary has loaded.
 */
export function useCatalogMeta() {
  const q = useQuery(catalogMetaQuery());
  const meta = q.data;
  return { enabled: !!meta, taxonomy: meta?.taxonomy ?? null, licenses: meta?.licenses ?? null, loading: q.isLoading };
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
