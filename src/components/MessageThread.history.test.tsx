import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Message } from '@/types';

/**
 * B3.0.1 / B3-S14 (owner R-4 Option C): in the CLIENT's chat, an earlier
 * coach's conversation is shown apart and read-only, and every new message is
 * bound to the current coach's conversation (so the outbox can never deliver
 * it to a different coach later). The server enforces the same rules; this
 * proves the screen states them truthfully.
 */
let threadMessages: Message[] = [];
const queueMessage = vi.fn(async (input: { clientId: string; coachId?: string; text: string }) => ({ operationId: `op-${input.text}` }));

vi.mock('@/services/platform/messagesApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/messagesApi')>()),
  subscribeOpenThread: (_clientId: string, cb: (m: Message[]) => void) => {
    setTimeout(() => cb(threadMessages), 0);
    const stop = (() => undefined) as (() => void) & { patch: () => void };
    stop.patch = () => undefined;
    return stop;
  },
  markThreadSeen: vi.fn(async () => undefined),
}));
vi.mock('@/data/outbox/handlers', async (orig) => ({
  ...(await orig<typeof import('@/data/outbox/handlers')>()),
  queueMessage: (input: { clientId: string; coachId?: string; text: string }) => queueMessage(input),
}));
vi.mock('@/services/platform/mediaApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/mediaApi')>()),
  useUploadConfigured: () => false,
}));

import { MessageThread } from './MessageThread';

const msg = (id: string, body: string, fromRole: 'client' | 'coach', coachId?: string, at = 1): Message => ({
  id,
  clientId: 'client-1',
  ...(coachId ? { coachId } : {}),
  fromUserId: fromRole === 'client' ? 'client-1' : (coachId ?? 'legacy-coach'),
  fromRole,
  body,
  seenAt: 1,
  createdAt: Date.UTC(2026, 9, 1) + at * 60_000,
  updatedAt: 1,
});

async function renderThread(conversationCoachId: string | null) {
  const view = render(<MessageThread clientId="client-1" meId="client-1" meRole="client" peer={{ name: 'Coach B' }} conversationCoachId={conversationCoachId} />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return view;
}

beforeEach(() => {
  queueMessage.mockClear();
  threadMessages = [
    msg('m0', 'legacy line', 'client', undefined, 0),
    msg('m1', 'old coach: rest this week', 'coach', 'coach-a', 1),
    msg('m2', 'me to old coach', 'client', 'coach-a', 2),
    msg('m3', 'new coach: welcome', 'coach', 'coach-b', 3),
  ];
});

describe('client chat — earlier conversations are separate and read-only (B3-S14)', () => {
  it('collapses the earlier conversations behind a labelled toggle; the current one stays in view', async () => {
    await renderThread('coach-b');
    const toggle = screen.getByTestId('message-history-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('Earlier conversations · read-only · 3');
    expect(screen.getByText('new coach: welcome')).toBeInTheDocument();
    expect(screen.queryByText('old coach: rest this week')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('old coach: rest this week')).toBeInTheDocument();
    expect(screen.getByText('legacy line')).toBeInTheDocument();
  });

  it("a new message is queued for the CURRENT coach's conversation", async () => {
    await renderThread('coach-b');
    fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'hello B' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('message-send'));
    });
    expect(queueMessage).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'client-1', coachId: 'coach-b', text: 'hello B' }));
  });

  it('with no coach right now: the history is shown read-only, with no composer', async () => {
    await renderThread(null);
    expect(screen.queryByTestId('message-input')).toBeNull();
    expect(screen.queryByTestId('message-history-toggle')).toBeNull();
    expect(screen.getByTestId('message-history')).toBeInTheDocument();
    expect(screen.getByText('new coach: welcome')).toBeInTheDocument();
  });

  it('with no coach and no history: renders nothing at all', async () => {
    threadMessages = [];
    const { container } = await renderThread(null);
    expect(container).toBeEmptyDOMElement();
  });
});
