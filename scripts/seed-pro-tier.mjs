/**
 * One-time seed: creates the "Pro" paid tier (499 EGP/month, 25 clients,
 * signup-enabled, requires Super Admin payment confirmation) directly in
 * Mongo — the dashboard-only tier-creation flow (`AdminPlans.tsx`) still
 * works exactly the same afterwards; this just saves the first manual entry.
 * Safe to re-run: upserts by key, never touches any other tier.
 *
 *   node scripts/seed-pro-tier.mjs
 *
 * MONGODB_URI / MONGODB_DB are read from .env automatically (via dotenv).
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'forma';

if (!uri) {
  console.error('Set MONGODB_URI first.');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const tiers = db.collection('coachPlanTiers');

  const now = Date.now();
  const existing = await tiers.findOne({ _id: 'pro' });
  const doc = {
    _id: 'pro',
    label: 'Pro',
    maxClients: 25,
    priceMonthly: 499,
    currency: 'EGP',
    order: 1,
    active: true,
    archived: false,
    builtIn: false,
    publicVisible: true,
    signupEnabled: true,
    highlighted: true,
    isDefaultSignupPlan: false,
    marketingTitle: { en: 'Pro', ar: 'برو' },
    marketingDescription: {
      en: 'For coaches ready to grow past the trial.',
      ar: 'للمدربين المستعدين للنمو بعد فترة التجربة.',
    },
    marketingFeatures: {
      en: ['Up to 25 clients', 'Full workout & nutrition builder', 'Client messaging'],
      ar: ['حتى 25 عميلاً', 'إنشاء خطط تمارين وتغذية كاملة', 'مراسلة العملاء'],
    },
    requiresPaymentConfirmation: true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await tiers.updateOne({ _id: 'pro' }, { $set: doc }, { upsert: true });
  console.log(existing ? 'Updated the existing "pro" tier.' : 'Created the "pro" tier (499 EGP/month, 25 clients).');
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
