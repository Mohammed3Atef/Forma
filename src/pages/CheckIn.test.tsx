import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// In-memory localforage: the submission is a durable outbox op (B1.6) in the account's own database.
const dbs = new Map<string, Map<string, unknown>>();
vi.mock('localforage', () => {
  const make = (name: string, storeName: string) => {
    const key = `${name}/${storeName}`;
    const m = () => {
      if (!dbs.has(key)) dbs.set(key, new Map());
      return dbs.get(key)!;
    };
    const copy = (v: unknown) => (v instanceof Blob ? v : structuredClone(v));
    return {
      getItem: async (k: string) => (m().has(k) ? copy(m().get(k)) : null),
      setItem: async (k: string, v: unknown) => {
        m().set(k, copy(v));
        return v;
      },
      removeItem: async (k: string) => void m().delete(k),
      clear: async () => m().clear(),
      keys: async () => [...m().keys()],
      iterate: async (fn: (v: unknown, k: string, i: number) => unknown) => {
        let i = 0;
        for (const [k, v] of m()) {
          const r = fn(copy(v), k, i++);
          if (r !== undefined) return r;
        }
      },
    };
  };
  return { default: { createInstance: (o: { name: string; storeName: string }) => make(o.name, o.storeName) } };
});

const getCheckIn = vi.fn();
const submitCheckIn = vi.fn();
vi.mock('@/services/platform/checkInApi', () => ({
  getCheckIn: (...a: unknown[]) => getCheckIn(...a),
  submitCheckIn: (...a: unknown[]) => submitCheckIn(...a),
}));
vi.mock('@/services/platform/mediaApi', () => ({ useUploadConfigured: () => false }));

import { CheckIn } from './CheckIn';
import { closeAccountScope, openAccountScope } from '@/data/localScope';
import { enqueueOutbox, retryOutbox, startOutbox, stopOutbox, useOutbox } from '@/data/outbox/outbox';
import '@/data/outbox/handlers';
import { useSession } from '@/services/auth/sessionStore';
import { hasNavGuard } from '@/stores/navGuardStore';
import type { UserRecord } from '@/types';

const requested = { id: '2026-09-28', clientId: 'client-1', weekStart: '2026-09-28', weekEnd: '2026-10-04', status: 'requested', progressPhotos: {} };

function mount(path = '/check-in/2026-09-28') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/check-in/:id" element={<CheckIn />} />
          <Route path="/check-ins" element={<p>history</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const next = () => fireEvent.click(screen.getByTestId('checkin-next'));

const serverRefusal = () => Object.assign(new Error('500 {"raw":true}'), { name: 'TRPCClientError', data: { code: 'BAD_REQUEST', httpStatus: 400 } });
const connectionDrop = () => Object.assign(new Error('Failed to fetch'), { name: 'TRPCClientError', data: undefined, cause: new TypeError('Failed to fetch') });

beforeEach(async () => {
  dbs.clear();
  await stopOutbox();
  closeAccountScope();
  await openAccountScope('client-1');
  await startOutbox('client-1');
  localStorage.clear();
  getCheckIn.mockReset();
  submitCheckIn.mockReset();
  getCheckIn.mockResolvedValue(requested);
  useSession.setState({ phase: 'ready', uid: 'client-1', account: { id: 'client-1', role: 'client' } as UserRecord });
});

describe('check-in task flow (CL-42 / JR-05)', () => {
  it('a failed load is an error with Retry, never "not found" (B0.16)', async () => {
    getCheckIn.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(requested);
    mount();
    expect(await screen.findByTestId('checkin-load-error')).toBeTruthy();
    expect(screen.queryByTestId('checkin-next')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    expect(await screen.findByTestId('checkin-next')).toBeTruthy();
  });

  it('is a full-screen layer with the action pinned outside the scrolling body', async () => {
    mount();
    const flow = await screen.findByTestId('checkin-flow');
    expect(flow.className).toMatch(/\bfixed\b/);
    expect(flow.className).toMatch(/inset-0/);
    const actions = screen.getByTestId('checkin-actions');
    expect(actions).toContainElement(screen.getByTestId('checkin-next'));
    expect(screen.getByTestId('checkin-body')).not.toContainElement(screen.getByTestId('checkin-next'));
  });

  it('answers and the current step survive leaving / reloading, and resume', async () => {
    const first = mount();
    await screen.findByTestId('checkin-flow');
    next(); // → training
    next(); // → nutrition
    expect(screen.getByTestId('checkin-nutrition')).toBeInTheDocument();
    first.unmount();
    mount();
    expect(await screen.findByTestId('checkin-nutrition')).toBeInTheDocument(); // resumed at step 3
  });

  it('leaving mid-flow asks first (answers stay saved)', async () => {
    mount();
    await screen.findByTestId('checkin-flow');
    expect(hasNavGuard()).toBe(false);
    next();
    await waitFor(() => expect(hasNavGuard()).toBe(true));
  });

  it('a double tap on Submit sends exactly one check-in', async () => {
    let resolve!: (v: unknown) => void;
    submitCheckIn.mockImplementation(() => new Promise((r) => (resolve = r)));
    mount();
    await screen.findByTestId('checkin-flow');
    next();
    next();
    next();
    const submit = screen.getByTestId('checkin-submit');
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(submitCheckIn).toHaveBeenCalledTimes(1));
    fireEvent.click(submit);
    await new Promise((r) => setTimeout(r, 20));
    expect(submitCheckIn).toHaveBeenCalledTimes(1);
    getCheckIn.mockResolvedValue({ ...requested, status: 'submitted' });
    resolve({});
    await waitFor(() => expect(localStorage.getItem('forma.checkinDraft.v1.client-1.2026-09-28')).toBeNull());
  });

  it('a submit the server refuses says so and keeps every answer', async () => {
    submitCheckIn.mockRejectedValue(serverRefusal());
    mount();
    await screen.findByTestId('checkin-flow');
    next();
    next();
    next();
    fireEvent.change(screen.getByTestId('checkin-notes'), { target: { value: 'Knee felt better' } });
    fireEvent.click(screen.getByTestId('checkin-submit'));
    expect(await screen.findByTestId('checkin-error')).toBeInTheDocument();
    expect(screen.queryByText(/raw/)).toBeNull();
    expect(screen.getByDisplayValue('Knee felt better')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('forma.checkinDraft.v1.client-1.2026-09-28')!).form.notes).toBe('Knee felt better');
  });

  it('a submit that cannot reach the server is saved on the device (never "submitted") and delivered later', async () => {
    submitCheckIn.mockRejectedValueOnce(connectionDrop());
    mount();
    await screen.findByTestId('checkin-flow');
    next();
    next();
    next();
    fireEvent.change(screen.getByTestId('checkin-notes'), { target: { value: 'Offline week' } });
    fireEvent.click(screen.getByTestId('checkin-submit'));
    const queued = await screen.findByTestId('checkin-queued');
    expect(queued).toHaveTextContent('Saved on this device');
    expect(screen.queryByText(/^Submitted$/)).toBeNull();
    // The answers are still on the device until the server acknowledges them.
    expect(JSON.parse(localStorage.getItem('forma.checkinDraft.v1.client-1.2026-09-28')!).form.notes).toBe('Offline week');
    expect(useOutbox.getState().ops[0]).toMatchObject({ type: 'checkin.submit', payload: { weekStart: '2026-09-28', form: { notes: 'Offline week' } } });

    // Connection back: the same operation is delivered (same op id → idempotent on the server).
    submitCheckIn.mockResolvedValue(undefined);
    getCheckIn.mockResolvedValue({ ...requested, status: 'submitted' });
    const opId = useOutbox.getState().ops[0].operationId;
    await retryOutbox(opId);
    await waitFor(() => expect(localStorage.getItem('forma.checkinDraft.v1.client-1.2026-09-28')).toBeNull());
    expect(submitCheckIn).toHaveBeenLastCalledWith('client-1', '2026-09-28', expect.objectContaining({ notes: 'Offline week' }), opId, true);
  });
});

describe('same-week records with different owners (B3.4)', () => {
  const W = '2026-09-28';
  const B = `${W}__coach-b`; // the incoming coach's own record of a hand-over week
  const recordB = { ...requested, id: B, coachId: 'coach-b' };
  const draft = (id: string) => JSON.parse(localStorage.getItem(`forma.checkinDraft.v1.client-1.${id}`) ?? 'null');
  const toNotes = () => {
    next();
    next();
    next();
  };

  it("a draft for the week's first record never fills, or is overwritten by, the second coach's record", async () => {
    localStorage.setItem(`forma.checkinDraft.v1.client-1.${W}`, JSON.stringify({ form: { notes: 'Written for coach A' }, step: 3 }));
    getCheckIn.mockResolvedValue(recordB);
    mount(`/check-in/${B}`);
    await screen.findByTestId('checkin-flow');
    expect(getCheckIn).toHaveBeenCalledWith('client-1', B);
    toNotes();
    expect((screen.getByTestId('checkin-notes') as HTMLTextAreaElement).value).toBe(''); // a fresh start, not A's answers
    fireEvent.change(screen.getByTestId('checkin-notes'), { target: { value: 'Written for coach B' } });
    await waitFor(() => expect(draft(B)?.form.notes).toBe('Written for coach B'));
    expect(draft(W).form.notes).toBe('Written for coach A'); // untouched: never discarded, never redirected
  });

  it('offline submissions of the two records are two operations, each sent to its own record by key', async () => {
    submitCheckIn.mockRejectedValue(connectionDrop());
    const a = mount(`/check-in/${W}`);
    await screen.findByTestId('checkin-flow');
    toNotes();
    fireEvent.change(screen.getByTestId('checkin-notes'), { target: { value: 'A week' } });
    fireEvent.click(screen.getByTestId('checkin-submit'));
    await screen.findByTestId('checkin-queued');
    a.unmount();

    getCheckIn.mockResolvedValue(recordB);
    mount(`/check-in/${B}`);
    await screen.findByTestId('checkin-flow'); // A's queued submission does not mark B's record as queued
    toNotes();
    fireEvent.change(screen.getByTestId('checkin-notes'), { target: { value: 'B week' } });
    fireEvent.click(screen.getByTestId('checkin-submit'));
    await screen.findByTestId('checkin-queued');

    const ops = useOutbox.getState().ops.filter((o) => o.type === 'checkin.submit');
    expect(ops).toHaveLength(2); // the second did not replace the first (dedupe is per record, not per week)
    expect(ops.map((o) => [o.dedupeKey, o.scope])).toEqual(
      expect.arrayContaining([
        [`checkin:${W}`, `checkin:${W}`],
        [`checkin:${B}`, `checkin:${B}`],
      ]),
    );
    expect(ops.every((o) => (o.payload as { byKey?: boolean }).byKey === true)).toBe(true);

    submitCheckIn.mockResolvedValue(undefined);
    for (const o of ops) await retryOutbox(o.operationId);
    await waitFor(() => expect(submitCheckIn).toHaveBeenCalledWith('client-1', B, expect.objectContaining({ notes: 'B week' }), expect.any(String), true));
    expect(submitCheckIn).toHaveBeenCalledWith('client-1', W, expect.objectContaining({ notes: 'A week' }), expect.any(String), true);
  });

  it('a submission queued by an older build (no `byKey`) is delivered as the week it named — the server resolves it, never this app', async () => {
    submitCheckIn.mockResolvedValue(undefined);
    const op = await enqueueOutbox({ operationId: 'checkin-old', type: 'checkin.submit', scope: `checkin:${W}`, dedupeKey: `checkin:${W}`, payload: { clientId: 'client-1', weekStart: W, form: { notes: 'Queued before the update' } } });
    await retryOutbox(op.operationId);
    await waitFor(() => expect(submitCheckIn).toHaveBeenCalledWith('client-1', W, expect.objectContaining({ notes: 'Queued before the update' }), 'checkin-old', false));
  });

  it("a previous coach's request left open reads as closed — no wizard, the answers kept on the device", async () => {
    localStorage.setItem(`forma.checkinDraft.v1.client-1.${W}`, JSON.stringify({ form: { notes: 'Written for coach A' }, step: 3 }));
    getCheckIn.mockResolvedValue({ ...requested, coachId: 'coach-a', closed: true });
    mount(`/check-in/${W}`);
    expect(await screen.findByTestId('checkin-closed')).toBeInTheDocument();
    expect(screen.queryByTestId('checkin-flow')).toBeNull();
    expect(screen.getByTestId('checkin-closed-kept')).toBeInTheDocument();
    expect(screen.getByText('Written for coach A')).toBeInTheDocument(); // shown so they can be re-entered — never moved to another check-in
    expect(screen.getByTestId('checkin-closed-history')).toHaveAttribute('href', '/check-ins');
    expect(hasNavGuard()).toBe(false);
    expect(draft(W).form.notes).toBe('Written for coach A'); // never discarded
  });

  it('a submission refused because the request closed meanwhile keeps every answer and then shows it closed', async () => {
    submitCheckIn.mockRejectedValue(Object.assign(new Error('CHECKIN_STALE'), { name: 'TRPCClientError', data: { code: 'CONFLICT', httpStatus: 409, reason: 'CHECKIN_STALE' } }));
    mount(`/check-in/${W}`);
    await screen.findByTestId('checkin-flow');
    toNotes();
    fireEvent.change(screen.getByTestId('checkin-notes'), { target: { value: 'Keep me' } });
    getCheckIn.mockResolvedValue({ ...requested, coachId: 'coach-a', closed: true }); // the client changed coaches meanwhile
    fireEvent.click(screen.getByTestId('checkin-submit'));
    expect(await screen.findByTestId('checkin-closed')).toBeInTheDocument();
    expect(draft(W).form.notes).toBe('Keep me');
    expect(useOutbox.getState().ops.filter((o) => o.type === 'checkin.submit')).toHaveLength(0); // nothing left trying to send it elsewhere
  });
});
