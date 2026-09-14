import { router, publicProcedure } from '../trpc.js';

/**
 * Trivial plumbing-verification procedure — proves the adapter, context, and
 * (once auth migrates) cookie access work end-to-end before any real module
 * is ported. Not deleted after Phase 1: cheap to keep as a liveness check.
 */
export const healthRouter = router({
  ping: publicProcedure.query(() => ({ ok: true, at: Date.now() })),
});
