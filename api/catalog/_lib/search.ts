import { editDistance, normalizeText, tokenize, tokensOf } from './normalize.js';

/**
 * B4 — in-memory ranked search over a catalog (a few hundred curated items: a linear scan per
 * query takes a few milliseconds, needs no database read and no index).
 *
 * Every query word must match the item (AND), in any of its fields: exactly, as a prefix, or —
 * for words of 4+ letters — within one typo (two for 8+). The score favours the item's own name
 * over aliases over descriptive fields (muscles, equipment, category), an exact or leading
 * full-phrase match, and then the item's own `boost` (e.g. verified foods first). Ties fall back to
 * the name, so results are stable.
 */
export interface SearchField {
  text: string;
  /** 1 = the item's name; ~0.9 aliases; ~0.4 descriptive (muscle / equipment / category labels). */
  weight: number;
}

interface IndexedField {
  weight: number;
  phrase: string;
  joined: string;
  tokens: string[];
}

export interface SearchIndex<T> {
  items: { item: T; fields: IndexedField[]; boost: number; sortKey: string }[];
}

export function buildIndex<T>(items: T[], fields: (item: T) => SearchField[], opts: { boost?: (item: T) => number; sortKey: (item: T) => string }): SearchIndex<T> {
  // Muscle / equipment / category labels repeat across most items: normalize each text once.
  const seen = new Map<string, Omit<IndexedField, 'weight'>>();
  const prepare = (text: string) => {
    let p = seen.get(text);
    if (!p) {
      const phrase = normalizeText(text);
      p = { phrase, joined: phrase.replace(/ /g, ''), tokens: tokensOf(phrase) };
      seen.set(text, p);
    }
    return p;
  };
  return {
    items: items.map((item) => ({
      item,
      boost: opts.boost?.(item) ?? 0,
      sortKey: opts.sortKey(item),
      fields: fields(item)
        .filter((f) => f.text && f.text.trim())
        .map((f) => ({ weight: f.weight, ...prepare(f.text) })),
    })),
  };
}

function tokenScore(q: string, t: string): number {
  if (t === q) return 1;
  if (q.length >= 2 && t.startsWith(q)) return 0.8;
  if (q.length >= 4) {
    const max = q.length >= 8 ? 2 : 1;
    if (editDistance(q, t, max) <= max) return 0.6;
    if (t.length > q.length && editDistance(q, t.slice(0, q.length), 1) <= 1) return 0.5; // typo in a prefix
  }
  return 0;
}

export interface SearchHit<T> {
  item: T;
  score: number;
}

/** Ranked matches for `query` among items passing `filter`. An empty query lists by name. */
export function search<T>(index: SearchIndex<T>, query: string, opts: { filter?: (item: T) => boolean; limit: number; offset?: number }): { hits: SearchHit<T>[]; total: number } {
  const qTokens = tokenize(query);
  const qPhrase = normalizeText(query);
  const qJoined = qPhrase.replace(/ /g, '');
  const scored: (SearchHit<T> & { sortKey: string })[] = [];
  // The same item words recur across the catalog: score each (query word, item word) pair once.
  const pairScores = qTokens.map(() => new Map<string, number>());
  const scoreOf = (qi: number, t: string) => {
    let s = pairScores[qi].get(t);
    if (s === undefined) {
      s = tokenScore(qTokens[qi], t);
      pairScores[qi].set(t, s);
    }
    return s;
  };
  for (const entry of index.items) {
    if (opts.filter && !opts.filter(entry.item)) continue;
    if (!qTokens.length) {
      scored.push({ item: entry.item, score: entry.boost, sortKey: entry.sortKey });
      continue;
    }
    let total = 0;
    let all = true;
    for (let qi = 0; qi < qTokens.length; qi += 1) {
      let best = 0;
      for (const f of entry.fields) {
        for (const t of f.tokens) {
          const s = scoreOf(qi, t) * f.weight;
          if (s > best) best = s;
        }
      }
      if (best === 0) {
        all = false;
        break;
      }
      total += best;
    }
    // "benchpress" / "bench press": the joined forms meet even when the words don't.
    if (!all && qJoined.length >= 5) {
      const f = entry.fields.find((x) => x.joined.includes(qJoined));
      if (f) {
        all = true;
        total = qTokens.length * 0.7 * f.weight;
      }
    }
    if (!all) continue;
    let bonus = 0;
    for (const f of entry.fields) {
      if (f.phrase === qPhrase) bonus = Math.max(bonus, 3 * f.weight);
      else if (f.phrase.startsWith(qPhrase)) bonus = Math.max(bonus, 1.5 * f.weight);
    }
    scored.push({ item: entry.item, score: total / qTokens.length + bonus + entry.boost, sortKey: entry.sortKey });
  }
  scored.sort((a, b) => b.score - a.score || a.sortKey.localeCompare(b.sortKey));
  const offset = opts.offset ?? 0;
  return { hits: scored.slice(offset, offset + opts.limit).map(({ item, score }) => ({ item, score })), total: scored.length };
}
