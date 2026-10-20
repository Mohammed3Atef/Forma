import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { BroadcastResult } from '@/services/platform/messagesApi';

/**
 * B3.6 certification — the broadcast result says only what is known: delivered,
 * refused ("not sent"), or no answer ("not confirmed — may have arrived"); and
 * Retry re-sends to exactly those recipients inside the SAME batch (same keys),
 * so nobody this broadcast already reached gets a second copy.
 */
const sendBroadcast = vi.fn();
vi.mock('@/services/platform/messagesApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/messagesApi')>()),
  sendBroadcast: (...a: unknown[]) => sendBroadcast(...a),
}));
vi.mock('@/stores/dialogStore', async (orig) => ({
  ...(await orig<typeof import('@/stores/dialogStore')>()),
  confirmDialog: vi.fn(async () => true),
}));

import { BroadcastSheet } from './BroadcastSheet';

const clients = [
  { id: 'a', name: 'Amira' },
  { id: 'b', name: 'Bassem' },
  { id: 'c', name: 'Carla' },
];
const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

beforeEach(() => sendBroadcast.mockReset());

describe('broadcast result and retry', () => {
  it('delivered / not sent / not confirmed are reported separately; Retry reuses the batch for the other two only', async () => {
    sendBroadcast.mockResolvedValueOnce([
      { clientId: 'a', ok: true },
      { clientId: 'b', ok: false, failure: 'notAssigned' },
      { clientId: 'c', ok: false, failure: 'unknown' },
    ] satisfies BroadcastResult[]);
    render(<BroadcastSheet open onClose={() => undefined} coachId="coach-1" clients={clients} />);
    fireEvent.change(screen.getByTestId('broadcast-body'), { target: { value: 'Gym closed Friday' } });
    fireEvent.click(screen.getByTestId('broadcast-send'));
    await flush();
    await flush();

    expect(sendBroadcast).toHaveBeenCalledTimes(1);
    const first = sendBroadcast.mock.calls[0][0] as { batchId: string; recipients: string[]; body: string };
    expect(first.recipients).toEqual(['a', 'b', 'c']);
    expect(screen.getByTestId('broadcast-summary')).toHaveTextContent('Sent to 1 of 3 clients');
    expect(screen.getByTestId('broadcast-not-sent')).toHaveTextContent('1 not sent');
    expect(screen.getByTestId('broadcast-unconfirmed')).toHaveTextContent('1 not confirmed — may have arrived');
    const list = screen.getByTestId('broadcast-failed-list');
    expect(within(list).getByText('Bassem').closest('li')).toHaveTextContent('Not sent — no longer your client');
    expect(within(list).getByText('Carla').closest('li')).toHaveTextContent('Not confirmed — it may have arrived');
    expect(screen.queryByText(/Sent to 3/)).toBeNull(); // never claims delivery it doesn't know

    sendBroadcast.mockResolvedValueOnce([
      { clientId: 'b', ok: true },
      { clientId: 'c', ok: true },
    ] satisfies BroadcastResult[]);
    fireEvent.click(screen.getByTestId('broadcast-retry'));
    await flush();
    await flush();
    const retry = sendBroadcast.mock.calls[1][0] as { batchId: string; recipients: string[]; body: string };
    expect(retry.recipients).toEqual(['b', 'c']); // never Amira again
    expect(retry.batchId).toBe(first.batchId); // same keys → no second copy for anyone already stored
    expect(retry.body).toBe(first.body);
    expect(screen.getByTestId('broadcast-summary')).toHaveTextContent('Sent to 3 of 3 clients');
    expect(screen.queryByTestId('broadcast-failed-list')).toBeNull();
  });

  it('while sending, leaving the page asks first (the rest of the batch would be abandoned)', async () => {
    let finish: (r: BroadcastResult[]) => void = () => undefined;
    sendBroadcast.mockReturnValueOnce(new Promise<BroadcastResult[]>((r) => (finish = r)));
    render(<BroadcastSheet open onClose={() => undefined} coachId="coach-1" clients={clients} />);
    fireEvent.change(screen.getByTestId('broadcast-body'), { target: { value: 'Hello all' } });
    fireEvent.click(screen.getByTestId('broadcast-send'));
    await flush();
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    await act(async () => finish(clients.map((c) => ({ clientId: c.id, ok: true }))));
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});
