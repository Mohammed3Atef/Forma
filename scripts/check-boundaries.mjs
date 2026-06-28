#!/usr/bin/env node
/**
 * Architecture boundary guard (run in the lint/test gate).
 *
 * Every UI module belongs to one bucket — shared / client / coach / admin — and
 * imports may only flow one way:
 *   - coach/**  and admin/**  must NOT import client/**
 *   - client/** must NOT import coach/** or admin/**
 *   - shared/** must NOT import any role bucket (shared stays leaf-level)
 *   - any bucket may import shared + the non-UI layers (services/hooks/stores/
 *     lib/types/i18n/config/data)
 *   - the role apps (src/apps/**) wire roles together and are exempt
 *
 * Buckets are derived from path. Root `src/components/*.tsx` is a historical mix,
 * so the CLIENT_ONLY manifest below classifies the mobile-only ones as `client`
 * (everything else in the root is treated as shared). Moving those files into
 * src/components/client/ is tracked debt — until then this manifest is the
 * source of truth and is enforced exactly as if they lived in that folder.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';

const SRC = resolve('src');

// Mobile-only components still living in src/components/ root (relocation = debt).
const CLIENT_ONLY = new Set([
  'AppShell', 'DayNav', 'ExerciseCard', 'CoachCard', 'CoachInfoCard', 'Onboarding',
  'SubscriptionGate', 'SubscriptionBanner', 'ClientNotesProvider', 'RestTimerBar',
  'SyncStatusBadge', 'TrainingGuideSheet', 'WaitingForCoach', 'NumberStepper',
  'Slider', 'TagInput', 'VideoPlayerSheet',
]);
// Root pages that are shared across roles (everything else at pages/ root is client).
const SHARED_ROOT_PAGES = new Set(['Notifications', 'RoleAccount', 'RolePlaceholder']);

/** Classify a src-relative path (posix) into a bucket. */
function bucket(rel) {
  const p = rel.replace(/\\/g, '/');
  if (p.startsWith('apps/')) return 'app';
  if (p.startsWith('pages/coach/') || p.startsWith('components/coach/')) return 'coach';
  if (p.startsWith('pages/admin/') || p.startsWith('components/admin/')) return 'admin';
  if (p.startsWith('components/client/')) return 'client';
  if (p.startsWith('components/shared/') || p.startsWith('components/ui/') || p.startsWith('components/shell/')) return 'shared';
  // Root components: client-only manifest → client, else shared.
  const rootComp = p.match(/^components\/([^/]+)\.tsx?$/);
  if (rootComp) return CLIENT_ONLY.has(rootComp[1]) ? 'client' : 'shared';
  // Pages at root = client app pages, except the shared ones.
  const rootPage = p.match(/^pages\/([^/]+)\.tsx?$/);
  if (rootPage) return SHARED_ROOT_PAGES.has(rootPage[1]) ? 'shared' : 'client';
  if (p.startsWith('pages/auth/') || p.startsWith('pages/marketing/') || p.startsWith('pages/onboarding/')) return 'shared';
  // Non-UI layers are role-agnostic.
  return 'neutral';
}

// Forbidden import edges: from-bucket → set of buckets it may not import.
// Per the contract: coach/admin must not import CLIENT; client must not import
// coach/admin; shared must not import any role. Admin↔coach is allowed — Admin
// reuses explicitly cross-role coach views (TransferWizard, CoachTimeline,
// ClientActivityView) for oversight.
const FORBIDDEN = {
  coach: new Set(['client']),
  admin: new Set(['client']),
  client: new Set(['coach', 'admin']),
  shared: new Set(['client', 'coach', 'admin']),
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** Resolve an import specifier to a src-relative path (or null if external). */
function resolveSpec(spec, fileAbs) {
  let target;
  if (spec.startsWith('@/')) target = join(SRC, spec.slice(2));
  else if (spec.startsWith('./') || spec.startsWith('../')) target = resolve(dirname(fileAbs), spec);
  else return null; // node_module / package
  return relative(SRC, target).replace(/\\/g, '/');
}

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;
const violations = [];

for (const fileAbs of walk(SRC)) {
  const rel = relative(SRC, fileAbs).replace(/\\/g, '/');
  const from = bucket(rel);
  const forbid = FORBIDDEN[from];
  if (!forbid) continue;
  const code = readFileSync(fileAbs, 'utf8');
  let m;
  while ((m = IMPORT_RE.exec(code))) {
    const spec = m[1] ?? m[2];
    const targetRel = resolveSpec(spec, fileAbs);
    if (!targetRel) continue;
    const to = bucket(targetRel);
    if (forbid.has(to)) {
      violations.push(`  ${rel} [${from}]  →  ${spec} [${to}]`);
    }
  }
}

if (violations.length) {
  console.error(`\nx Architecture boundary violations (${violations.length}):\n`);
  console.error(violations.join('\n'));
  console.error('\nRules: coach/admin ∌ client · client ∌ coach/admin · shared ∌ any role.\n');
  process.exit(1);
}
console.log('✓ Architecture boundaries OK — no forbidden cross-role imports.');
