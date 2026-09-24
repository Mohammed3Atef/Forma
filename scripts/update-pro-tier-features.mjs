/**
 * One-time update: the "pro" tier was seeded (scripts/seed-pro-tier.mjs)
 * before the Core/Premium features split existed — its `marketingFeatures`
 * duplicated the app's baseline features, which now live in the shared Core
 * features list (edited from AdminPlans.tsx). This replaces Pro's own list
 * with just what Pro adds ON TOP of Core.
 *
 *   node scripts/update-pro-tier-features.mjs
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

  const marketingFeatures = {
    en: ['Business analytics dashboard', 'Reports & CSV exports', 'Revenue & subscription tracking', 'Exercise video uploads & bulk import'],
    ar: ['لوحة تحليلات الأعمال', 'تقارير وتصدير CSV', 'تتبع الإيرادات والاشتراكات', 'رفع فيديوهات التمارين واستيراد جماعي'],
  };

  const result = await tiers.updateOne({ _id: 'pro' }, { $set: { marketingFeatures, updatedAt: Date.now() } });
  console.log(result.matchedCount ? 'Updated "pro" tier premium features.' : 'No "pro" tier found — nothing to update.');
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
