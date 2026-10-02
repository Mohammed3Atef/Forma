import { test, expect, ready, shot, type Role } from '../fixtures';
import type { Page } from '@playwright/test';
import { bearerOf, mediaFetch, png, putsSince } from './_d-helpers';

/**
 * Media authorization from REAL browser sessions: every request is issued
 * from inside a signed-in page with that page's own bearer token (captured
 * from its own outgoing tRPC traffic), exactly what a malicious user could
 * do from DevTools.
 */
const PNG = [...png(8, 8)];

async function session(as: (r: Role) => Promise<{ page: Page }>, role: Role, path: string) {
  const { page } = await as(role);
  const bearer = await bearerOf(page, () => page.goto(path));
  await ready(page);
  return { page, bearer };
}

test('client cannot upload category=exercise (403)', async ({ as, db }, testInfo) => {
  const { page, bearer } = await session(as, 'clientA', '/');
  const before = (await db.bunnyPuts()).length;
  const r = await mediaFetch(page, 'upload', { query: { category: 'exercise' }, body: PNG, contentType: 'image/png', bearer });
  expect(r.status).toBe(403);
  const ri = await mediaFetch(page, 'init', { json: { category: 'exercise', mimeType: 'video/mp4', size: 9 * 1024 * 1024 }, bearer });
  expect(ri.status).toBe(403);
  expect(await putsSince(db, before)).toEqual([]);
  await testInfo.attach('responses.json', { body: JSON.stringify({ upload: r, init: ri }, null, 2), contentType: 'application/json' });
  await shot(page, testInfo, 'client-session');
});

test("coachB cannot upload a message attachment into clientA's thread (403)", async ({ as, db }, testInfo) => {
  const { page, bearer } = await session(as, 'coachB', '/coach/dashboard');
  const before = (await db.bunnyPuts()).length;
  const r = await mediaFetch(page, 'upload', { query: { category: 'message', clientId: 'e2e-client-a' }, body: PNG, contentType: 'image/png', bearer });
  expect(r.status).toBe(403);
  const ri = await mediaFetch(page, 'init', { json: { category: 'message', clientId: 'e2e-client-a', mimeType: 'application/pdf', size: 6 * 1024 * 1024 }, bearer });
  expect(ri.status).toBe(403);
  // Control: coachB CAN upload into its own client's thread.
  const ok = await mediaFetch(page, 'upload', { query: { category: 'message', clientId: 'e2e-client-b' }, body: PNG, contentType: 'image/png', bearer });
  expect(ok.status).toBe(200);
  const puts = await putsSince(db, before);
  expect(puts).toHaveLength(1);
  expect(puts[0].path).toMatch(/^Forma\/e2e-client-b\/messages\/[A-Za-z0-9_-]+\.png$/);
  await testInfo.attach('responses.json', { body: JSON.stringify({ forbidden: r, init: ri, own: ok, puts }, null, 2), contentType: 'application/json' });
  await shot(page, testInfo, 'coachB-session');
});

test('plain admin cannot upload a message attachment (403)', async ({ as, db }, testInfo) => {
  const { page, bearer } = await session(as, 'admin', '/admin');
  const before = (await db.bunnyPuts()).length;
  const r = await mediaFetch(page, 'upload', { query: { category: 'message', clientId: 'e2e-client-a' }, body: PNG, contentType: 'image/png', bearer });
  expect(r.status).toBe(403);
  expect(await putsSince(db, before)).toEqual([]);
  await testInfo.attach('responses.json', { body: JSON.stringify(r, null, 2), contentType: 'application/json' });
  await shot(page, testInfo, 'admin-session');
});

test('forged clientId / checkInId with ../ are rejected (400)', async ({ as, db }, testInfo) => {
  const { page, bearer } = await session(as, 'clientA', '/');
  const before = (await db.bunnyPuts()).length;
  const cases = {
    messageTraversal: await mediaFetch(page, 'upload', { query: { category: 'message', clientId: '../e2e-client-b' }, body: PNG, contentType: 'image/png', bearer }),
    messageSlash: await mediaFetch(page, 'upload', { query: { category: 'message', clientId: 'e2e-client-a/../../e2e-client-b' }, body: PNG, contentType: 'image/png', bearer }),
    checkinTraversal: await mediaFetch(page, 'upload', { query: { category: 'checkin', checkInId: '../../e2e-client-b/avatar' }, body: PNG, contentType: 'image/png', bearer }),
    checkinEncoded: await mediaFetch(page, 'upload', { query: { category: 'checkin', checkInId: '..%2F..%2Fx' }, body: PNG, contentType: 'image/png', bearer }),
    initTraversal: await mediaFetch(page, 'init', { json: { category: 'checkin', checkInId: '../x', mimeType: 'image/png', size: 5 * 1024 * 1024 }, bearer }),
  };
  for (const [k, v] of Object.entries(cases)) expect(v.status, k).toBe(400);
  expect(await putsSince(db, before)).toEqual([]);
  await testInfo.attach('responses.json', { body: JSON.stringify(cases, null, 2), contentType: 'application/json' });
});

test("self-category upload with someone else's clientId lands in the CALLER's folder", async ({ as, db }, testInfo) => {
  const { page, bearer } = await session(as, 'clientA', '/');
  const before = (await db.bunnyPuts()).length;
  const results = [];
  for (const category of ['progress', 'avatar', 'assessment']) {
    results.push(await mediaFetch(page, 'upload', { query: { category, clientId: 'e2e-client-b' }, body: PNG, contentType: 'image/png', bearer }));
  }
  results.push(await mediaFetch(page, 'upload', { query: { category: 'checkin', checkInId: 'ci-forged', clientId: 'e2e-client-b' }, body: PNG, contentType: 'image/png', bearer }));
  for (const r of results) expect(r.status).toBe(200);
  const puts = await putsSince(db, before);
  expect(puts).toHaveLength(4);
  for (const p of puts) expect(p.path.startsWith('Forma/e2e-client-a/')).toBe(true);
  expect(puts.some((p) => p.path.includes('e2e-client-b'))).toBe(false);
  await testInfo.attach('puts.json', { body: JSON.stringify({ results, puts }, null, 2), contentType: 'application/json' });
});

test('no session → 401 on every media action; no PUT', async ({ anon, db }, testInfo) => {
  const { page } = await anon();
  await page.goto('/login');
  const before = (await db.bunnyPuts()).length;
  const r = {
    upload: await mediaFetch(page, 'upload', { query: { category: 'progress' }, body: PNG, contentType: 'image/png' }),
    init: await mediaFetch(page, 'init', { json: { category: 'exercise', mimeType: 'video/mp4', size: 9e6 } }),
    chunk: await mediaFetch(page, 'chunk', { query: { uploadId: '00000000-0000-0000-0000-000000000000', index: '0' }, body: PNG }),
    finalize: await mediaFetch(page, 'finalize', { json: { uploadId: '00000000-0000-0000-0000-000000000000' } }),
    forgedBearer: await mediaFetch(page, 'upload', { query: { category: 'progress' }, body: PNG, contentType: 'image/png', bearer: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJlMmUtc3VwZXIifQ.x' }),
  };
  for (const [k, v] of Object.entries(r)) expect(v.status, k).toBe(401);
  expect(await putsSince(db, before)).toEqual([]);
  await testInfo.attach('responses.json', { body: JSON.stringify(r, null, 2), contentType: 'application/json' });
  await shot(page, testInfo, 'anon');
});

test("another user's chunked upload session cannot be written or finalized", async ({ as, db }, testInfo) => {
  const a = await session(as, 'coachA', '/coach/dashboard');
  const init = await mediaFetch(a.page, 'init', { json: { category: 'exercise', mimeType: 'video/mp4', size: 5 * 1024 * 1024 }, bearer: a.bearer });
  expect(init.status).toBe(200);
  const uploadId = String(init.json?.uploadId);
  const b = await session(as, 'coachB', '/coach/dashboard');
  const chunk = await mediaFetch(b.page, 'chunk', { query: { uploadId, index: '0' }, body: PNG, bearer: b.bearer });
  const fin = await mediaFetch(b.page, 'finalize', { json: { uploadId }, bearer: b.bearer });
  expect(chunk.status).toBe(404);
  expect(fin.status).toBe(404);
  await db.deleteMany('mediaUploads', { _id: uploadId });
  await testInfo.attach('responses.json', { body: JSON.stringify({ init, chunk, fin }, null, 2), contentType: 'application/json' });
});

test('server-side type and size limits hold even without the UI pre-checks', async ({ as, db }, testInfo) => {
  const { page, bearer } = await session(as, 'clientA', '/');
  const before = (await db.bunnyPuts()).length;
  const r = {
    svg: await mediaFetch(page, 'upload', { query: { category: 'progress' }, body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', contentType: 'image/svg+xml', bearer }),
    html: await mediaFetch(page, 'upload', { query: { category: 'message', clientId: 'e2e-client-a', name: 'x.html' }, body: '<script>alert(1)</script>', contentType: 'text/html', bearer }),
    htmlAsPdfName: await mediaFetch(page, 'upload', { query: { category: 'message', clientId: 'e2e-client-a', name: 'evil.html' }, body: '<script>alert(1)</script>', contentType: 'application/octet-stream', bearer }),
    avatarTooBig: await mediaFetch(page, 'init', { json: { category: 'avatar', mimeType: 'image/png', size: 2 * 1024 * 1024 + 1 }, bearer }),
    imageTooBig: await mediaFetch(page, 'init', { json: { category: 'progress', mimeType: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }, bearer }),
  };
  expect(r.svg.status).toBe(415);
  expect(r.html.status).toBe(415);
  expect(r.htmlAsPdfName.status).toBe(415);
  expect(r.avatarTooBig.status).toBe(413);
  expect(r.imageTooBig.status).toBe(413);
  expect(await putsSince(db, before)).toEqual([]);
  await testInfo.attach('responses.json', { body: JSON.stringify(r, null, 2), contentType: 'application/json' });
});

test('media.listImages: plain admin FORBIDDEN, super admin gets the list', async ({ as }, testInfo) => {
  const call = async (role: 'admin' | 'super', path: string) => {
    const { page, bearer } = await session(as, role, path);
    const res = await page.evaluate(async (auth) => {
      const r = await fetch('/api/trpc/media.listImages', { headers: { Authorization: auth } });
      return { status: r.status, body: await r.text() };
    }, bearer);
    return { page, res };
  };
  const admin = await call('admin', '/admin');
  expect(admin.res.status).toBe(403);
  expect(admin.res.body).toContain('FORBIDDEN');
  const sup = await call('super', '/admin');
  expect(sup.res.status).toBe(200);
  const parsed = JSON.parse(sup.res.body);
  const data = parsed.result?.data?.json ?? parsed.result?.data;
  expect(Array.isArray(data)).toBe(true);
  await testInfo.attach('responses.json', { body: JSON.stringify({ admin: admin.res, super: { status: sup.res.status, count: data.length, sample: data.slice(0, 3) } }, null, 2), contentType: 'application/json' });
  // The real gallery page for super admin renders.
  await sup.page.goto('/admin/media');
  await ready(sup.page);
  await shot(sup.page, testInfo, 'super-media-gallery');
});
