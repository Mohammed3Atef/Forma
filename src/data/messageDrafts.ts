import localforage from 'localforage';

/**
 * Unsent composer text, one draft per account and conversation (B3.6 /
 * blueprint §6.5, MS-07): switching conversations, leaving Messages, a reload
 * or a failed queue never loses what was typed, and text typed for one client
 * can never surface in another client's composer — the key names both.
 * Same device store as the plan-editor drafts (`gym-tracker/meta`). Text
 * only: a picked attachment stays in the composer until Send, and once sent
 * the message itself lives in the durable outbox.
 */
const store = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });

export interface StoredMessageDraft {
  v: 1;
  text: string;
  savedAt: number;
}

export const messageDraftKey = (accountId: string, clientId: string) => `messageDraft:${accountId}:${clientId}`;

export async function readMessageDraft(key: string): Promise<string> {
  try {
    const d = await store.getItem<StoredMessageDraft>(key);
    return d && d.v === 1 && typeof d.text === 'string' ? d.text : '';
  } catch {
    return '';
  }
}

/** Saves the text, or removes the draft when it is blank. */
export async function writeMessageDraft(key: string, text: string): Promise<void> {
  try {
    if (text.trim()) await store.setItem<StoredMessageDraft>(key, { v: 1, text, savedAt: Date.now() });
    else await store.removeItem(key);
  } catch {
    /* storage unavailable — the composer still holds the text */
  }
}
