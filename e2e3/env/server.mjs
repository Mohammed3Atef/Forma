/**
 * Isolated browser-E2E environment for Phase 3. NOTHING here touches a shared
 * or production system:
 *
 *   - MongoDB: a fresh in-memory replica set (transactions work), seeded below.
 *   - Email:   RESEND_API_KEY forced to '' → every send is a logged no-op.
 *   - Bunny:   a local Bunny-compatible stand-in (PUT/list/GET) on STUB_PORT;
 *              files land under the run's output folder, never on a real zone.
 *   - App:     `vite dev` (the full tRPC + media + cron API runs in-process).
 *
 * Every env var the app reads is set EXPLICITLY here; vite.config's
 * `dotenv/config` never overrides an already-set variable, so the real
 * `.env` (Atlas / Resend / Bunny) cannot leak in. The identity of what is
 * running is written to `<runDir>/env.json` and printed.
 *
 *   node e2e3/env/server.mjs            (Playwright's webServer starts this)
 *   E2E_PORT=5199 E2E_STUB_PORT=5299 E2E_RUN_DIR=e2e-out/<run>
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { SEED } from './seed-data.mjs';

const PORT = Number(process.env.E2E_PORT ?? 5199);
const STUB_PORT = Number(process.env.E2E_STUB_PORT ?? 5299);
const RUN_DIR = path.resolve(process.env.E2E_RUN_DIR ?? `e2e-out/manual-${Date.now()}`);
const DB_NAME = 'forma_e2e';
fs.mkdirSync(RUN_DIR, { recursive: true });
const STUB_DIR = path.join(RUN_DIR, 'bunny-stub');
fs.mkdirSync(STUB_DIR, { recursive: true });

// ---- Bunny stand-in -----------------------------------------------------
// /storage/<zone>/<path>  PUT (AccessKey checked) · GET dir listing
// /cdn/<path>             GET the stored bytes (what the app renders)
const STUB_KEY = 'e2e-stub-key-not-a-real-bunny-password';
const ZONE = 'e2e-zone';
const putLog = [];
let db; // set once Mongo is up (the control API below needs it)
const ALLOWED_OPS = new Set(['findOne', 'find', 'countDocuments', 'updateOne', 'updateMany', 'insertOne', 'insertMany', 'deleteOne', 'deleteMany']);
const stub = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${STUB_PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  // ---- Test control API (localhost, this test-only process only) ----
  if (url.pathname.startsWith('/__e2e/') && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        if (url.pathname === '/__e2e/session') {
          const raw = crypto.randomBytes(48).toString('hex');
          await db.collection('refreshTokens').insertOne({
            _id: crypto.createHash('sha256').update(raw).digest('hex'),
            userId: body.userId,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 86_400_000),
            revoked: false,
          });
          return res.end(JSON.stringify({ raw }));
        }
        if (url.pathname === '/__e2e/reset-token') {
          const raw = crypto.randomBytes(32).toString('hex');
          await db.collection('passwordResets').insertOne({
            _id: crypto.createHash('sha256').update(raw).digest('hex'),
            userId: body.userId,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 3600_000),
            used: false,
          });
          return res.end(JSON.stringify({ raw }));
        }
        if (url.pathname === '/__e2e/db') {
          if (!ALLOWED_OPS.has(body.op)) throw new Error(`op not allowed: ${body.op}`);
          const col = db.collection(body.collection);
          let out;
          if (body.op === 'find') out = await col.find(body.filter ?? {}).sort(body.sort ?? {}).limit(body.limit ?? 500).toArray();
          else if (body.op === 'findOne' || body.op === 'countDocuments' || body.op === 'deleteOne' || body.op === 'deleteMany') out = await col[body.op](body.filter ?? {});
          else if (body.op === 'insertOne' || body.op === 'insertMany') out = await col[body.op](body.doc);
          else out = await col[body.op](body.filter ?? {}, body.update);
          return res.end(JSON.stringify({ ok: true, out }));
        }
        if (url.pathname === '/__e2e/bunny-puts') return res.end(JSON.stringify(putLog));
        res.statusCode = 404;
        res.end('{}');
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }
  if (url.pathname.startsWith(`/storage/${ZONE}/`)) {
    if (req.headers.accesskey !== STUB_KEY) {
      res.statusCode = 401;
      return res.end('bad key');
    }
    const rel = decodeURIComponent(url.pathname.slice(`/storage/${ZONE}/`.length));
    const file = path.join(STUB_DIR, rel);
    if (!file.startsWith(STUB_DIR)) {
      res.statusCode = 400;
      return res.end('traversal');
    }
    if (req.method === 'PUT') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const buf = Buffer.concat(chunks);
        fs.writeFileSync(file, buf);
        putLog.push({ path: rel, bytes: buf.length, contentType: req.headers['content-type'], at: Date.now() });
        fs.writeFileSync(path.join(RUN_DIR, 'bunny-puts.json'), JSON.stringify(putLog, null, 2));
        res.statusCode = 201;
        res.end('{}');
      });
      return;
    }
    if (req.method === 'GET') {
      const dir = file;
      const items = fs.existsSync(dir) && fs.statSync(dir).isDirectory()
        ? fs.readdirSync(dir).map((name) => {
            const st = fs.statSync(path.join(dir, name));
            return { ObjectName: name, IsDirectory: st.isDirectory(), Length: st.size, LastChanged: st.mtime.toISOString() };
          })
        : [];
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(items));
    }
  }
  if (url.pathname.startsWith('/cdn/') && req.method === 'GET') {
    const file = path.join(STUB_DIR, decodeURIComponent(url.pathname.slice(5)));
    if (file.startsWith(STUB_DIR) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const put = putLog.find((p) => path.join(STUB_DIR, p.path) === file);
      res.setHeader('Content-Type', put?.contentType ?? 'application/octet-stream');
      return res.end(fs.readFileSync(file));
    }
    res.statusCode = 404;
    return res.end('not found');
  }
  res.statusCode = 404;
  res.end('not found');
});
await new Promise((r) => stub.listen(STUB_PORT, '127.0.0.1', r));

// ---- Mongo -------------------------------------------------------------
// DB files live INSIDE this run's output folder (not the OS temp dir): on
// Windows the webServer is hard-killed at the end of a run, so the
// in-memory server's own cleanup never runs and temp dirs piled up (~200 MB
// each) until the system drive filled.
const DB_PATH = path.join(RUN_DIR, 'mongo-data');
fs.mkdirSync(DB_PATH, { recursive: true });
const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ dbPath: DB_PATH }] });
const MONGO_URI = mongod.getUri();
const client = new MongoClient(MONGO_URI);
await client.connect();
db = client.db(DB_NAME);
await seed(db);

// ---- App ---------------------------------------------------------------
const env = {
  ...process.env,
  NODE_ENV: 'development',
  MONGODB_URI: MONGO_URI,
  MONGODB_DB: DB_NAME,
  JWT_ACCESS_SECRET: 'e2e-jwt-secret-' + crypto.randomBytes(8).toString('hex'),
  CRON_SECRET: 'e2e-cron-secret',
  RESEND_API_KEY: '',
  RESEND_FROM_EMAIL: '',
  GOOGLE_CLIENT_ID: '',
  // Frontend public config from the real .env must not leak in either
  // (Google button with the production client id, live analytics script).
  VITE_GOOGLE_CLIENT_ID: '',
  VITE_ANALYTICS_SRC: '',
  VITE_ANALYTICS_DATA: '',
  BUNNY_STORAGE_ZONE: ZONE,
  BUNNY_API_KEY: STUB_KEY,
  BUNNY_CDN_URL: `http://127.0.0.1:${STUB_PORT}/cdn`,
  BUNNY_STORAGE_REGION: '',
  BUNNY_STORAGE_ENDPOINT: `http://127.0.0.1:${STUB_PORT}/storage`,
  APP_BASE_URL: `http://127.0.0.1:${PORT}`,
  E2E_VITE_CACHE_DIR: `node_modules/.vite-e2e-${PORT}`,
};
const manifest = {
  baseURL: `http://127.0.0.1:${PORT}`,
  mongoUri: MONGO_URI,
  dbName: DB_NAME,
  jwtSecret: env.JWT_ACCESS_SECRET,
  cronSecret: env.CRON_SECRET,
  bunny: { mode: 'local stand-in (no real zone)', storage: env.BUNNY_STORAGE_ENDPOINT, cdn: env.BUNNY_CDN_URL, zone: ZONE, dir: STUB_DIR },
  email: 'disabled (RESEND_API_KEY="")',
  accounts: Object.fromEntries(Object.entries(SEED.users).map(([k, u]) => [k, { id: u._id, email: u.email, role: u.role }])),
  password: SEED.password,
  startedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(RUN_DIR, 'env.json'), JSON.stringify(manifest, null, 2));
// Also at a fixed path so specs (separate processes) can find the current run.
fs.mkdirSync('e2e-out', { recursive: true });
fs.writeFileSync(path.join('e2e-out', `current-env-${PORT}.json`), JSON.stringify({ ...manifest, runDir: RUN_DIR }, null, 2));
console.log('[e2e-env] ISOLATED ENVIRONMENT', JSON.stringify({ baseURL: manifest.baseURL, db: `${MONGO_URI} / ${DB_NAME} (in-memory)`, bunny: manifest.bunny.mode, email: manifest.email, runDir: RUN_DIR }));

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const logFile = fs.createWriteStream(path.join(RUN_DIR, 'server.log'));
vite.stdout.pipe(logFile);
vite.stderr.pipe(logFile);
vite.stdout.on('data', (d) => process.stdout.write(d));
vite.stderr.on('data', (d) => process.stderr.write(d));

const shutdown = async () => {
  vite.kill();
  stub.close();
  await client.close().catch(() => undefined);
  await mongod.stop().catch(() => undefined);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
vite.on('exit', shutdown);

// ---- seed --------------------------------------------------------------
async function seed(d) {
  const now = Date.now();
  const hash = await bcrypt.hash(SEED.password, 10);
  await d.collection('users').createIndex({ emailLower: 1 }, { unique: true });
  for (const u of Object.values(SEED.users)) {
    await d.collection('users').insertOne({
      permissions: [],
      featureFlags: {},
      createdBy: 'e2e-seed',
      accountStatus: 'active',
      createdAt: now - 30 * 86_400_000,
      updatedAt: now,
      ...u,
      emailLower: u.email.toLowerCase(),
      displayNameLower: u.displayName.toLowerCase(),
      passwordHash: hash,
    });
  }
  await d.collection('coachPlanTiers').insertMany(SEED.tiers.map((t) => ({ ...t, createdAt: now, updatedAt: now })));
  await d.collection('coachCapacityPackages').insertMany(SEED.capacityPackages.map((p) => ({ ...p, createdAt: now, updatedAt: now })));
  for (const p of SEED.plans(now)) await d.collection('coachPlans').insertOne(p);
  for (const r of SEED.relationships(now)) await d.collection('coachClients').insertOne(r);
  for (const p of SEED.clientProfiles(now)) await d.collection('clientProfiles').insertOne(p);
}
