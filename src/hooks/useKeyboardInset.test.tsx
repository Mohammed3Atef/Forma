import { describe, expect, it } from 'vitest';
import { keyboardInset } from './useKeyboardInset';

describe('keyboard inset (B3.5 — the editors\' save bar stays above the on-screen keyboard)', () => {
  it('is the height the keyboard covers below the visual viewport', () => {
    expect(keyboardInset(844, { height: 500, offsetTop: 0 })).toBe(344);
    expect(keyboardInset(844, { height: 500, offsetTop: 40 })).toBe(304); // the page scrolled under the keyboard
  });
  it('is 0 when closed, for browser-chrome jitter, or without the Visual Viewport API', () => {
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(844, { height: 790, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(844, null)).toBe(0);
  });
});
