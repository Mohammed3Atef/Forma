/** Moves the item at `idx` one place up (-1) or down (1); out of range returns the same array. */
export function move<T>(arr: T[], idx: number, dir: -1 | 1): T[] {
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[idx], next[j]] = [next[j], next[idx]];
  return next;
}
