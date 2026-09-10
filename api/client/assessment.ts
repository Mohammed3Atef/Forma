import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { usersCol } from '../_lib/mongodb';
import { requireUser } from '../_lib/withAuth';
import { HttpError, handleError, methodGuard } from '../_lib/http';
import { canReadClientData, canWriteCoachOwned, isActiveSelf, resolveClientId } from './_lib/access';
import { clientProfilesCol } from './_lib/db';
import { notify } from './_lib/notify';
import type { AssessmentStatus } from './_lib/types';

/**
 * Port of `clientCoachApi.saveAssessmentProgress/submitAssessment` and
 * `coachApi.setAssessmentCoachNotes/markAssessmentReviewed/resetAssessment` —
 * the onboarding assessment at Firestore's `clientData/{clientId}/profile/assessment`.
 * Per the dedicated rule block: read = owner/coach/admin(readAll); create =
 * self only; update = self ALWAYS (the "living assessment" — no lock-out after
 * review) OR assigned coach / admin(writeAll) for the review fields.
 */
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

const SubmitBody = z.object({
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
  profile: z
    .object({
      name: z.string().trim().min(1).max(200),
      age: z.number().min(0).max(150),
      weightKg: z.number().min(0),
      heightCm: z.number().min(0),
      goal: z.enum(['muscle_gain', 'fat_loss', 'recomp', 'maintenance', 'strength']),
      activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
      locale: z.enum(['en', 'ar', 'ar-eg']),
    })
    .optional(),
});

const NotesBody = z.object({ coachNotes: z.string() });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'PUT', 'POST');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);
    const col = await clientProfilesCol();

    if (req.method === 'GET') {
      if (!(await canReadClientData(user, clientId))) throw new HttpError(403, 'Forbidden');
      const doc = await col.findOne({ _id: clientId });
      res.status(200).json(doc?.assessment ?? null);
      return;
    }

    if (req.method === 'PUT') {
      // Client saves an in-progress draft (does not touch profile/main).
      if (!isActiveSelf(user, clientId)) throw new HttpError(403, 'Forbidden');
      const patch = DraftBody.parse(req.body);
      const now = Date.now();
      const set: Record<string, unknown> = { clientId, updatedAt: now, 'assessment.status': 'in_progress', 'assessment.completed': false, 'assessment.updatedAt': now };
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) set[`assessment.${k}`] = v;
      }
      await col.updateOne({ _id: clientId }, { $set: set }, { upsert: true });
      const updated = await col.findOne({ _id: clientId });
      res.status(200).json(updated?.assessment ?? null);
      return;
    }

    // POST — action-driven.
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;

    if (action === 'submit') {
      if (!isActiveSelf(user, clientId)) throw new HttpError(403, 'Forbidden');
      const body = SubmitBody.parse(req.body);
      const now = Date.now();
      const existing = await col.findOne({ _id: clientId });
      const prevAssessment = existing?.assessment;
      const wasReviewed = prevAssessment?.status === 'reviewed' || prevAssessment?.status === 'updated_after_review';
      const status: AssessmentStatus = wasReviewed ? 'updated_after_review' : 'submitted';
      const set: Record<string, unknown> = {
        clientId,
        updatedAt: now,
        assessment: {
          ...body.assessment,
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
      if (body.profile) {
        set.profile = { id: clientId, ...body.profile, createdAt: existing?.profile?.createdAt ?? now, updatedAt: now };
      }
      await col.updateOne({ _id: clientId }, { $set: set }, { upsert: true });

      const fullName = body.assessment.basic.fullName?.trim();
      if (fullName) {
        const users = await usersCol();
        await users.updateOne({ _id: clientId }, { $set: { displayName: fullName, displayNameLower: fullName.toLowerCase(), updatedAt: now } });
      }
      await notify({ clientId, forRole: 'coach', type: 'assessment_submitted', route: `/coach/client/${clientId}/assessment`, createdBy: clientId });

      const updated = await col.findOne({ _id: clientId });
      res.status(200).json(updated?.assessment ?? null);
      return;
    }

    if (action === 'notes') {
      if (!(await canWriteCoachOwned(user, clientId))) throw new HttpError(403, 'Forbidden');
      const body = NotesBody.parse(req.body);
      const now = Date.now();
      await col.updateOne({ _id: clientId }, { $set: { clientId, updatedAt: now, 'assessment.coachNotes': body.coachNotes, 'assessment.updatedAt': now } }, { upsert: true });
      const updated = await col.findOne({ _id: clientId });
      res.status(200).json(updated?.assessment ?? null);
      return;
    }

    if (action === 'review') {
      if (!(await canWriteCoachOwned(user, clientId))) throw new HttpError(403, 'Forbidden');
      const now = Date.now();
      await col.updateOne(
        { _id: clientId },
        { $set: { clientId, updatedAt: now, 'assessment.status': 'reviewed', 'assessment.reviewedAt': now, 'assessment.reviewedBy': user.id, 'assessment.updatedAt': now } },
        { upsert: true },
      );
      await notify({ clientId, forRole: 'client', type: 'assessment_reviewed', route: '/coach-notes', createdBy: user.id });
      const updated = await col.findOne({ _id: clientId });
      res.status(200).json(updated?.assessment ?? null);
      return;
    }

    if (action === 'reset') {
      if (!(await canWriteCoachOwned(user, clientId))) throw new HttpError(403, 'Forbidden');
      const now = Date.now();
      await col.updateOne(
        { _id: clientId },
        {
          $set: {
            clientId,
            updatedAt: now,
            'assessment.status': 'in_progress',
            'assessment.completed': false,
            'assessment.reviewedAt': null,
            'assessment.reviewedBy': null,
            'assessment.updatedAt': now,
          },
        },
        { upsert: true },
      );
      const updated = await col.findOne({ _id: clientId });
      res.status(200).json(updated?.assessment ?? null);
      return;
    }

    throw new HttpError(400, 'Unknown action');
  } catch (e) {
    handleError(res, e);
  }
}
