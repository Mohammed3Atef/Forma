import { ClientSession, Collection, Db, MongoClient } from 'mongodb';
import type { PasswordResetDoc, RefreshTokenDoc, UserDoc } from './types.js';

/**
 * Cached Mongo connection, reused across warm serverless invocations. Vercel
 * keeps a function's container warm between requests and re-runs the same
 * module instance, so a module-level cache here avoids opening a new
 * connection (and hitting Atlas's connection limit) on every request. Only a
 * cold start pays the connect() cost.
 *
 * Do not create a `new MongoClient(...)` anywhere else — always go through
 * `getDb()` / the collection helpers below.
 */
let clientPromise: Promise<MongoClient> | null = null;
let cachedDb: Db | null = null;

export async function getDb(): Promise<Db> {
  if (cachedDb) return cachedDb;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  if (!clientPromise) {
    const client = new MongoClient(uri, { maxPoolSize: 10 });
    clientPromise = client.connect();
  }
  const client = await clientPromise;
  cachedDb = client.db(process.env.MONGODB_DB || 'forma');
  return cachedDb;
}

export async function usersCol(): Promise<Collection<UserDoc>> {
  return (await getDb()).collection<UserDoc>('users');
}

export async function refreshTokensCol(): Promise<Collection<RefreshTokenDoc>> {
  return (await getDb()).collection<RefreshTokenDoc>('refreshTokens');
}

export async function passwordResetsCol(): Promise<Collection<PasswordResetDoc>> {
  return (await getDb()).collection<PasswordResetDoc>('passwordResets');
}

/**
 * Runs `fn` inside a real Mongo multi-document transaction (Atlas runs every
 * tier, including free/shared, as a replica set — confirmed working against
 * this project's own cluster). Every collection write INSIDE `fn` must pass
 * the given `session` in its options (`{ session }`) or it commits
 * immediately, outside the transaction, silently breaking atomicity — see
 * `auth.signup` / `coachPlanRequests.confirm` for the pattern. Used for
 * signup (User + Trial CoachPlan + optional paid CoachPlanRequest) and for
 * confirming a paid plan request (request resolution + CoachPlanDoc
 * snapshot-apply) — both must reach an all-or-nothing final state.
 */
export async function withDbTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  if (!clientPromise) {
    const client = new MongoClient(uri, { maxPoolSize: 10 });
    clientPromise = client.connect();
  }
  const client = await clientPromise;
  const session = client.startSession();
  try {
    return await session.withTransaction(() => fn(session));
  } finally {
    await session.endSession();
  }
}
