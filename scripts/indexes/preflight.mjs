/**
 * Index preflight (B4 checkpoint 1) — READ-ONLY. Compares a database against `manifest.mjs`:
 * which indexes exist, which are missing, which exist with a different definition, whether a
 * missing UNIQUE index would collide with existing duplicates, and how the hot queries are planned.
 *
 * Only read commands are issued: listCollections, listIndexes, estimatedDocumentCount, aggregate
 * (a $match/$group/$limit pipeline — no $out/$merge), and explain('queryPlanner'). Nothing here
 * creates, drops or changes anything; `applyIndexes` is the one writer and is separate.
 */
import { INDEXES, LEGACY_DROPS, PROBES } from './manifest.mjs';

const sameKey = (a, b) => JSON.stringify(Object.entries(a)) === JSON.stringify(Object.entries(b));
const DEFINING = ['unique', 'partialFilterExpression', 'expireAfterSeconds'];
const definingOptions = (o) => Object.fromEntries(DEFINING.filter((k) => o[k] !== undefined && o[k] !== false).map((k) => [k, o[k]]));

async function existingIndexes(db, collection, names) {
  if (!names.has(collection)) return null; // the collection does not exist yet
  return db.collection(collection).listIndexes().toArray();
}

/** Duplicate groups that would block a unique index (first `sample` groups, with up to 5 ids each). */
export async function uniqueCollisions(db, spec, sample = 10) {
  const g = spec.uniqueGroup;
  if (!g) return { groups: 0, sample: [] };
  const id = Object.fromEntries(g.fields.map((f) => [f.replace(/\./g, '_'), `$${f}`]));
  const pipeline = [
    ...(g.match ? [{ $match: g.match }] : []),
    { $group: { _id: id, n: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { n: { $gt: 1 } } },
    { $facet: { count: [{ $count: 'groups' }], sample: [{ $limit: sample }, { $project: { n: 1, ids: { $slice: ['$ids', 5] } } }] } },
  ];
  const [out] = await db.collection(spec.collection).aggregate(pipeline, { allowDiskUse: true }).toArray();
  return { groups: out?.count?.[0]?.groups ?? 0, sample: (out?.sample ?? []).map((s) => ({ key: s._id, n: s.n, ids: s.ids.map(String) })) };
}

function winningIndexes(plan) {
  const found = [];
  const walk = (p) => {
    if (!p || typeof p !== 'object') return;
    if (p.indexName) found.push(p.indexName);
    if (p.stage === 'COLLSCAN') found.push('COLLSCAN');
    for (const k of ['inputStage', 'queryPlan']) walk(p[k]);
    for (const s of p.inputStages ?? []) walk(s);
  };
  walk(plan);
  return found;
}

export async function preflightIndexes(db, { indexes = INDEXES, probes = PROBES, legacyDrops = LEGACY_DROPS } = {}) {
  const names = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const cache = new Map();
  const listed = async (c) => {
    if (!cache.has(c)) cache.set(c, await existingIndexes(db, c, names));
    return cache.get(c);
  };

  const rows = [];
  for (const spec of indexes) {
    const have = await listed(spec.collection);
    const byName = have?.find((i) => i.name === spec.options.name);
    const byKey = have?.find((i) => sameKey(i.key, spec.key) && i.name !== spec.options.name && JSON.stringify(definingOptions(i)) === JSON.stringify(definingOptions(spec.options)));
    let status;
    let detail = '';
    if (!have) status = 'missing (collection absent)';
    else if (byName) {
      const same = sameKey(byName.key, spec.key) && JSON.stringify(definingOptions(byName)) === JSON.stringify(definingOptions(spec.options));
      status = same ? 'present' : 'conflict';
      if (!same) detail = `exists with ${JSON.stringify({ key: byName.key, ...definingOptions(byName) })}`;
    } else if (byKey) {
      status = 'present (other name)';
      detail = `as "${byKey.name}"`;
    } else status = 'missing';

    const row = { collection: spec.collection, name: spec.options.name, key: spec.key, unique: !!spec.options.unique, since: spec.since ?? null, runtime: !!spec.runtime, status, detail };
    if (status === 'missing' && spec.options.unique) {
      const c = await uniqueCollisions(db, spec);
      row.duplicates = c.groups;
      row.duplicateSample = c.sample;
      row.buildable = c.groups === 0;
    } else if (status.startsWith('missing')) row.buildable = true;
    rows.push(row);
  }

  const drops = [];
  for (const d of legacyDrops) {
    const have = await listed(d.collection);
    drops.push({ ...d, present: !!have?.some((i) => i.name === d.name) });
  }

  const counts = {};
  for (const c of [...new Set(indexes.map((i) => i.collection))].sort()) counts[c] = names.has(c) ? await db.collection(c).estimatedDocumentCount() : null;

  const plans = [];
  for (const p of probes) {
    if (!names.has(p.collection)) {
      plans.push({ name: p.name, collection: p.collection, used: [], ok: null, note: 'collection absent' });
      continue;
    }
    let cursor = db.collection(p.collection).find(p.filter);
    if (p.sort) cursor = cursor.sort(p.sort);
    const ex = await cursor.limit(1).explain('queryPlanner');
    const used = winningIndexes(ex?.queryPlanner?.winningPlan);
    const expect = Array.isArray(p.expect) ? p.expect : [p.expect];
    plans.push({ name: p.name, collection: p.collection, used, ok: used.some((u) => expect.includes(u)), expect });
  }

  const summary = {
    present: rows.filter((r) => r.status.startsWith('present')).length,
    missing: rows.filter((r) => r.status.startsWith('missing')).length,
    conflict: rows.filter((r) => r.status === 'conflict').length,
    blockedUnique: rows.filter((r) => r.buildable === false).length,
    plansOk: plans.filter((p) => p.ok === true).length,
    plansNotOk: plans.filter((p) => p.ok === false).length,
  };
  return { summary, indexes: rows, legacyDrops: drops, counts, plans };
}

/** Human-readable report (no secrets: the caller prints the redacted target). */
export function formatPreflight(r) {
  const out = [];
  const s = r.summary;
  out.push(`Indexes: ${s.present} present · ${s.missing} missing · ${s.conflict} conflicting · ${s.blockedUnique} unique blocked by duplicates`);
  for (const row of r.indexes) {
    if (row.status === 'present') continue;
    let line = `  ${row.status.padEnd(28)} ${row.collection}.${row.name}${row.unique ? ' (unique)' : ''}${row.since ? ` [${row.since}]` : ''}${row.runtime ? ' [runtime]' : ''}`;
    if (row.detail) line += ` — ${row.detail}`;
    if (row.duplicates) line += ` — BLOCKED: ${row.duplicates} duplicate group(s), e.g. ${JSON.stringify(row.duplicateSample.slice(0, 3))}`;
    out.push(line);
  }
  const drops = r.legacyDrops.filter((d) => d.present);
  if (drops.length) out.push(`Legacy indexes still present (dropped by --apply): ${drops.map((d) => `${d.collection}.${d.name}`).join(', ')}`);
  out.push(`Query plans: ${s.plansOk} use the expected index · ${s.plansNotOk} do not`);
  for (const p of r.plans) out.push(`  ${p.ok === null ? 'n/a ' : p.ok ? 'ok  ' : 'MISS'} ${p.name} → ${p.used.join(' > ') || p.note}`);
  out.push('Documents (estimated):');
  for (const [c, n] of Object.entries(r.counts)) out.push(`  ${c.padEnd(28)} ${n === null ? '(absent)' : n}`);
  return out.join('\n');
}

/**
 * The ONE writer: creates missing manifest indexes. A unique index with existing duplicates is
 * skipped and reported — never forced, and no document is changed. Legacy drops remove indexes only.
 */
export async function applyIndexes(db, { indexes = INDEXES, legacyDrops = LEGACY_DROPS, log = console.log } = {}) {
  const created = [];
  const skipped = [];
  for (const d of legacyDrops) {
    await db.collection(d.collection).dropIndex(d.name).then(() => log(`  dropped legacy ${d.collection}.${d.name}`), () => undefined);
  }
  // Decide from a fresh preflight: only MISSING, BUILDABLE indexes are created. A conflicting
  // definition or an equivalent index under another name is reported, never replaced.
  const plan = await preflightIndexes(db, { indexes, probes: [], legacyDrops: [] });
  for (const [i, row] of plan.indexes.entries()) {
    const spec = indexes[i];
    if (!row.status.startsWith('missing')) {
      if (row.status === 'conflict') {
        skipped.push({ collection: row.collection, name: row.name, reason: `conflict: ${row.detail}` });
        log(`  ! ${row.collection}.${row.name} NOT changed: ${row.detail} (resolve by hand)`);
      }
      continue;
    }
    if (row.buildable === false) {
      skipped.push({ collection: row.collection, name: row.name, reason: `${row.duplicates} duplicate group(s)`, sample: row.duplicateSample });
      log(`  ! ${row.collection}.${row.name} NOT created: ${row.duplicates} duplicate group(s) — resolve them first (nothing was changed)`);
      continue;
    }
    await db.collection(spec.collection).createIndex(spec.key, spec.options);
    created.push(`${spec.collection}.${spec.options.name}`);
  }
  return { created, skipped };
}

/** `mongodb+srv://user:pass@host/db?x` → `mongodb+srv://***@host` — never print credentials. */
export function redactUri(uri) {
  try {
    const u = new URL(uri);
    return `${u.protocol}//${u.username ? '***@' : ''}${u.host}`;
  } catch {
    return '(unparseable URI)';
  }
}
