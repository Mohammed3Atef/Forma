import { defineConfig } from 'vitest/config';

/**
 * Covers the `api/` tRPC layer only (see the tRPC migration plan) — real
 * Mongo round-trips via `mongodb-memory-server`, no mocks. There is no
 * frontend test suite; this is deliberately backend-only for now.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['api/**/*.test.ts'],
    testTimeout: 30_000, // mongodb-memory-server's first binary download/start can be slow
    hookTimeout: 60_000,
  },
});
