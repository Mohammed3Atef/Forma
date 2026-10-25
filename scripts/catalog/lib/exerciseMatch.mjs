/**
 * Exercise-name matching shared by the source mappings (B4.1 `fedb-mapping`, B4.2
 * `import-exercisedb`): English names normalised conservatively — spelling, compounds,
 * "one / single", plurals — and an equipment-free key. Two names with the same key are the same
 * movement; a name that differs only by MODIFIERS is a variation (never merged).
 */
export const SYN = [
  [/\bbycicle\b/g, 'bicycle'],
  [/\bpush ?ups?\b/g, 'pushup'],
  [/\bpress ?ups?\b/g, 'pushup'],
  [/\bpull ?ups?\b/g, 'pullup'],
  [/\bchin ?ups?\b/g, 'chinup'],
  [/\bsit ?ups?\b/g, 'situp'],
  [/\bstep ?ups?\b/g, 'stepup'],
  [/\bpull ?downs?\b/g, 'pulldown'],
  [/\bpush ?downs?\b/g, 'pushdown'],
  [/\bdead ?lifts?\b/g, 'deadlift'],
  [/\bskull ?crushers?\b/g, 'skullcrusher'],
  [/\bkick ?backs?\b/g, 'kickback'],
  [/\bcross ?overs?\b/g, 'crossover'],
  [/\bflyes\b/g, 'fly'],
  [/\bflies\b/g, 'fly'],
  [/\bone[ -]?(arm|leg)\b/g, 'single $1'],
  [/\bsingle[ -]?(arm|leg)\b/g, 'single $1'],
  [/\bdb\b/g, 'dumbbell'],
  [/\bbb\b/g, 'barbell'],
  [/\bez[ -]?(bar|barbell)\b/g, 'ezbar'],
  [/\blever(age)?\b/g, 'machine'],
  [/\bbody ?weight\b/g, ''],
  [/\btriceps\b/g, 'tricep'],
  [/\bbiceps\b/g, 'bicep'],
  [/\bcrunches\b/g, 'crunch'],
];
export const singular = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') ? w.slice(0, -1) : w);
export function tokens(name) {
  let t = name.toLowerCase().replace(/[’']/g, '').replace(/[()]/g, ' ').replace(/[^a-z0-9]+/g, ' ');
  for (const [re, to] of SYN) t = t.replace(re, to);
  return t.split(' ').filter(Boolean).map(singular);
}
export const EQUIP_WORDS = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'band', 'kettlebell', 'smith', 'ezbar', 'weighted', 'sled', 'rope', 'stability', 'ball', 'with', 'on', 'the', 'a']);
export const MODIFIERS = new Set(['incline', 'decline', 'close', 'wide', 'narrow', 'grip', 'reverse', 'single', 'alternate', 'alternating', 'seated', 'standing', 'lying', 'kneeling', 'prone', 'supine', 'bent', 'over', 'hammer', 'preacher', 'concentration', 'front', 'rear', 'side', 'lateral', 'overhead', 'sumo', 'romanian', 'stiff', 'bulgarian', 'split', 'goblet', 'jump', 'pause', 'deficit', 'assisted', 'weighted', 'twisting', 'oblique', 'cross', 'body', 'floor', 'svend', 'pike', 'diamond', 'archer', 'spider', 'drag', 'zottman', 'svend', 'w', 'y', 't', 'iso', 'isometric', 'half', 'partial', 'rack', 'pin', 'box', 'hack', 'v', 'neutral', 'underhand', 'overhand', 'high', 'low', 'upright', 'tempo', 'band', 'resisted', 'banded', 'elevated', 'feet', 'knee', 'hip']);

export const keyOf = (ts) => ts.filter((t) => !EQUIP_WORDS.has(t)).sort().join(' ');
