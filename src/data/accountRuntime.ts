import type { Role } from '@/types';
import { closeAccountScope, currentLocalOwner, openAccountScope } from './localScope';
import { bootstrapData } from './bootstrap';
import { useSettings } from '@/stores/settingsStore';
import { refreshPendingSync } from './sync/syncTruth';
import { useSyncConflicts } from './sync/conflicts';
import { reloadOnceForStaleChunk } from '@/lib/staleChunk';

/**
 * Opens / closes the signed-in account's LOCAL runtime (B0 / PWA-02, PWA-04):
 *  - every account gets its own local database (`localScope.ts`);
 *  - only the CLIENT role runs the local-first client runtime — stores,
 *    reminders and cloud sync. Coaches/admins only load their device settings
 *    (locale) and never read, push or mark-synced any client data;
 *  - leaving an account first flushes its pending writes and waits for any
 *    in-flight sync, so nothing of one account can land in another's database.
 * Switches are serialized.
 *
 * The client runtime and the outbox are loaded on demand (B1.13 / AR-02): an
 * anonymous visitor downloads neither, a coach or admin only the outbox.
 */
type ClientRuntime = typeof import('./clientRuntime');
type OutboxRuntime = typeof import('./outbox/runtime');

let clientRuntime: ClientRuntime | null = null;
let outboxRuntime: OutboxRuntime | null = null;
const loadClientRuntime = async () => (clientRuntime ??= await import('./clientRuntime'));
const loadOutboxRuntime = async () => (outboxRuntime ??= await import('./outbox/runtime'));

let active: { uid: string; role: Role } | null = null;
let chain: Promise<void> = Promise.resolve();

async function leave(): Promise<void> {
  if (!active) return;
  if (active.role === 'client' && clientRuntime) await clientRuntime.leaveClient();
  // Every role has an outbox (coaches send messages too); stop it before the
  // database is closed so nothing of this account can be sent under the next one.
  if (outboxRuntime) await outboxRuntime.stopOutbox();
  closeAccountScope();
  useSyncConflicts.setState({ conflicts: [] });
  refreshPendingSync(0);
  active = null;
}

async function enter(uid: string, role: Role): Promise<void> {
  // Fetch the code before opening anything, so a failed chunk load leaves no half-open account.
  const [outbox, client] = await Promise.all([loadOutboxRuntime(), role === 'client' ? loadClientRuntime() : null]);
  await openAccountScope(uid);
  await outbox.startOutbox(uid);
  void useSyncConflicts.getState().refresh().catch(() => undefined);
  refreshPendingSync(0);
  await bootstrapData();
  await useSettings.getState().load();
  if (client) await client.enterClient(uid);
  active = { uid, role };
}

/** Make the local runtime match the signed-in account (null = signed out). */
export function syncLocalRuntime(uid: string | null, role: Role | null): Promise<void> {
  chain = chain
    .then(async () => {
      if (active && uid === active.uid && role === active.role) return;
      await leave();
      if (uid && role) await enter(uid, role);
    })
    .catch((e) => {
      // A stale chunk after a deploy: reload once to pick up the new build.
      if (reloadOnceForStaleChunk(e)) return;
      console.error('[runtime] failed to open the local data for this account:', e);
    });
  return chain;
}

/** True when the client runtime for `uid` is open (stores loaded from its own database). */
export function clientRuntimeReady(uid: string | null | undefined): boolean {
  return !!uid && active?.uid === uid && active.role === 'client' && currentLocalOwner() === uid;
}

/** The account whose local runtime is open (any role). */
export function runtimeAccount(): string | null {
  return active?.uid ?? null;
}

// Crash-safety (B0 / PWA-07): settle debounced writes the moment the app is
// hidden — iOS may kill a backgrounded PWA without another chance.
if (typeof document !== 'undefined') {
  const flush = () => {
    if (active?.role === 'client' && clientRuntime) void clientRuntime.flushClientWrites();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}
