/**
 * Creates the first super_admin account directly in Mongo. Admin/super_admin
 * accounts are never self-service (mirrors the Firestore-era rule that no one
 * can promote themselves to admin) — this script is the only way to bootstrap
 * one on a fresh database.
 *
 *   ADMIN_EMAIL=you@example.com \
 *   ADMIN_PASSWORD="…" \
 *   ADMIN_NAME="Your Name" \
 *   node scripts/seed-mongo-admin.mjs [--dry-run]
 *
 * MONGODB_URI / MONGODB_DB are read from .env automatically (via dotenv).
 * Safe to re-run: skips (does not overwrite) if the email already exists.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

const DRY = process.argv.includes('--dry-run');
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'forma';
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || 'Admin';

if (!uri || !email || !password) {
  console.error('Set MONGODB_URI, ADMIN_EMAIL, and ADMIN_PASSWORD first.');
  process.exit(1);
}
if (password.length < 8) {
  console.error('ADMIN_PASSWORD must be at least 8 characters.');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const users = db.collection('users');

  const existing = await users.findOne({ emailLower: email });
  if (existing) {
    console.log(`Account already exists for ${email} (role: ${existing.role}, status: ${existing.accountStatus}) — nothing to do.`);
    await client.close();
    return;
  }

  const now = Date.now();
  const doc = {
    _id: crypto.randomUUID(),
    email,
    emailLower: email,
    passwordHash: await bcrypt.hash(password, 12),
    displayName: name,
    displayNameLower: name.toLowerCase(),
    role: 'super_admin',
    accountStatus: 'active',
    permissions: [],
    featureFlags: {},
    createdBy: 'seed-script',
    createdAt: now,
    updatedAt: now,
  };

  if (DRY) {
    console.log('[dry-run] would create super_admin:', { email: doc.email, displayName: doc.displayName });
  } else {
    await users.insertOne(doc);
    console.log(`Created super_admin ${email}.`);
  }
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
