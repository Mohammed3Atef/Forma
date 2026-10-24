import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure } from '../trpc.js';
import { canReadClientData, canWriteCoachOwned, isActiveSelf, resolveClientId } from '../../client/_lib/access.js';
import { clientProfilesCol } from '../../client/_lib/db.js';
import { notify } from '../../client/_lib/notify.js';
import { resolveNotifications } from '../../messages/_handlers/notifications-data.js';
import { usersCol } from '../../_lib/mongodb.js';
import { coachClientsCol } from '../../coach-clients/_data.js';
import { writeAudit } from '../../admin/_lib/audit.js';
import type { AuthedUser } from '../context.js';
import type { AssessmentStatus, ClientAssessmentFields, ClientProfileDoc, ClientProfileFields } from '../../client/_lib/types.js';
import { CommercialReason } from '../../_lib/commercialReason.js';

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
 * `privateNotes`, outside the client-written `assessment` object, and every
 * assessment read returned to a client has `coachNotes` removed — including
 * legacy docs that still carry `assessment.coachNotes` (treated as private).
 *
 * B3.0.1 / B3-S02 (owner O-16): the note is AUTHOR-private. A coach gets back
 * (as `coachNotes`, same response shape) only their own note:
 *  - their entry in `privateNotes.assessmentByAuthor`, else
 *  - the legacy single note when its recorded author (`updatedBy`) is them, or
 *    when it has no author and the client has never had another coach.
 * An admin (oversight) gets the current coach's note (else the legacy one) —
 * audited whenever it is someone else's (owner R-1).
 */
async function assessmentForViewer(doc: ClientProfileDoc | null | undefined, viewer: AuthedUser): Promise<ClientAssessmentFields | null> {
  const a = doc?.assessment;
  if (!a) return null;
  const { coachNotes: legacyInline, ...rest } = a;
  if (viewer.role === 'client' || viewer.id === doc?.clientId || viewer.id === doc?._id) return rest as ClientAssessmentFields;
  const notes = await privateNoteFor(doc!, legacyInline, viewer);
  return (notes != null ? { ...rest, coachNotes: notes } : rest) as ClientAssessmentFields;
}

async function privateNoteFor(doc: ClientProfileDoc, legacyInline: string | undefined, viewer: AuthedUser): Promise<string | undefined> {
  const byAuthor = doc.privateNotes?.assessmentByAuthor ?? {};
  const legacy = doc.privateNotes?.assessment ?? legacyInline;
  const legacyBy = doc.privateNotes?.assessment != null ? doc.privateNotes.updatedBy : undefined;
  const clientId = doc.clientId ?? doc._id;
  if (viewer.role === 'coach') {
    const own = byAuthor[viewer.id];
    if (own) return own.text;
    if (legacy == null) return undefined;
    if (legacyBy) return legacyBy === viewer.id ? legacy : undefined;
    const others = await (await coachClientsCol()).countDocuments({ clientId, coachId: { $ne: viewer.id } });
    return others === 0 ? legacy : undefined;
  }
  // Admin oversight: the current coach's note, else the admin's own, else the legacy note.
  const current = await (await coachClientsCol()).findOne({ clientId, status: 'active' }, { projection: { coachId: 1 } });
  const fromCurrent = current ? byAuthor[current.coachId] : undefined;
  const pick = fromCurrent ?? byAuthor[viewer.id];
  const text = pick?.text ?? legacy;
  if (text != null && !(pick && pick === byAuthor[viewer.id])) {
    await writeAudit(viewer, 'assessment.readPrivateNote', clientId, { author: fromCurrent ? 'currentCoach' : 'legacy' });
  }
  return text;
}

/** Author ids become a Mongo field name — refuse anything that could address another path. */
function authorKey(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unsupported author id' });
  return id;
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
    return await assessmentForViewer(doc, ctx.user);
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
      // B3.9 (B3-S09): a draft never downgrades a REVIEWED assessment back to "in progress" (that
      // silently undid the coach's review); the client's resubmission marks it updated_after_review.
      const prev = (await col.findOne({ _id: clientId }, { projection: { 'assessment.status': 1 } }))?.assessment?.status;
      const reviewed = prev === 'reviewed' || prev === 'updated_after_review';
      const set: Record<string, unknown> = { clientId, updatedAt: now, 'assessment.updatedAt': now, ...(reviewed ? {} : { 'assessment.status': 'in_progress', 'assessment.completed': false }) };
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) set[`assessment.${k}`] = v;
      }
      await col.updateOne({ _id: clientId }, { $set: set }, { upsert: true });
      const updated = await col.findOne({ _id: clientId });
      return await assessmentForViewer(updated, ctx.user);
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
      return await assessmentForViewer(updated, ctx.user);
    }),

  /**
   * Coach records PRIVATE review notes (never returned to the client).
   * B3.0.1 / B3-S02: written to the caller's OWN entry — never over another
   * author's note. The caller's legacy single note (if they wrote it) is
   * superseded and removed; anyone else's legacy note is kept untouched.
   */
  setCoachNotes: authedProcedure
    .input(z.object({ clientId: z.string().optional(), coachNotes: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const clientId = resolveClientId(input.clientId, ctx.user);
      if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
      const col = await clientProfilesCol();
      const now = Date.now();
      const existing = await col.findOne({ _id: clientId });
      const set: Record<string, unknown> = { clientId, updatedAt: now, [`privateNotes.assessmentByAuthor.${authorKey(ctx.user.id)}`]: { text: input.coachNotes, updatedAt: now } };
      const unset: Record<string, ''> = {};
      // A pre-B0 inline note is moved (never deleted) into the legacy private slot, author unknown.
      if (existing?.assessment?.coachNotes != null) {
        if (existing.privateNotes?.assessment == null) set['privateNotes.assessment'] = existing.assessment.coachNotes;
        unset['assessment.coachNotes'] = '';
      }
      if (existing?.privateNotes?.assessment != null && existing.privateNotes.updatedBy === ctx.user.id) {
        unset['privateNotes.assessment'] = '';
        unset['privateNotes.updatedBy'] = '';
        unset['privateNotes.updatedAt'] = '';
      }
      await col.updateOne({ _id: clientId }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { upsert: true });
      const updated = await col.findOne({ _id: clientId });
      return await assessmentForViewer(updated, ctx.user);
    }),

  /**
   * Coach marks the assessment reviewed (locks further client edits until reset). B3.9 (B3-S09):
   * only a SUBMITTED (or resubmitted) assessment can be reviewed — a compare-and-set, never an upsert
   * (a client with no assessment, or a draft, is refused `ASSESSMENT_NOT_SUBMITTED`); reviewing an
   * already reviewed one changes and notifies nothing.
   */
  review: authedProcedure.input(z.object({ clientId: z.string().optional() })).mutation(async ({ ctx, input }) => {
    const clientId = resolveClientId(input.clientId, ctx.user);
    if (!(await canWriteCoachOwned(ctx.user, clientId))) throw new TRPCError({ code: 'FORBIDDEN' });
    const col = await clientProfilesCol();
    const now = Date.now();
    const done = await col.updateOne(
      { _id: clientId, 'assessment.status': { $in: ['submitted', 'updated_after_review'] } },
      { $set: { updatedAt: now, 'assessment.status': 'reviewed', 'assessment.reviewedAt': now, 'assessment.reviewedBy': ctx.user.id, 'assessment.updatedAt': now } },
    );
    if (done.modifiedCount === 0) {
      const current = await col.findOne({ _id: clientId });
      if (current?.assessment?.status === 'reviewed') return await assessmentForViewer(current, ctx.user);
      throw new TRPCError({ code: 'CONFLICT', message: 'The client has not submitted the assessment yet', cause: new CommercialReason('ASSESSMENT_NOT_SUBMITTED') });
    }
    await notify({ clientId, forRole: 'client', type: 'assessment_reviewed', route: '/coach-notes', createdBy: ctx.user.id });
    await resolveNotifications({ clientId, forRole: 'coach', type: 'assessment_submitted' });
    const updated = await col.findOne({ _id: clientId });
    return await assessmentForViewer(updated, ctx.user);
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
    return await assessmentForViewer(updated, ctx.user);
  }),
});
