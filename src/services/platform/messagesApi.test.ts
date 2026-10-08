import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();
vi.mock('@/services/trpc', () => ({ trpc: { messages: { list: { query: (...a: unknown[]) => list(...a) } } } }));

import { subscribeOpenThread, subscribeThreadMeta } from './messagesApi';

const msg = (id: string, seenAt: number | null = null) => ({ id, clientId: 'c1', fromRole: 'coach', body: id, createdAt: 1, seenAt });

beforeEach(() => {
  vi.useFakeTimers();
  list.mockReset();
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
