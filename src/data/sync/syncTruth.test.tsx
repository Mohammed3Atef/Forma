import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { deriveSyncTruth, outboxCounts, usePendingSync, type SyncTruthInput } from './syncTruth';
import { useCloud } from '@/services/auth/cloudStore';
import { useSyncConflicts } from './conflicts';
import { useOutbox, type OutboxOp } from '@/data/outbox/outbox';
import { SyncStatus } from '@/components/ui/SyncStatus';

const base: SyncTruthInput = {
  clientSync: true,
  online: true,
  syncing: false,
  lastSync: 1_000,
  syncError: false,
  pendingLocal: 0,
  rejected: 0,
  conflicts: 0,
  outbox: { pending: 0, sending: 0, failed: 0 },
};

describe('deriveSyncTruth (B1.7 / PWA-11)', () => {
  it('is "synced" only when everything this device did has been acknowledged', () => {
    expect(deriveSyncTruth(base)).toBe('synced');
  });
  it('never claims "synced" with unsynced edits — online or offline', () => {
    expect(deriveSyncTruth({ ...base, pendingLocal: 2 })).toBe('waiting');
    expect(deriveSyncTruth({ ...base, pendingLocal: 2, online: false })).toBe('saved_on_device');
  });
  it('never claims "synced" with a queued message or photo', () => {
    expect(deriveSyncTruth({ ...base, outbox: { pending: 1, sending: 0, failed: 0 } })).toBe('waiting');
    expect(deriveSyncTruth({ ...base, online: false, outbox: { pending: 1, sending: 0, failed: 0 } })).toBe('saved_on_device');
  });
  it('is not "synced" just because the device is online (nothing confirmed yet this session)', () => {
    expect(deriveSyncTruth({ ...base, lastSync: null })).toBe('waiting');
    expect(deriveSyncTruth({ ...base, lastSync: null, online: false })).toBe('saved_on_device');
  });
  it('a conflict outranks everything; a refusal is a failure', () => {
    expect(deriveSyncTruth({ ...base, conflicts: 1, pendingLocal: 3, syncing: true })).toBe('conflict');
    expect(deriveSyncTruth({ ...base, rejected: 1 })).toBe('failed');
    expect(deriveSyncTruth({ ...base, outbox: { pending: 0, sending: 0, failed: 1 } })).toBe('failed');
    expect(deriveSyncTruth({ ...base, syncError: true })).toBe('failed');
  });
  it('a failed pass while OFFLINE is not "sync failed" — it is saved on this device', () => {
    expect(deriveSyncTruth({ ...base, syncError: true, online: false, pendingLocal: 1 })).toBe('saved_on_device');
  });
  it('shows "syncing" while a pass or a send runs (online)', () => {
    expect(deriveSyncTruth({ ...base, syncing: true })).toBe('syncing');
    expect(deriveSyncTruth({ ...base, outbox: { pending: 0, sending: 1, failed: 0 } })).toBe('syncing');
  });
  it('a coach session (no tracker sync) is judged on its outbox only', () => {
    expect(deriveSyncTruth({ ...base, clientSync: false, lastSync: null })).toBe('synced');
    expect(deriveSyncTruth({ ...base, clientSync: false, lastSync: null, outbox: { pending: 1, sending: 0, failed: 0 } })).toBe('waiting');
  });
  it('counts outbox ops by meaning', () => {
    const op = (status: OutboxOp['status']) => ({ status }) as OutboxOp;
    expect(outboxCounts([op('queued'), op('waiting_for_network'), op('failed_retryable'), op('sending'), op('failed_permanent'), op('acknowledged')])).toEqual({ pending: 3, sending: 1, failed: 1 });
  });
});

describe('<SyncStatus> (the one indicator)', () => {
  beforeEach(() => {
    useCloud.setState({ user: { uid: 'c1' }, syncing: false, lastSync: Date.now() - 60_000, error: null, syncNow: vi.fn(async () => undefined) } as never);
    usePendingSync.setState({ pendingLocal: 0, rejected: 0, rejectedReadOnly: 0 });
    useSyncConflicts.setState({ conflicts: [] });
    useOutbox.setState({ ops: [], progress: {} });
  });

  it('is silent when healthy (inline)', () => {
    const { container } = render(<SyncStatus />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says "Waiting to sync" — never "Synced" — while a change is pending', () => {
    usePendingSync.setState({ pendingLocal: 2, rejected: 0 });
    render(<SyncStatus />);
    expect(screen.getByTestId('sync-status')).toHaveAttribute('data-sync-state', 'waiting');
    expect(screen.queryByText('Synced')).toBeNull();
  });

  it('a failure offers a retry that starts a sync pass', () => {
    const syncNow = vi.fn(async () => undefined);
    useCloud.setState({ error: 'boom', syncNow } as never);
    render(<SyncStatus />);
    fireEvent.click(screen.getByRole('button'));
    expect(syncNow).toHaveBeenCalledWith(true);
  });

  it('B3.0.1: logs refused for SUBSCRIPTION_READ_ONLY are explained (kept on the device, sync once covered)', () => {
    usePendingSync.setState({ pendingLocal: 2, rejected: 2, rejectedReadOnly: 2 });
    render(<SyncStatus variant="detail" />);
    expect(screen.getByTestId('sync-status')).toHaveAttribute('data-sync-state', 'failed');
    expect(screen.getByTestId('sync-readonly-detail')).toHaveTextContent('2 entries are dated outside your coaching subscription');
    expect(screen.getByTestId('sync-readonly-detail')).toHaveTextContent('stay on this device');
  });

  it('other refusals do not show the subscription explanation', () => {
    usePendingSync.setState({ pendingLocal: 1, rejected: 1, rejectedReadOnly: 0 });
    render(<SyncStatus variant="detail" />);
    expect(screen.queryByTestId('sync-readonly-detail')).toBeNull();
  });

  it('the detail view states what is pending, with a real plural', () => {
    usePendingSync.setState({ pendingLocal: 1, rejected: 0 });
    const { rerender } = render(<SyncStatus variant="detail" />);
    expect(screen.getByText('1 change not synced yet')).toBeInTheDocument();
    usePendingSync.setState({ pendingLocal: 3, rejected: 0 });
    rerender(<SyncStatus variant="detail" />);
    expect(screen.getByText('3 changes not synced yet')).toBeInTheDocument();
  });
});
