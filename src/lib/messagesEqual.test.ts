import { describe, expect, it } from 'vitest';
import { messagesEqual } from './messagesEqual';
import type { Message } from '@/types';

function baseMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    clientId: 'c1',
    fromUserId: 'u1',
    fromRole: 'client',
    body: 'hello',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('messagesEqual', () => {
  it('treats an identical message as equal', () => {
    const a = baseMessage();
    const b = baseMessage();
    expect(messagesEqual(a, b)).toBe(true);
  });

  it('is true by reference without inspecting fields', () => {
    const a = baseMessage();
    expect(messagesEqual(a, a)).toBe(true);
  });

  it('detects a text edit', () => {
    const a = baseMessage({ body: 'hello' });
    const b = baseMessage({ body: 'hello there' });
    expect(messagesEqual(a, b)).toBe(false);
  });

  it('detects editedAt changing (edit marker appearing)', () => {
    const a = baseMessage({ editedAt: undefined });
    const b = baseMessage({ editedAt: 2000 });
    expect(messagesEqual(a, b)).toBe(false);
  });

  it('detects a soft-delete transition', () => {
    const a = baseMessage({ deletedAt: undefined });
    const b = baseMessage({ deletedAt: 3000 });
    expect(messagesEqual(a, b)).toBe(false);
  });

  it('detects a read-receipt transition (seenAt)', () => {
    const a = baseMessage({ seenAt: null });
    const b = baseMessage({ seenAt: 1500 });
    expect(messagesEqual(a, b)).toBe(false);
  });

  it('detects createdAt changing (affects the displayed timestamp and day grouping)', () => {
    const a = baseMessage({ createdAt: 1000 });
    const b = baseMessage({ createdAt: 1001 });
    expect(messagesEqual(a, b)).toBe(false);
  });

  it('detects fromRole changing (sender identity used by the bubble)', () => {
    const a = baseMessage({ fromRole: 'client' });
    const b = baseMessage({ fromRole: 'coach' });
    expect(messagesEqual(a, b)).toBe(false);
  });

  it('detects broadcast category appearing', () => {
    const a = baseMessage({ broadcast: undefined, category: undefined });
    const b = baseMessage({ broadcast: true, category: 'announcement' });
    expect(messagesEqual(a, b)).toBe(false);
  });

  it('detects an attachment being added', () => {
    const a = baseMessage({ attachment: undefined });
    const b = baseMessage({ attachment: { url: 'https://cdn/x.jpg', kind: 'image' } });
    expect(messagesEqual(a, b)).toBe(false);
  });

  it('detects an attachment url change (same kind/name)', () => {
    const a = baseMessage({ attachment: { url: 'https://cdn/x.jpg', kind: 'image', name: 'x.jpg' } });
    const b = baseMessage({ attachment: { url: 'https://cdn/y.jpg', kind: 'image', name: 'x.jpg' } });
    expect(messagesEqual(a, b)).toBe(false);
  });

  it('detects an attachment mimeType change (drives kind detection for legacy messages)', () => {
    const a = baseMessage({ attachment: { url: 'https://cdn/x', kind: 'file', mimeType: 'application/pdf' } });
    const b = baseMessage({ attachment: { url: 'https://cdn/x', kind: 'file', mimeType: 'image/svg+xml' } });
    expect(messagesEqual(a, b)).toBe(false);
  });

  it('ignores an attachment size change (never rendered by the bubble)', () => {
    const a = baseMessage({ attachment: { url: 'https://cdn/x.jpg', kind: 'image', size: 100 } });
    const b = baseMessage({ attachment: { url: 'https://cdn/x.jpg', kind: 'image', size: 999 } });
    expect(messagesEqual(a, b)).toBe(true);
  });

  it('treats missing reactions and an empty reactions object as equal', () => {
    const a = baseMessage({ reactions: undefined });
    const b = baseMessage({ reactions: {} });
    expect(messagesEqual(a, b)).toBe(true);
  });

  it('detects a reaction being added', () => {
    const a = baseMessage({ reactions: { u1: '👍' } });
    const b = baseMessage({ reactions: { u1: '👍', u2: '❤️' } });
    expect(messagesEqual(a, b)).toBe(false);
  });

  it('detects a reaction value changing for the same user (nested-value change, not just key presence)', () => {
    const a = baseMessage({ reactions: { u1: '👍' } });
    const b = baseMessage({ reactions: { u1: '❤️' } });
    expect(messagesEqual(a, b)).toBe(false);
  });

  it('is order-independent for reactions with identical key/value pairs', () => {
    const a = baseMessage({ reactions: { u1: '👍', u2: '❤️' } });
    const b = baseMessage({ reactions: { u2: '❤️', u1: '👍' } });
    expect(messagesEqual(a, b)).toBe(true);
  });

  it('ignores fields MessageRow never reads (clientId, fromUserId, updatedAt, clientMsgId)', () => {
    const a = baseMessage({ clientId: 'c1', fromUserId: 'u1', updatedAt: 1000, clientMsgId: 'k1' });
    const b = baseMessage({ clientId: 'c2', fromUserId: 'u2', updatedAt: 9999, clientMsgId: 'k2' });
    expect(messagesEqual(a, b)).toBe(true);
  });
});
