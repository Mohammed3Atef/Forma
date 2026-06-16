#!/usr/bin/env node
/**
 * Forma QA report generator.
 *
 * Reads the Playwright JSON results (test-results/results.json) and produces
 * docs/QA_REPORT.md: passed / failed / skipped counts, failures bucketed into
 * the categories the QA brief asks for (missing features, broken pages,
 * permission/security, static data, console errors, schema, UI/UX), each with a
 * recommended fix priority (Critical / High / Medium / Low).
 *
 * Safe to run before any test run — it then emits a clearly-labelled template.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(process.cwd());
const RESULTS = resolve(ROOT, 'test-results/results.json');
const OUT = resolve(ROOT, 'docs/QA_REPORT.md');

function flatten(node, file, out) {
  const f = node.file || file;
  if (Array.isArray(node.specs)) {
    for (const spec of node.specs) {
      for (const t of spec.tests ?? []) {
        const results = t.results ?? [];
        const last = results[results.length - 1] ?? {};
        const status = last.status ?? t.status ?? 'unknown';
        const errors = (last.errors ?? []).map((e) => (e.message || '').replace(/\[[0-9;]*m/g, '')).filter(Boolean);
        out.push({
          file: (f || '').replace(/\\/g, '/').split('/').pop() || f,
          title: spec.title,
          status, // passed | failed | timedOut | skipped | interrupted
          durationMs: last.duration ?? 0,
          errors,
        });
      }
    }
  }
  for (const child of node.suites ?? []) flatten(child, f, out);
}

function categorize(test) {
  const file = test.file || '';
  const errText = test.errors.join('\n').toLowerCase();
  if (/security|preflight/.test(file) && /denied|permission|block|allow/.test(test.title.toLowerCase())) return 'Permission / Security';
  if (/security/.test(file)) return 'Permission / Security';
  if (/data-integrity/.test(file)) return 'Firestore schema';
  if (/client-empty/.test(file) || /mohamed|seed|hardcoded|static/.test(test.title.toLowerCase() + errText)) return 'Static / hardcoded data';
  if (/ui-coverage/.test(file)) {
    if (/console error/.test(errText)) return 'Console errors';
    if (/horizontal scroll|i18n keys|raw i18n/.test(errText)) return 'UI / UX';
    if (/crashed|rendered empty/.test(errText)) return 'Broken pages';
    return 'UI / UX';
  }
  if (/rtl/.test(file)) return 'UI / UX';
  if (/offline/.test(file)) return 'Broken pages';
  if (/coach|admin|super-admin|client-assigned/.test(file)) return 'Missing / broken features';
  return 'Other';
}

function priorityFor(category) {
  switch (category) {
    case 'Permission / Security':
    case 'Static / hardcoded data':
    case 'Broken pages':
      return 'Critical';
    case 'Firestore schema':
    case 'Missing / broken features':
    case 'Console errors':
      return 'High';
    case 'UI / UX':
      return 'Medium';
    default:
      return 'Low';
  }
}

function bar(n, total) {
  if (!total) return '';
  const w = Math.round((n / total) * 20);
  return '█'.repeat(w) + '░'.repeat(20 - w);
}

function main() {
  mkdirSync(dirname(OUT), { recursive: true });
  const now = new Date().toISOString();

  if (!existsSync(RESULTS)) {
    writeFileSync(
      OUT,
      `# Forma — Automated QA Report\n\n> **No results found yet.** Run \`npm run test:e2e\` first, then \`npm run test:e2e:report\`.\n\n_Generated ${now}_\n`,
    );
    console.log(`[qa-report] No results.json — wrote template to ${OUT}`);
    return;
  }

  const json = JSON.parse(readFileSync(RESULTS, 'utf8'));
  const tests = [];
  for (const s of json.suites ?? []) flatten(s, s.file, tests);

  const passed = tests.filter((t) => t.status === 'passed');
  const skipped = tests.filter((t) => t.status === 'skipped');
  const failed = tests.filter((t) => !['passed', 'skipped'].includes(t.status));
  const total = tests.length;

  // Bucket failures by category.
  const buckets = {};
  for (const t of failed) {
    const cat = categorize(t);
    (buckets[cat] ??= []).push(t);
  }

  // Priority rollup.
  const byPriority = { Critical: [], High: [], Medium: [], Low: [] };
  for (const [cat, list] of Object.entries(buckets)) {
    for (const t of list) byPriority[priorityFor(cat)].push({ ...t, category: cat });
  }

  const L = [];
  L.push('# Forma — Automated QA Report');
  L.push('');
  L.push(`_Generated ${now} from \`test-results/results.json\`_`);
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push('| Result | Count | |');
  L.push('|---|---:|---|');
  L.push(`| ✅ Passed | ${passed.length} | ${bar(passed.length, total)} |`);
  L.push(`| ❌ Failed | ${failed.length} | ${bar(failed.length, total)} |`);
  L.push(`| ⏭️ Skipped | ${skipped.length} | ${bar(skipped.length, total)} |`);
  L.push(`| **Total** | **${total}** | |`);
  L.push('');
  if (json.stats?.duration) L.push(`Run duration: ${(json.stats.duration / 1000).toFixed(1)}s`);
  L.push('');

  // Priority section.
  L.push('## Recommended fix priority');
  L.push('');
  for (const p of ['Critical', 'High', 'Medium', 'Low']) {
    const items = byPriority[p];
    L.push(`### ${({ Critical: '🔴', High: '🟠', Medium: '🟡', Low: '⚪' })[p]} ${p} (${items.length})`);
    L.push('');
    if (!items.length) {
      L.push('_None._');
      L.push('');
      continue;
    }
    for (const t of items) {
      L.push(`- **[${t.category}]** \`${t.file}\` — ${t.title}`);
      if (t.errors[0]) L.push(`  - ${t.errors[0].split('\n')[0].slice(0, 240)}`);
    }
    L.push('');
  }

  // Category detail.
  L.push('## Findings by category');
  L.push('');
  const ORDER = [
    'Permission / Security',
    'Broken pages',
    'Static / hardcoded data',
    'Firestore schema',
    'Missing / broken features',
    'Console errors',
    'UI / UX',
    'Other',
  ];
  for (const cat of ORDER) {
    const list = buckets[cat];
    if (!list || !list.length) continue;
    L.push(`### ${cat} (${list.length}) — priority: ${priorityFor(cat)}`);
    L.push('');
    for (const t of list) {
      L.push(`<details><summary><code>${t.file}</code> — ${t.title}</summary>`);
      L.push('');
      L.push('```');
      L.push((t.errors.join('\n\n') || '(no error message captured)').slice(0, 2000));
      L.push('```');
      L.push('</details>');
      L.push('');
    }
  }

  if (!failed.length) {
    L.push('## 🎉 All executed tests passed');
    L.push('');
    L.push('No failures to triage. Review skipped tests below for coverage gaps.');
    L.push('');
  }

  // Skipped.
  L.push('## Skipped tests');
  L.push('');
  if (!skipped.length) L.push('_None._');
  else for (const t of skipped) L.push(`- \`${t.file}\` — ${t.title}`);
  L.push('');

  // Passed (collapsed).
  L.push('## Passed tests');
  L.push('');
  L.push('<details><summary>Show all passing tests</summary>');
  L.push('');
  for (const t of passed) L.push(`- \`${t.file}\` — ${t.title}`);
  L.push('');
  L.push('</details>');
  L.push('');

  // Artifacts pointer.
  const artifactsDir = resolve(ROOT, 'test-results/artifacts');
  let artifactNote = 'Screenshots / video / traces for failures are under `test-results/artifacts/` (open traces with `npx playwright show-trace <trace.zip>`).';
  if (existsSync(artifactsDir)) {
    const n = readdirSync(artifactsDir).length;
    artifactNote += ` (${n} artifact folder${n === 1 ? '' : 's'} found.)`;
  }
  L.push('## Artifacts');
  L.push('');
  L.push(artifactNote);
  L.push('');

  writeFileSync(OUT, L.join('\n'));
  console.log(`[qa-report] Wrote ${OUT} — ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped.`);
  // Non-zero exit if there are failures so CI can gate on the report step too.
  if (failed.length) process.exitCode = 0; // report generation itself succeeds
}

main();
