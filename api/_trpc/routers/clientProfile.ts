import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure } from '../trpc.js';
import { canReadClientData, canWriteCoachOwned, isActiveSelf, resolveClientId } from '../../client/_lib/access.js';
import { clientProfilesCol } from '../../client/_lib/db.js';
import { notify } from '../../client/_lib/notify.js';
import { resolveNotifications } from '../../messages/_handlers/notifications-data.js';
import { usersCol } from '../../_lib/mongodb.js';
import type { AssessmentStatus, ClientAssessmentFields, ClientProfileDoc, ClientProfileFields } from '../../client/_lib/types.js';

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
  get: authedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input?.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    const doc = await (await clientProfilesCol()).findOne({ _id: clientId });
    return doc?.profile ?? null;
  }),

  save: authedProcedure
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
 * B0 / CO-02: the coach's review notes are PRIVATE. They live in
 * `privateNotes.assessment`, outside the client-written `assessment` object,
 * and every assessment read returned to a client has `coachNotes` removed —
 * including legacy docs that still carry `assessment.coachNotes` (treated as
 * private). Coaches/admins get the private note back as `coachNotes`.
 */
function assessmentForViewer(doc: ClientProfileDoc | null | undefined, viewer: { id: string; role: string }): ClientAssessmentFields | null {
  const a = doc?.assessment;
  if (!a) return null;
  const { coachNotes: legacy, ...rest } = a;
  if (viewer.role === 'client' || viewer.id === doc?.clientId || viewer.id === doc?._id) return rest as ClientAssessmentFields;
  const notes = doc?.privateNotes?.assessment ?? legacy;
  return (notes != null ? { ...rest, coachNotes: notes } : rest) as ClientAssessmentFields;
}

/**
 * The onboarding assessment. Read = owner/coach/admin(readAll); create = self
 * only; update = self ALWAYS (the "living assessment" — no lock-out after
 * review) OR assigned coach / admin(writeAll) for the review fields.
 */
export const assessmentRouter = router({
  get: authedProcedure.input(z.object({ clientId: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const clientId = resolveClientId(input?.clientId, ctx.user);
    if (!(await canReadClientData(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    const doc = await (await clientProfilesCol()).findOne({ _id: clientId });
    return assessmentForViewer(doc, ctx.user);
  }),

  /** Client saves an in-progress draft (does not touch profile/main). */
  saveDraft: authedProcedure
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
      return assessmentForViewer(updated, ctx.user);
    }),

  /** Submits the assessment AND the derived fitness profile atomically; syncs displayName; notifies the coach. */
  submit: authedProcedure
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
          ...(prevAssessment?.reviewedAt != null ? { reviewedAt: prevAssessment.reviewedAt } : {}),
          ...(prevAssessment?.reviewedBy != null ? { reviewedBy: prevAssessment.reviewedBy } : {}),
        },
      };
      if (input.profile) {
        set.profile = { id: clientId, ...input.profile, createdAt: existing?.profile?.createdAt ?? now, updatedAt: now };
      }
      if (prevAssessment?.coachNotes != null && existing?.privateNotes?.assessment == null) {
        set['privateNotes.assessment'] = prevAssessment.coachNotes;
      }
      await col.updateOne({ _id: clientId }, { $set: set }, { upsert: true });

      const fullName = input.assessment.basic.fullName?.trim();
      if (fullName) {
        const users = await usersCol();
        await users.updateOne({ _id: clientId }, { $set: { displayName: fullName, displayNameLower: fullName.toLowerCase(), updatedAt: now } });
      }
      await notify({ clientId, forRole: 'coach', type: 'assessment_submitted', route: `/coach/client/${clientId}/assessment`, createdBy: clientId });

      const updated = await col.findOne({ _id: clientId });
      return assessmentForViewer(updated, ctx.user);
    }),

  /** Coach records PRIVATE review notes (never returned to the client). */
  setCoachNotes: authedProcedure
    .input(z.object({ clientId: z.string().optional(), coachNotes: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const col = await clientProfilesCol();
      const now = Date.now();
      await col.updateOne(
        { _id: clientId },
        { $set: { clientId, updatedAt: now, 'privateNotes.assessment': input.coachNotes, 'privateNotes.updatedAt': now, 'privateNotes.updatedBy': ctx.user.id }, $unset: { 'assessment.coachNotes': '' } },
        { upsert: true },
      );
      const updated = await col.findOne({ _id: clientId });
      return assessmentForViewer(updated, ctx.user);
    }),

  /** Coach marks the assessment reviewed (locks further client edits until reset). */
  review: authedProcedure.input(z.object({ clientId: z.string().optional() })).mutation(async ({ ctx, input }) => {
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
    await resolveNotifications({ clientId, forRole: 'coach', type: 'assessment_submitted' });
    const updated = await col.findOne({ _id: clientId });
    return assessmentForViewer(updated, ctx.user);
  }),

  /** Coach re-opens the assessment so the client can edit + resubmit. */
  reset: authedProcedure.input(z.object({ clientId: z.string().optional() })).mutation(async ({ ctx, input }) => {
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
    return assessmentForViewer(updated, ctx.user);
  }),
});
