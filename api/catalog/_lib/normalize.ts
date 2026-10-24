/**
 * B4 — search normalization for the catalog (English, Modern Standard Arabic, Egyptian Arabic).
 *
 * English: lowercased, accents stripped, punctuation → space, compounds joined ("pull up" →
 * "pullup"), gym abbreviations expanded (db, bb, kb, rdl, ohp), simple plurals folded ("curls" →
 * "curl", "presses" → "press", "flies" → "fly").
 * Arabic: diacritics and tatweel removed, letter variants folded (أ إ آ ٱ → ا, ى → ي, ة → ه,
 * ؤ → و, ئ → ي), Arabic-Indic digits → 0-9, and a leading "ال" (also "وال" / "بال") dropped from a
 * word so "الدمبل" finds "دمبل".
 */
const AR_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const AR_DIGITS = /[٠-٩۰-۹]/g;

export function foldArabic(s: string): string {
  return s
    .replace(AR_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[ی]/g, 'ي')
    .replace(/[ک]/g, 'ك')
    .replace(AR_DIGITS, (d) => String((d.charCodeAt(0) & 0xf) % 10));
}

/** Phrases written apart or together ("pull up" / "pull-up" / "pullup") meet on one form. */
const COMPOUNDS: [RegExp, string][] = [
  [/\bpull ?ups?\b/g, 'pullup'],
  [/\bchin ?ups?\b/g, 'chinup'],
  [/\bpush ?ups?\b/g, 'pushup'],
  [/\bpress ?ups?\b/g, 'pushup'],
  [/\bsit ?ups?\b/g, 'situp'],
  [/\bstep ?ups?\b/g, 'stepup'],
  [/\bpull ?downs?\b/g, 'pulldown'],
  [/\bpush ?downs?\b/g, 'pushdown'],
  [/\bdead ?lifts?\b/g, 'deadlift'],
  [/\bskull ?crushers?\b/g, 'skullcrusher'],
  [/\bkick ?backs?\b/g, 'kickback'],
  [/\bcross ?overs?\b/g, 'crossover'],
  [/\bwarm ?ups?\b/g, 'warmup'],
  [/\boat ?meal\b/g, 'oatmeal'],
];
const ABBREVIATIONS: Record<string, string> = {
  db: 'dumbbell',
  dbs: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  rdl: 'romanian deadlift',
  sldl: 'stiff leg deadlift',
  ohp: 'overhead press',
  bss: 'bulgarian split squat',
  ez: 'ez',
  trx: 'suspension',
  bw: 'bodyweight',
};

function singular(w: string): string {
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith('sses') || w.endsWith('shes') || w.endsWith('ches') || w.endsWith('xes')) return w.slice(0, -2);
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
  return w;
}

function arabicStem(w: string): string {
  for (const p of ['وال', 'بال', 'فال', 'كال', 'لل', 'ال']) {
    if (w.startsWith(p) && w.length - p.length >= 2) return w.slice(p.length);
  }
  return w;
}

const isArabic = (w: string) => /[؀-ۿ]/.test(w);

/** Lowercased, folded, punctuation-free text (no stemming) — for phrase comparisons. */
export function normalizeText(s: string): string {
  let t = foldArabic(s.normalize('NFKD').replace(/[̀-ͯ]/g, '')).toLowerCase();
  t = t.replace(/['’`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  for (const [re, to] of COMPOUNDS) t = t.replace(re, to);
  return t.replace(/\s+/g, ' ').trim();
}

/** Search tokens: normalized, abbreviations expanded, plurals folded, Arabic article dropped. */
export function tokenize(s: string): string[] {
  return tokensOf(normalizeText(s));
}

/** `tokenize` for text already passed through `normalizeText` (saves normalizing twice). */
export function tokensOf(normalized: string): string[] {
  const out: string[] = [];
  for (const raw of normalized.split(' ')) {
    if (!raw) continue;
    const expanded = ABBREVIATIONS[raw];
    for (const w of (expanded ?? raw).split(' ')) out.push(isArabic(w) ? arabicStem(w) : singular(w));
  }
  return out;
}

/** Optimal-string-alignment distance, capped: returns `max + 1` as soon as it is exceeded. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j += 1) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}
