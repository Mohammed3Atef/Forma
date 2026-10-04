import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../trpc.js';
import { enforceRateLimit, getClientIp } from '../../_lib/rateLimit.js';
import { sendContactEmail } from '../../_lib/email.js';

const CONTACT_MAX_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Public-website contact form (src/pages/website — the design's Contact page).
 * Mirrors the page's client-side rules, plus a honeypot field (`website`)
 * that people never see. On any delivery failure the caller gets
 * CONTACT_UNAVAILABLE and the page opens the visitor's mail app instead.
 */
const contactInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).optional().default(''),
  role: z.string().trim().min(1).max(80),
  reason: z.enum(['use', 'question', 'support', 'partner', 'other']),
  message: z.string().trim().min(10).max(5000),
  website: z.string().max(0, 'honeypot').optional().default(''),
});

export const contactRouter = router({
  submit: publicProcedure.input(contactInput).mutation(async ({ input, ctx }) => {
    await enforceRateLimit('contact.submit', getClientIp(ctx.req), CONTACT_MAX_PER_HOUR, HOUR_MS);
    try {
      await sendContactEmail({
        name: input.name,
        email: input.email,
        phone: input.phone || undefined,
        role: input.role,
        reason: input.reason,
        message: input.message,
      });
    } catch (err) {
      console.error('[contact] delivery failed:', err instanceof Error ? err.message : err);
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'CONTACT_UNAVAILABLE' });
    }
    return { ok: true as const };
  }),
});
