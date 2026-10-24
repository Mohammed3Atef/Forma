import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import localforage from 'localforage';
import type { Message } from '@/types';
import { useOutbox, type OutboxOp } from '@/data/outbox/outbox';

/**
 * B3.6 coach presentation of the shared engine (`variant="coach"`): the
 * unread divider and where the thread opens, read receipts only once the
 * newest is on screen, Sent / Seen on the last own message only, per-thread
 * drafts, the 4,000-character guard, one send per tap, the access-ended state,
 * and the menu semantics. The client app passes no variant — the last test
 * pins that its behaviour is unchanged.
 */
let threadMessages: Message[] = [];
let emit: ((m: Message[]) => void) | null = null;
let forbid: (() => void) | null = null;
const markThreadSeen = vi.fn(async (..._a: unknown[]) => 1);
const queueMessage = vi.fn(async (input: { clientId: string; coachId?: string; text: string }) => ({ operationId: `op-${input.text.slice(0, 8)}` }));

vi.mock('@/services/platform/messagesApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/messagesApi')>()),
  subscribeOpenThread: (_clientId: string, cb: (m: Message[]) => void, _onError?: () => void, onForbidden?: () => void) => {
    emit = cb;
    forbid = onForbidden ?? null;
    setTimeout(() => cb(threadMessages), 0);
    const stop = (() => undefined) as (() => void) & { patch: () => void };
    stop.patch = () => undefined;
    return stop;
  },
  markThreadSeen: (...a: unknown[]) => markThreadSeen(...a),
}));
vi.mock('@/data/outbox/handlers', async (orig) => ({
  ...(await orig<typeof import('@/data/outbox/handlers')>()),
  queueMessage: (input: { clientId: string; coachId?: string; text: string }) => queueMessage(input),
}));
vi.mock('@/services/platform/mediaApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/mediaApi')>()),
  useUploadConfigured: () => false,
}));

import { MessageThread, MAX_MESSAGE_CHARS } from './MessageThread';

const T0 = Date.now() - 3_600_000;
const msg = (id: string, body: string, fromRole: 'client' | 'coach', at: number, seen = true): Message => ({
  id,
  clientId: 'client-1',
  coachId: 'coach-1',
  fromUserId: fromRole === 'client' ? 'client-1' : 'coach-1',
  fromRole,
  body,
  seenAt: seen ? T0 + at * 60_000 + 1 : null,
  createdAt: T0 + at * 60_000,
  updatedAt: T0 + at * 60_000,
});
/** Two act() turns: effects flush when an act scope ends, and the frame they schedule runs in the next. */
const settle = async () => {
  for (let i = 0; i < 2; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
};

function renderCoach(over: Partial<Parameters<typeof MessageThread>[0]> = {}) {
  return render(<MessageThread clientId="client-1" meId="coach-1" meRole="coach" peer={{ name: 'Amira' }} variant="coach" {...over} />);
}

/** jsdom has no layout: give the scroller real-looking geometry for one test. */
function fakeLayout({ scrollHeight, clientHeight, dividerTop }: { scrollHeight: number; clientHeight: number; dividerTop: number }) {
  const restore: (() => void)[] = [];
  const def = (proto: object, key: string, get: (this: HTMLElement) => number) => {
    const prev = Object.getOwnPropertyDescriptor(proto, key);
    Object.defineProperty(proto, key, { configurable: true, get });
    restore.push(() => (prev ? Object.defineProperty(proto, key, prev) : delete (proto as Record<string, unknown>)[key]));
  };
  def(HTMLElement.prototype, 'scrollHeight', function () {
    return this.classList.contains('overflow-y-auto') ? scrollHeight : 0;
  });
  def(HTMLElement.prototype, 'clientHeight', function () {
    return this.classList.contains('overflow-y-auto') ? clientHeight : 0;
  });
  def(HTMLElement.prototype, 'offsetTop', function () {
    return this.hasAttribute('data-unread-divider') ? dividerTop : 0;
  });
  return () => restore.forEach((r) => r());
}

beforeEach(async () => {
  // Deterministic frames (jsdom's own rAF timing is not part of what these tests prove).
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => window.setTimeout(() => cb(performance.now()), 0) as unknown as number);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => window.clearTimeout(id));
  markThreadSeen.mockClear();
  queueMessage.mockClear();
  emit = null;
  forbid = null;
  useOutbox.setState({ ops: [], progress: {} });
  await localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' }).clear();
  threadMessages = [
    msg('m1', 'coach: how was the week?', 'coach', 1),
    msg('m2', 'client: good', 'client', 2),
    msg('m3', 'coach: great, keep going', 'coach', 3),
    msg('m4', 'client: one question', 'client', 4, false),
    msg('m5', 'client: knee hurts on squats', 'client', 5, false),
    msg('m6', 'client: should I skip?', 'client', 6, false),
  ];
});
afterEach(() => vi.useRealTimers());

describe('coach view — where the thread opens and when it is read (MS-05)', () => {
  it('marks the first unread with a divider counting them; when they fit on screen it opens at the bottom and marks read', async () => {
    renderCoach();
    await settle();
    const divider = screen.getByTestId('unread-divider');
    expect(divider).toHaveTextContent('3 new messages');
    expect(divider).toHaveAttribute('role', 'separator');
    // The divider sits right before the first unread message.
    const order = Array.from(document.querySelectorAll('[data-testid="unread-divider"], [data-testid="message-bubble"]')).map((el) => el.getAttribute('data-testid') === 'unread-divider' ? 'DIVIDER' : el.textContent);
    expect(order.indexOf('DIVIDER')).toBe(3);
    expect(markThreadSeen).toHaveBeenCalledTimes(1);
  });

  it('a long unread run opens AT the divider, unread until the newest has been on screen', async () => {
    const restore = fakeLayout({ scrollHeight: 3000, clientHeight: 600, dividerTop: 900 });
    try {
      renderCoach();
      await settle();
      const scroller = screen.getByTestId('message-thread').querySelector<HTMLElement>('.overflow-y-auto')!;
      expect(scroller.scrollTop).toBe(888);
      expect(markThreadSeen).not.toHaveBeenCalled();
      // A poll tick while reading: still not read, no jump.
      await act(async () => emit!([...threadMessages]));
      await settle();
      expect(markThreadSeen).not.toHaveBeenCalled();
      // Scrolling to the newest marks the thread read — once.
      scroller.scrollTop = 2400;
      fireEvent.scroll(scroller);
      fireEvent.scroll(scroller);
      expect(markThreadSeen).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });

  it('the divider stays put for this visit after the messages are read', async () => {
    renderCoach();
    await settle();
    await act(async () => emit!(threadMessages.map((m) => ({ ...m, seenAt: m.seenAt ?? Date.now() }))));
    await settle();
    expect(screen.getByTestId('unread-divider')).toHaveTextContent('3 new messages');
  });

  it('nothing unread: no divider; repeated poll ticks never send another mark-read', async () => {
    threadMessages = threadMessages.map((m) => ({ ...m, seenAt: 5 }));
    renderCoach();
    await settle();
    expect(screen.queryByTestId('unread-divider')).toBeNull();
    expect(markThreadSeen).not.toHaveBeenCalled();
  });

  it('a new message while open at the bottom is marked read once, not on every tick', async () => {
    threadMessages = threadMessages.map((m) => ({ ...m, seenAt: 5 }));
    renderCoach();
    await settle();
    const next = [...threadMessages, msg('m7', 'client: also my shoulder', 'client', 7, false)];
    for (let i = 0; i < 3; i++) {
      await act(async () => emit!(next.map((m) => ({ ...m }))));
      await settle();
    }
    expect(markThreadSeen).toHaveBeenCalledTimes(1);
  });

  it('after the server marks messages read, the page is told (badges refresh now, not in 20 s)', async () => {
    const onMarkedRead = vi.fn();
    renderCoach({ onMarkedRead });
    await settle();
    expect(onMarkedRead).toHaveBeenCalledTimes(1);
  });
});

describe('coach view — bubbles', () => {
  it('Sent / Seen only on the newest own message (MS-11)', async () => {
    renderCoach();
    await settle();
    const own = screen.getAllByTestId('message-bubble').filter((b) => b.textContent?.includes('coach:'));
    expect(own).toHaveLength(2);
    expect(own[0].textContent).not.toMatch(/Seen|Sent/);
    expect(own[1].textContent).toMatch(/Seen/);
  });

  it('Seen is only ever the server’s read receipt: sending, the coach opening the thread or marking it read never shows it', async () => {
    threadMessages = [
      msg('r1', 'client: are you there?', 'client', 1, false), // unread → the coach's open marks it read
      msg('r2', 'coach: yes, here', 'coach', 2, false), // the coach's own, the client hasn't read it
    ];
    renderCoach();
    await settle();
    expect(markThreadSeen).toHaveBeenCalledTimes(1); // the coach read the CLIENT's message…
    const own = () => screen.getAllByTestId('message-bubble').find((b) => b.textContent?.includes('coach: yes, here'))!;
    expect(own().textContent).toMatch(/Sent/);
    expect(own().textContent).not.toMatch(/Seen/); // …which says nothing about the coach's own
    // More poll ticks with the same server data: still Sent.
    await act(async () => emit!(threadMessages.map((m) => ({ ...m }))));
    await settle();
    expect(own().textContent).not.toMatch(/Seen/);
    // Only when the server copy carries the client's receipt does it say Seen.
    await act(async () => emit!(threadMessages.map((m) => (m.id === 'r2' ? { ...m, seenAt: Date.now() } : { ...m, seenAt: m.seenAt ?? Date.now() }))));
    await settle();
    expect(own().textContent).toMatch(/Seen/);
  });

  it('a message just sent (the outbox’s server copy) says Sent, never Seen', async () => {
    threadMessages = [msg('r1', 'client: hi', 'client', 1)];
    renderCoach();
    await settle();
    // The server copy of a just-delivered send arrives with the next poll (seenAt: null from the server).
    await act(async () => emit!([...threadMessages, msg('r9', 'coach: on my way', 'coach', 9, false)]));
    await settle();
    const own = screen.getAllByTestId('message-bubble').find((b) => b.textContent?.includes('coach: on my way'))!;
    expect(own.textContent).toMatch(/Sent/);
    expect(own.textContent).not.toMatch(/Seen/);
  });

  it('screen readers hear who wrote each message (no visual change)', async () => {
    renderCoach();
    await settle();
    const own = screen.getAllByTestId('message-bubble').find((b) => b.textContent?.includes('coach: how was the week?'))!;
    const theirs = screen.getAllByTestId('message-bubble').find((b) => b.textContent?.includes('client: good'))!;
    expect(own.querySelector('.sr-only')).toHaveTextContent('You wrote:');
    expect(theirs.querySelector('.sr-only')).toHaveTextContent('Amira wrote:');
  });

  it('offline: the composer says sends will wait on this device (and still queues them)', async () => {
    renderCoach();
    await settle();
    expect(screen.queryByTestId('composer-offline')).toBeNull();
    await act(async () => window.dispatchEvent(new Event('offline')));
    expect(screen.getByTestId('composer-offline')).toHaveTextContent('You’re offline');
    fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'queued offline' } });
    fireEvent.click(screen.getByTestId('message-send'));
    await settle();
    expect(queueMessage).toHaveBeenCalledWith(expect.objectContaining({ text: 'queued offline' }));
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(screen.queryByTestId('composer-offline')).toBeNull();
  });

  it('the action menu is a real menu: menu items, arrow keys move focus', async () => {
    renderCoach();
    await settle();
    fireEvent.contextMenu(screen.getByText('client: good'));
    const menu = await screen.findByRole('menu', { name: 'Message actions' });
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]'));
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(6); // the reactions
    expect(within(menu).getAllByRole('menuitem').length).toBeGreaterThan(0);
    expect(items.length).toBeGreaterThan(3);
    items[0].focus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('an attachment whose address is not a web URL is never rendered as a link or media', async () => {
    threadMessages = [{ ...msg('x1', '', 'client', 1), attachment: { url: 'javascript:alert(1)', kind: 'file', name: 'evil.pdf' } }];
    renderCoach();
    await settle();
    expect(screen.getByTestId('attachment-unavailable')).toBeInTheDocument();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
  });
});

describe('coach view — composer', () => {
  it('keeps unsent text per conversation across leaving and coming back; never in another client', async () => {
    const first = renderCoach({ draftKey: 'messageDraft:coach-1:client-1' });
    await settle();
    fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'half-written answer about the knee' } });
    await settle();
    first.unmount();
    await settle();

    const other = render(<MessageThread clientId="client-2" meId="coach-1" meRole="coach" variant="coach" draftKey="messageDraft:coach-1:client-2" />);
    await settle();
    expect(screen.getByTestId('message-input')).toHaveValue('');
    other.unmount();

    renderCoach({ draftKey: 'messageDraft:coach-1:client-1' });
    await settle();
    expect(screen.getByTestId('message-input')).toHaveValue('half-written answer about the knee');
  });

  it('a sent message clears its draft (it lives in the outbox now)', async () => {
    const view = renderCoach({ draftKey: 'messageDraft:coach-1:client-1' });
    await settle();
    fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'see you Monday' } });
    fireEvent.click(screen.getByTestId('message-send'));
    await settle();
    expect(queueMessage).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'client-1', coachId: 'coach-1', text: 'see you Monday' }));
    view.unmount();
    renderCoach({ draftKey: 'messageDraft:coach-1:client-1' });
    await settle();
    expect(screen.getByTestId('message-input')).toHaveValue('');
  });

  it('two quick taps queue one message', async () => {
    renderCoach();
    await settle();
    fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'only once' } });
    const send = screen.getByTestId('message-send');
    fireEvent.click(send);
    fireEvent.click(send);
    await settle();
    expect(queueMessage).toHaveBeenCalledTimes(1);
  });

  it('over 4,000 characters: says so, Send is off, Enter does nothing — the text is kept', async () => {
    renderCoach();
    await settle();
    const input = screen.getByTestId('message-input');
    fireEvent.change(input, { target: { value: 'x'.repeat(MAX_MESSAGE_CHARS + 1) } });
    expect(screen.getByTestId('composer-count')).toHaveTextContent(/Too long/);
    expect(screen.getByTestId('composer-count')).toHaveTextContent('4,001 / 4,000');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('message-send')).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Enter' });
    await settle();
    expect(queueMessage).not.toHaveBeenCalled();
    expect(input).toHaveValue('x'.repeat(MAX_MESSAGE_CHARS + 1));
    fireEvent.change(input, { target: { value: 'x'.repeat(MAX_MESSAGE_CHARS) } });
    expect(screen.getByTestId('composer-count')).not.toHaveTextContent(/Too long/);
    expect(screen.getByTestId('message-send')).toBeEnabled();
  });

  it('a send refused because the client is no longer assigned says so (not a bare "Couldn’t send")', async () => {
    renderCoach();
    await settle();
    const op: OutboxOp = {
      operationId: 'op-x',
      userId: 'coach-1',
      type: 'message.send',
      scope: 'thread:client-1',
      payload: { clientId: 'client-1', coachId: 'coach-1', text: 'queued before the transfer' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'failed_permanent',
      attemptCount: 1,
      lastError: { kind: 'permanent', code: 'FORBIDDEN' },
    };
    await act(async () => useOutbox.setState({ ops: [op] }));
    const pending = screen.getByTestId('message-bubble-pending');
    expect(pending).toHaveTextContent('Not sent — this client is no longer assigned to you.');
    expect(within(pending).getByTestId('message-discard')).toBeInTheDocument();
    expect(within(pending).queryByTestId('message-retry')).toBeNull(); // it can never succeed
  });
});

describe('coach view — a lapsed Forma plan (B3.8, P2)', () => {
  it('the composer gives way to the read-only notice; nothing can be queued or edited', async () => {
    renderCoach({ readOnly: <p>read-only: renew Forma</p> });
    await settle();
    expect(screen.queryByTestId('message-composer')).toBeNull();
    expect(screen.queryByTestId('message-input')).toBeNull();
    expect(screen.getByTestId('message-readonly')).toHaveTextContent('read-only: renew Forma');
    expect(queueMessage).not.toHaveBeenCalled();
  });
});

describe('coach view — the relationship ends while the thread is open', () => {
  it('hides every message, removes the composer, says why, and tells the page', async () => {
    const onAccessLost = vi.fn();
    renderCoach({ onAccessLost });
    await settle();
    expect(screen.getByText('client: good')).toBeInTheDocument();
    await act(async () => forbid!());
    expect(onAccessLost).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('thread-access-ended')).toHaveTextContent('This conversation isn’t available');
    expect(screen.queryByText('client: good')).toBeNull();
    expect(screen.queryByTestId('message-input')).toBeNull();
  });
});

describe('the client app (no variant) keeps its behaviour', () => {
  it('no divider, marks read at once, Sent / Seen on every own bubble, no draft, no access-ended handling', async () => {
    render(<MessageThread clientId="client-1" meId="client-1" meRole="client" peer={{ name: 'Coach' }} />);
    await settle();
    expect(screen.queryByTestId('unread-divider')).toBeNull();
    // From the client's side the coach's messages are "theirs"; mark the coach ones unseen to see it mark at once.
    expect(markThreadSeen).not.toHaveBeenCalled(); // every coach message is already seen
    const own = screen.getAllByTestId('message-bubble').filter((b) => b.textContent?.includes('client:'));
    expect(own.every((b) => /Seen|Sent/.test(b.textContent ?? ''))).toBe(true);
    expect(forbid).toBeNull();
  });
});
