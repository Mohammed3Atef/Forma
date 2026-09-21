import { defineConfig } from 'vitest/config';

/**
 * Covers the `api/` tRPC layer (real Mongo round-trips via
 * `mongodb-memory-server`, no mocks) plus dependency-free pure logic under
 * `src/lib/` that's worth unit-testing directly. There is otherwise no
 * broader frontend/component test suite; this stays deliberately narrow.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['api/**/*.test.ts', 'src/lib/**/*.test.ts'],
    testTimeout: 30_000, // mongodb-memory-server's first binary download/start can be slow
    hookTimeout: 60_000,
  },
});
