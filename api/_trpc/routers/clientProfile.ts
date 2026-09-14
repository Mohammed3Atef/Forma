import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { canReadClientData, canWriteCoachOwned, isActiveSelf, resolveClientId } from '../../client/_lib/access.js';
import { clientProfilesCol } from '../../client/_lib/db.js';
import { notify } from '../../client/_lib/notify.js';
import { usersCol } from '../../_lib/mongodb.js';
import type { AssessmentStatus, ClientProfileFields } from '../../client/_lib/types.js';

const ProfileFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  age: z.number().min(0).max(150),
  weightKg: z.number().min(0),
  heightCm: z.number().min(0),
  goal: z.enum(['muscle_gain', 'fat_loss', 'recomp', 'maintenance', 'strength']),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
  locale: z.enum(['en', 'ar', 'ar-eg']),
});

/**
 * The derived fitness profile — not coach-owned (`profile` is excluded from
 * `isCoachOwnedColl`), so BOTH the client (self, active) and the assigned
 * coach / admin(clients.writeAll) may write it.
 */
export const profileRouter = router({
  get: protectedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input?.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    const doc = await (await clientProfilesCol()).findOne({ _id: clientId });
    return doc?.profile ?? null;
  }),

  save: protectedProcedure
    .input(z.object({ clientId: z.string().optional() }).merge(ProfileFieldsSchema))
    .mutation(async ({ ctx, input }) => {
      const { clientId: inputClientId, ...body } = input;
      const clientId = resolveClientId(inputClientId, ctx.user);
      const allowed = isActiveSelf(ctx.user, clientId) || (await canWriteCoachOwned(ctx.user, clientId));
      if (!allowed) throw new TRPCError({ code: 'FORBIDDEN' });

      const col = await clientProfilesCol();
      const now = Date.now();
      const existing = await col.findOne({ _id: clientId });
      await col.updateOne(
        { _id: clientId },
        { $set: { clientId, profile: { id: clientId, ...body, createdAt: existing?.profile?.createdAt ?? now, updatedAt: now } as ClientProfileFields, updatedAt: now } },
        { upsert: true },
      );
      const updated = await col.findOne({ _id: clientId });
      return updated?.profile ?? null;
    }),
});

const Section = z.record(z.string(), z.unknown());
const BasicSection = z.record(z.string(), z.unknown()).and(z.object({ fullName: z.string().optional() }));

const DraftBody = z.object({
  basic: BasicSection.optional(),
  goals: Section.optional(),
  lifestyle: Section.optional(),
  training: Section.optional(),
  health: Section.optional(),
  nutrition: Section.optional(),
  motivation: Section.optional(),
  progressPhotos: Section.optional(),
  completionPercentage: z.number().optional(),
});

/**
 * The onboarding assessment. Read = owner/coach/admin(readAll); create = self
 * only; update = self ALWAYS (the "living assessment" — no lock-out after
 * review) OR assigned coach / admin(writeAll) for the review fields.
 */
export const assessmentRouter = router({
  get: protectedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input?.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    const doc = await (await clientProfilesCol()).findOne({ _id: clientId });
    return doc?.assessment ?? null;
  }),

  /** Client saves an in-progress draft (does not touch profile/main). */
  saveDraft: protectedProcedure
    .input(z.object({ clientId: z.string().optional() }).merge(DraftBody))
    .mutation(async ({ ctx, input }) => {
      const { clientId: inputClientId, ...patch } = input;
      const clientId = resolveClientId(inputClientId, ctx.user);
      if (!isActiveSelf(ctx.user, clientId)) throw new TRPCError({ code: 'FORBIDDEN' });
      const col = await clientProfilesCol();
      const now = Date.now();
      const set: Record<string, unknown> = { clientId, updatedAt: now, 'assessment.status': 'in_progress', 'assessment.completed': false, 'assessment.updatedAt': now };
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) set[`assessment.${k}`] = v;
      }
      await col.updateOne({ _id: clientId }, { $set: set }, { upsert: true });
      const updated = await col.findOne({ _id: clientId });
      return updated?.assessment ?? null;
    }),

  /** Submits the assessment AND the derived fitness profile atomically; syncs displayName; notifies the coach. */
  submit: protectedProcedure
    .input(
      z.object({
        clientId: z.string().optional(),
        assessment: z.object({
          basic: BasicSection,
          goals: Section,
          lifestyle: Section,
          training: Section,
          health: Section,
          nutrition: Section,
          motivation: Section,
          progressPhotos: Section,
          completionPercentage: z.number().optional(),
        }),
        profile: ProfileFieldsSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!isActiveSelf(ctx.user, clientId)) throw new TRPCError({ code: 'FORBIDDEN' });

      const col = await clientProfilesCol();
      const now = Date.now();
      const existing = await col.findOne({ _id: clientId });
      const prevAssessment = existing?.assessment;
      const wasReviewed = prevAssessment?.status === 'reviewed' || prevAssessment?.status === 'updated_after_review';
      const status: AssessmentStatus = wasReviewed ? 'updated_after_review' : 'submitted';
      const set: Record<string, unknown> = {
        clientId,
        updatedAt: now,
        assessment: {
          ...input.assessment,
          status,
          completed: true,
          completedAt: now,
          submittedAt: prevAssessment?.submittedAt ?? now,
          updatedAt: now,
          ...(prevAssessment?.coachNotes != null ? { coachNotes: prevAssessment.coachNotes } : {}),
          ...(prevAssessment?.reviewedAt != null ? { reviewedAt: prevAssessment.reviewedAt } : {}),
          ...(prevAssessment?.reviewedBy != null ? { reviewedBy: prevAssessment.reviewedBy } : {}),
        },
      };
      if (input.profile) {
        set.profile = { id: clientId, ...input.profile, createdAt: existing?.profile?.createdAt ?? now, updatedAt: now };
      }
      await col.updateOne({ _id: clientId }, { $set: set }, { upsert: true });

      const fullName = input.assessment.basic.fullName?.trim();
      if (fullName) {
        const users = await usersCol();
        await users.updateOne({ _id: clientId }, { $set: { displayName: fullName, displayNameLower: fullName.toLowerCase(), updatedAt: now } });
      }
      await notify({ clientId, forRole: 'coach', type: 'assessment_submitted', route: `/coach/client/${clientId}/assessment`, createdBy: clientId });

      const updated = await col.findOne({ _id: clientId });
      return updated?.assessment ?? null;
    }),

  /** Coach records review notes (merge, doesn't reset status). */
  setCoachNotes: protectedProcedure
    .input(z.object({ clientId: z.string().optional(), coachNotes: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const col = await clientProfilesCol();
      const now = Date.now();
      await col.updateOne({ _id: clientId }, { $set: { clientId, updatedAt: now, 'assessment.coachNotes': input.coachNotes, 'assessment.updatedAt': now } }, { upsert: true });
      const updated = await col.findOne({ _id: clientId });
      return updated?.assessment ?? null;
    }),

  /** Coach marks the assessment reviewed (locks further client edits until reset). */
  review: protectedProcedure.input(z.object({ clientId: z.string().optional() })).mutation(async ({ ctx, input }) => {
    const clientId = resolveClientId(input.clientId, ctx.user);
    if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    const col = await clientProfilesCol();
    const now = Date.now();
    await col.updateOne(
      { _id: clientId },
      { $set: { clientId, updatedAt: now, 'assessment.status': 'reviewed', 'assessment.reviewedAt': now, 'assessment.reviewedBy': ctx.user.id, 'assessment.updatedAt': now } },
      { upsert: true },
    );
    await notify({ clientId, forRole: 'client', type: 'assessment_reviewed', route: '/coach-notes', createdBy: ctx.user.id });
    const updated = await col.findOne({ _id: clientId });
    return updated?.assessment ?? null;
  }),

  /** Coach re-opens the assessment so the client can edit + resubmit. */
  reset: protectedProcedure.input(z.object({ clientId: z.string().optional() })).mutation(async ({ ctx, input }) => {
    const clientId = resolveClientId(input.clientId, ctx.user);
    if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    const col = await clientProfilesCol();
    const now = Date.now();
    await col.updateOne(
      { _id: clientId },
      { $set: { clientId, updatedAt: now, 'assessment.status': 'in_progress', 'assessment.completed': false, 'assessment.reviewedAt': null, 'assessment.reviewedBy': null, 'assessment.updatedAt': now } },
      { upsert: true },
    );
    const updated = await col.findOne({ _id: clientId });
    return updated?.assessment ?? null;
  }),
});
