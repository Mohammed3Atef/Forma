import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();
const send = vi.fn();
const markRead = vi.fn();
vi.mock('@/services/trpc', () => ({
  trpc: {
    messages: {
      list: { query: (...a: unknown[]) => list(...a) },
      send: { mutate: (...a: unknown[]) => send(...a) },
      markRead: { mutate: (...a: unknown[]) => markRead(...a) },
    },
  },
}));

import { broadcastMsgId, markThreadSeen, sendBroadcast, subscribeOpenThread, subscribeThreadMeta } from './messagesApi';

// B34-R5: this file was `.test.ts` outside both Vitest projects' include patterns, so it never ran.
const msg = (id: string, seenAt: number | null = null) => ({ id, clientId: 'c1', fromRole: 'coach', body: id, createdAt: 1, seenAt });
/** The shape a tRPC refusal arrives in (`TRPCClientError` with `data`). */
const trpcError = (code: string, reason?: string) => Object.assign(new Error(code), { name: 'TRPCClientError', data: { code, httpStatus: code === 'FORBIDDEN' ? 403 : 409, ...(reason ? { reason } : {}) } });

beforeEach(() => {
  vi.useFakeTimers();
  list.mockReset();
  send.mockReset();
  markRead.mockReset();
  list.mockResolvedValue({ messages: [msg('m1')], cursor: 1 });
});
afterEach(() => vi.useRealTimers());

describe('one fetch path per thread (B1.13)', () => {
  it('while the thread is open, the badge takes its data instead of polling the same 200 messages again', async () => {
    const badge = vi.fn();
    const offBadge = subscribeThreadMeta('c1', badge);
    await vi.advanceTimersByTimeAsync(0);
    expect(list).toHaveBeenCalledTimes(1); // the badge's own first load
    expect(badge).toHaveBeenLastCalledWith(expect.objectContaining({ unreadForClient: 1 }));

    const offThread = subscribeOpenThread('c1', () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    list.mockClear();
    list.mockResolvedValue({ messages: [msg('m1', 5)], cursor: 2 }); // the client read it

    await vi.advanceTimersByTimeAsync(20_000); // 4 thread ticks, 1 badge tick
    expect(list).toHaveBeenCalledTimes(4); // only the open thread fetched
    expect(badge).toHaveBeenLastCalledWith(expect.objectContaining({ unreadForClient: 0 })); // fed by the thread

    offThread();
    list.mockClear();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list.mock.calls[0][0]).toEqual({ clientId: 'c1' }); // full refresh after skipping, not a `since` poll
    offBadge();
  });
});

describe('access ended while the thread is open (B3.6)', () => {
  it('a FORBIDDEN poll stops polling and reports once; other failures keep retrying', async () => {
    const onForbidden = vi.fn();
    const onError = vi.fn();
    const off = subscribeOpenThread('c2', () => undefined, onError, onForbidden);
    await vi.advanceTimersByTimeAsync(0);
    expect(list).toHaveBeenCalledTimes(1);

    list.mockRejectedValue(new TypeError('Failed to fetch')); // offline: keeps polling
    await vi.advanceTimersByTimeAsync(10_000);
    expect(list).toHaveBeenCalledTimes(3);
    expect(onForbidden).not.toHaveBeenCalled();

    list.mockRejectedValue(trpcError('FORBIDDEN')); // the client was transferred / released
    await vi.advanceTimersByTimeAsync(5_000);
    expect(onForbidden).toHaveBeenCalledTimes(1);
    list.mockClear();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(list).not.toHaveBeenCalled(); // no endless 403s
    expect(onForbidden).toHaveBeenCalledTimes(1);
    off();
  });

  it('without an onForbidden handler a refusal is just a failed tick (the client app is unchanged)', async () => {
    list.mockRejectedValue(trpcError('FORBIDDEN'));
    const onError = vi.fn();
    const off = subscribeOpenThread('c3', () => undefined, onError);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onError).toHaveBeenCalled(); // every failed tick before a first load, as before
    expect(list.mock.calls.length).toBeGreaterThanOrEqual(3); // still polling
    off();
  });

  it('markThreadSeen resolves to how many messages the server marked', async () => {
    markRead.mockResolvedValue({ ok: true, updated: 3 });
    await expect(markThreadSeen('c1', 'coach')).resolves.toBe(3);
    markRead.mockResolvedValue({ ok: true });
    await expect(markThreadSeen('c1', 'coach')).resolves.toBe(0);
  });
});

describe('broadcast (MS-10 / B3-C08)', () => {
  it('one send per recipient, each with its own stable key, in this coach’s conversation', async () => {
    vi.useRealTimers();
    send.mockImplementation(async (input: { clientId: string }) => ({ id: `m-${input.clientId}`, clientId: input.clientId, category: 'announcement' }));
    const seen: string[] = [];
    const results = await sendBroadcast({ batchId: 'b1', coachId: 'coach-1', recipients: ['a', 'b', 'c', 'd', 'e', 'f'], body: '  Gym closed Friday ', category: 'announcement' }, (r) => seen.push(r.clientId));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(seen.sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(send).toHaveBeenCalledTimes(6);
    const call = send.mock.calls.find((c) => c[0].clientId === 'c')![0];
    expect(call).toEqual({ clientId: 'c', text: 'Gym closed Friday', category: 'announcement', clientMsgId: broadcastMsgId('b1', 'c'), coachId: 'coach-1' });
    expect(new Set(send.mock.calls.map((c) => c[0].clientMsgId)).size).toBe(6);
  });

  it('partial failure: per-recipient reasons, and retrying the failed ones reuses their keys', async () => {
    vi.useRealTimers();
    send.mockImplementation(async (input: { clientId: string }) => {
      if (input.clientId === 'gone') throw trpcError('FORBIDDEN');
      if (input.clientId === 'flaky') throw new TypeError('Failed to fetch');
      return { id: `m-${input.clientId}`, clientId: input.clientId };
    });
    const first = await sendBroadcast({ batchId: 'b2', coachId: 'coach-1', recipients: ['ok1', 'gone', 'flaky'], body: 'hi', category: 'reminder' });
    expect(first.find((r) => r.clientId === 'ok1')).toEqual({ clientId: 'ok1', ok: true });
    expect(first.find((r) => r.clientId === 'gone')).toEqual({ clientId: 'gone', ok: false, failure: 'notAssigned' });
    expect(first.find((r) => r.clientId === 'flaky')).toEqual({ clientId: 'flaky', ok: false, failure: 'unknown' }); // no answer: may have arrived

    const firstKey = send.mock.calls.find((c) => c[0].clientId === 'flaky')![0].clientMsgId;
    send.mockClear();
    send.mockImplementation(async (input: { clientId: string }) => ({ id: `m-${input.clientId}`, clientId: input.clientId }));
    const retry = await sendBroadcast({ batchId: 'b2', coachId: 'coach-1', recipients: ['flaky'], body: 'hi', category: 'reminder' });
    expect(retry).toEqual([{ clientId: 'flaky', ok: true }]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].clientMsgId).toBe(firstKey);
  });

  it('a suspended coach is told why', async () => {
    vi.useRealTimers();
    send.mockRejectedValue(trpcError('FORBIDDEN', 'ACCOUNT_NOT_ACTIVE'));
    const [r] = await sendBroadcast({ batchId: 'b3', coachId: 'coach-1', recipients: ['a'], body: 'hi', category: 'update' });
    expect(r).toEqual({ clientId: 'a', ok: false, failure: 'accountNotActive' });
  });

  it('only a refusal is "not sent"; no answer, a timeout or a server error is "unknown" (it may have been stored)', async () => {
    vi.useRealTimers();
    const errors: Record<string, unknown> = {
      bad: trpcError('BAD_REQUEST'),
      expired: Object.assign(new Error('UNAUTHORIZED'), { name: 'TRPCClientError', data: { code: 'UNAUTHORIZED', httpStatus: 401 } }),
      closed: trpcError('CONFLICT', 'CONVERSATION_CLOSED'),
      boom: Object.assign(new Error('INTERNAL_SERVER_ERROR'), { name: 'TRPCClientError', data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 } }),
      slow: new DOMException('Request timed out', 'TimeoutError'),
      html502: Object.assign(new Error('Unexpected token <'), { name: 'TRPCClientError', data: null }),
    };
    send.mockImplementation(async (input: { clientId: string }) => {
      throw errors[input.clientId];
    });
    const out = await sendBroadcast({ batchId: 'b4', coachId: 'coach-1', recipients: Object.keys(errors), body: 'hi', category: 'update' });
    const by = Object.fromEntries(out.map((r) => [r.clientId, r.failure]));
    expect(by).toEqual({ bad: 'rejected', expired: 'rejected', closed: 'notAssigned', boom: 'unknown', slow: 'unknown', html502: 'unknown' });
  });

  it('a request that times out AFTER the server stored it: reported unknown, and the retry stores nothing new (same key)', async () => {
    vi.useRealTimers();
    const stored = new Map<string, { id: string; clientId: string }>(); // the server's copy, keyed like `uniq_clientMsgId`
    let answerLost = true;
    send.mockImplementation(async (input: { clientId: string; clientMsgId: string }) => {
      const key = `${input.clientId}|${input.clientMsgId}`;
      if (!stored.has(key)) stored.set(key, { id: `m-${stored.size + 1}`, clientId: input.clientId });
      if (answerLost) throw new DOMException('Request timed out', 'TimeoutError');
      return stored.get(key);
    });
    const first = await sendBroadcast({ batchId: 'b5', coachId: 'coach-1', recipients: ['a', 'b'], body: 'hi', category: 'reminder' });
    expect(first.map((r) => r.failure)).toEqual(['unknown', 'unknown']);
    expect(stored.size).toBe(2); // they DID arrive — the result never says otherwise
    answerLost = false;
    const retry = await sendBroadcast({ batchId: 'b5', coachId: 'coach-1', recipients: ['a', 'b'], body: 'hi', category: 'reminder' });
    expect(retry.every((r) => r.ok)).toBe(true);
    expect(stored.size).toBe(2); // no second copy
  });

  it('keys stay within the server limit', () => {
    expect(broadcastMsgId('x'.repeat(60), 'y'.repeat(60)).length).toBe(100);
  });
});
