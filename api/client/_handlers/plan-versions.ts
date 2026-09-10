import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { canReadClientData, canWriteCoachOwned, resolveClientId } from '../_lib/access.js';
import { planCollectionForKind, planVersionsCol } from '../_lib/db.js';
import type { PlanVersionDoc, PlanVersionKind } from '../_lib/types.js';

/**
 * Port of `planVersionsApi.listVersions/saveAsNewVersion/restoreVersion` —
 * plan version history at Firestore's `clientData/{clientId}/planVersions/{id}`.
 * `planVersions` is in `isCoachOwnedColl`: client read-only, coach/admin
 * (clients.writeAll) write. Saving/restoring a version also mirrors the
 * snapshot into the assigned singleton plan doc (`clientWorkoutPlans` etc.) —
 * that's the doc the client actually reads day to day.
 */
const KindEnum = z.enum(['workout', 'nutrition', 'cardio']);

const SaveBody = z.object({
  kind: KindEnum,
  plan: z.object({ name: z.string().optional() }).passthrough(),
  reason: z.string().trim().optional(),
});

const RestoreBody = z.object({ versionId: z.string() });

async function writeActivePlan(clientId: string, kind: PlanVersionKind, snapshot: Record<string, unknown>): Promise<void> {
  const col = await planCollectionForKind(kind);
  const now = Date.now();
  await col.replaceOne({ _id: clientId }, { _id: clientId, clientId, ...snapshot, updatedAt: now }, { upsert: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'POST');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);
    const col = await planVersionsCol();

    if (req.method === 'GET') {
      if (!(await canReadClientData(user, clientId))) throw new HttpError(403, 'Forbidden');
      const kindRaw = typeof req.query.kind === 'string' ? req.query.kind : undefined;
      const kind = kindRaw ? KindEnum.parse(kindRaw) : undefined;
      const filter: Record<string, unknown> = { clientId };
      if (kind) filter.kind = kind;
      const list = await col.find(filter).sort({ versionNumber: -1 }).toArray();
      res.status(200).json(list);
      return;
    }

    // POST — action-driven (default: save as new version).
    if (!(await canWriteCoachOwned(user, clientId))) throw new HttpError(403, 'Forbidden');
    const action = typeof req.query.action === 'string' ? req.query.action : 'save';

    if (action === 'restore') {
      const { versionId } = RestoreBody.parse(req.body);
      const version = await col.findOne({ _id: versionId, clientId });
      if (!version) throw new HttpError(404, 'Version not found');
      const all = await col.find({ clientId, kind: version.kind }).toArray();
      await Promise.all(all.map((v) => col.updateOne({ _id: v._id }, { $set: { active: v._id === version._id } })));
      await writeActivePlan(clientId, version.kind, version.snapshot);
      const updated = await col.findOne({ _id: versionId });
      res.status(200).json(updated);
      return;
    }

    // action === 'save' (default)
    const body = SaveBody.parse(req.body);
    const existing = await col.find({ clientId, kind: body.kind }).sort({ versionNumber: -1 }).toArray();
    const versionNumber = (existing[0]?.versionNumber ?? 0) + 1;
    const now = Date.now();
    const version: PlanVersionDoc = {
      _id: crypto.randomUUID(),
      clientId,
      kind: body.kind,
      versionNumber,
      name: body.plan.name || `${body.kind} v${versionNumber}`,
      createdAt: now,
      createdBy: user.id,
      snapshot: JSON.parse(JSON.stringify(body.plan)) as Record<string, unknown>,
      active: true,
    };
    if (body.reason) version.reason = body.reason;

    await Promise.all(existing.filter((v) => v.active).map((v) => col.updateOne({ _id: v._id }, { $set: { active: false } })));
    await col.insertOne(version);
    await writeActivePlan(clientId, body.kind, version.snapshot);

    res.status(201).json(version);
  } catch (e) {
    handleError(res, e);
  }
}
