import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Two projects:
 *  - `api`: the tRPC layer against real Mongo (`mongodb-memory-server`, no
 *    mocks) plus dependency-free pure logic under `src/lib/`.
 *  - `ui`: component/wiring tests (`src/**\/*.test.tsx`) under jsdom + Testing
 *    Library, with the same `@` alias and React plugin as the app build. These
 *    exist to prove that a control is wired to the right service/procedure
 *    and that the UI reflects the result — not for snapshots.
 *
 * Every api/ test file boots its own mongod (some a one-member replica set
 * for transactions). Running 13+ of them concurrently exhausts local
 * ports/sockets on a laptop and produced spurious ECONNREFUSED / "instance
 * closed unexpectedly" failures — a resource limit, not a test bug. One file
 * at a time keeps `npm run test` deterministic; each file still runs its own
 * cases as usual.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'api',
          environment: 'node',
          include: ['api/**/*.test.ts', 'src/lib/**/*.test.ts'],
          testTimeout: 30_000, // mongodb-memory-server's first binary download/start can be slow
          hookTimeout: 60_000,
        },
      },
      {
        plugins: [react()],
        resolve: {
          alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
        },
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
          testTimeout: 15_000,
        },
      },
    ],
  },
});
