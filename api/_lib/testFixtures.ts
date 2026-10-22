import { getDb } from './mongodb.js';

/**
 * TEST FIXTURE ONLY (imported by `*.test.ts`; never by production code).
 *
 * Every real coach account has a Forma plan document: sign-up, admin creation and promotion write
 * it in the same transaction as the account (B3.8 final, B38F-R3), and a coach with NO plan is
 * read-only on the server (`NO_SUBSCRIPTION`). A test that creates a coach user directly must
 * therefore give it a plan too — this one: an active trial with room for clients. Upsert on insert
 * only, so it never overwrites a plan a test sets up itself.
 */
export async function ensureCoachPlan(coachId: string, over: Record<string, unknown> = {}): Promise<void> {
  const now = Date.now();
  await (await getDb()).collection<{ _id: string }>('coachPlans').updateOne(
    { _id: coachId },
    {
      $setOnInsert: {
        plan: 'trial',
        status: 'active',
        maxClients: 50,
        baseMaxClients: 50,
        addonClientCapacity: 0,
        manualCapacityAdjustment: 0,
        activeClientCount: 0,
        startedAt: now,
        endsAt: now + 30 * 86_400_000,
        history: [],
        createdAt: now,
        updatedAt: now,
        ...over,
      },
    },
    { upsert: true },
  );
}
