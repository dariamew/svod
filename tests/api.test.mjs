import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
test('Full local workflow: sessions, imports, ownership, selections and persistence', { timeout: 60000 }, async t => {
  const results = path.join(root, 'test-results'); mkdirSync(results, { recursive: true });
  const directory = mkdtempSync(path.join(results, 'api-'));
  const port = 32000 + Math.floor(Math.random() * 1000), base = `http://127.0.0.1:${port}/api`;
  let server, output = '';
  function start() { server = spawn(process.execPath, ['server/index.mjs'], { cwd: root, env: { ...process.env, PORT: String(port), DATA_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'] }); server.stdout.on('data', d => output += d); server.stderr.on('data', d => output += d); }
  async function stop() { if (!server || server.exitCode !== null) return; await new Promise(resolve => { server.once('exit', resolve); server.kill(); }); }
  async function ready() { for (let i = 0; i < 100; i++) { if (server.exitCode !== null) throw new Error(output); try { if ((await fetch(base + '/health')).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error('Server did not start: ' + output); }
  t.after(async () => { await stop(); const checked = path.resolve(directory); if (!checked.startsWith(path.resolve(results) + path.sep)) throw new Error('Invalid test directory'); rmSync(checked, { recursive: true, force: true }); }); start(); await ready();
  const request = async (endpoint, cookie = '', body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + endpoint, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  assert.equal((await request('/data')).status, 401);
  const alice = await request('/auth/register', '', { name: 'Alice', email: 'alice@example.test', password: 'SecurePassword123' }); assert.equal(alice.status, 201); const a = alice.cookie;
  const bob = await request('/auth/register', '', { name: 'Bob', email: 'bob@example.test', password: 'SecurePassword456' }); const b = bob.cookie;
  assert.equal((await request('/auth/login', '', { email: 'alice@example.test', password: 'wrong' })).status, 401);
  assert.equal((await request('/auth/me', a)).data.name, 'Alice');
  assert.deepEqual((await request('/data', a)).data.offers, []);
  const upload = new FormData(); upload.append('file', new Blob(['Наименование;Цена;Единица;Скидка\nТовар A;510;шт;5\nТовар B;430;шт;3\nТовар C;345;шт;0\nТовар D;680;шт;7']), 'price.csv');
  const preview = await request('/uploads/preview', a, upload); assert.equal(preview.status, 200); assert.equal(preview.data.normalized.items.length, 4);
  assert.equal((await request(`/uploads/${preview.data.id}/normalize`, b, { mapping: preview.data.mapping })).status, 404);
  const normalized = await request(`/uploads/${preview.data.id}/normalize`, a, { mapping: preview.data.mapping, discount: 0 }); assert.equal(normalized.status, 200);
  const imported = await request('/imports', a, { previewId: preview.data.id, supplier: { name: 'Supplier One', specialization: 'Materials', reliability: 91, discount: 0 }, items: normalized.data.normalized.items }); assert.equal(imported.status, 201);
  const own = (await request('/data', a)).data; assert.equal(own.offers.length, 4); assert.equal(own.suppliers.length, 1); assert.equal(own.imports.length, 1); assert.equal(own.offers.find(o => o.price === 510).effective_price, 484.5);
  assert.equal((await request('/data', b)).data.offers.length, 0);
  assert.equal((await request('/selections', b, { offerId: own.offers[0].id })).status, 404);
  assert.equal((await request(`/suppliers/${own.suppliers[0].id}`, b, { name: 'Hijacked' }, 'PATCH')).status, 404);
  assert.equal((await request('/selections', a, { offerId: own.offers[0].id })).status, 200);
  assert.equal((await request('/data', a)).data.selections.length, 1);
  assert.equal((await request('/imports', a, { previewId: preview.data.id, supplierId: own.suppliers[0].id, items: normalized.data.normalized.items })).status, 404);
  const newUpload = new FormData(); newUpload.append('file', new Blob(['Наименование;Цена;Единица\nНовый товар;100;шт']), 'updated.csv');
  const nextPreview = (await request('/uploads/preview', a, newUpload)).data;
  assert.equal((await request('/imports', a, { previewId: nextPreview.id, supplierId: own.suppliers[0].id, items: nextPreview.normalized.items })).status, 201);
  const updated = (await request('/data', a)).data; assert.equal(updated.offers.length, 1); assert.equal(updated.imports.length, 2); assert.equal(updated.selections.length, 0);
  const forbidden = await fetch(base + '/suppliers', { method: 'POST', headers: { Cookie: a, Origin: 'https://another-site.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'External' }) }); assert.equal(forbidden.status, 403);
  const supplierWithoutRating = await request('/suppliers', a, { name: 'Unrated supplier' }); assert.equal(supplierWithoutRating.status, 400);
  await stop(); start(); await ready(); assert.equal((await request('/data', a)).data.offers.length, 1);
  await request('/auth/logout', a, {}); assert.equal((await request('/data', a)).status, 401);
});
