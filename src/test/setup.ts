import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
// Boots i18next with the English bundle so components render real copy
// (assertions use the same `t()` keys as the app, never hardcoded English).
import '@/i18n';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom lacks matchMedia (used by useMediaQuery / AnonymousApp standalone check).
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}
