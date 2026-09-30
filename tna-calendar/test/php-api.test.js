// End-to-end test of the PHP backend (php/api.php) using PHP's built-in web server.
// The app is mounted at /tna/ exactly as it will be on the website.
// Skipped automatically when the `php` command isn't installed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { generateStandardTasks } from '../shared/tna.js';

const hasPhp = spawnSync('php', ['-r', 'exit(extension_loaded("pdo_sqlite") ? 0 : 1);']).status === 0;
const PORT = 38000 + Math.floor(Math.random() * 1000);
let server;
let dir;

before(async () => {
  if (!hasPhp) return;
  dir = mkdtempSync(join(tmpdir(), 'tna-php-'));
  symlinkSync(resolve('php'), join(dir, 'tna'));
  server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', dir], {
    env: { ...process.env, TNA_DB_FILE: join(dir, 'test.sqlite') },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/tna/api.php?r=/health`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
});

after(() => {
  server?.kill();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

// Cookie-keeping client that talks to the API the same way the browser build does.
function client({ override = true } = {}) {
  let cookie = '';
  return async (method, path, body) => {
    const [p, query] = path.split('?');
    let url = `http://127.0.0.1:${PORT}/tna/api.php?r=${encodeURIComponent(p)}${query ? `&${query}` : ''}`;
    let httpMethod = method;
    if (override && method !== 'GET' && method !== 'POST') {
      url += `&_method=${method}`;
      httpMethod = 'POST';
    }
    const headers = body ? { 'Content-Type': 'application/json' } : {};
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(url, { method: httpMethod, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = res.status === 204 ? '' : await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
}

test('PHP backend: setup, logins, users, orders, progress, backup', { skip: !hasPhp && 'php not installed' }, async () => {
  const anon = client();
  const admin = client();

  assert.equal((await anon('GET', '/health')).body.sqlite, true);
  assert.equal((await anon('GET', '/auth/status')).body.needs_setup, true);
  assert.equal((await anon('GET', '/orders')).status, 401);

  let r = await admin('POST', '/auth/setup', { username: 'Admin', display_name: 'Owner', password: 'short' });
  assert.equal(r.status, 400);
  r = await admin('POST', '/auth/setup', { username: 'Admin', display_name: 'Owner', password: 'admin-pass-123' });
  assert.equal(r.status, 201);
  assert.equal(r.body.username, 'admin');
  assert.match(r.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(r.headers.get('set-cookie'), /path=\/tna\//i, 'cookie is scoped to the app folder');
  assert.equal((await anon('POST', '/auth/setup', { password: 'another-pass-1' })).status, 409, 'setup only once');
  assert.equal((await anon('GET', '/auth/status')).body.needs_setup, false);

  assert.equal((await anon('POST', '/auth/login', { username: 'admin', password: 'wrong-pass-1' })).status, 401);
  assert.equal((await client()('POST', '/auth/login', { username: 'ADMIN', password: 'admin-pass-123' })).status, 200);

  // Users
  r = await admin('POST', '/users', { name: '', department: 'Nope' });
  assert.equal(r.status, 400);
  r = await admin('POST', '/users', { name: 'Asha', department: 'Merch', designation: 'Merchandiser', phone_number: '+91 98765 43210' });
  assert.equal(r.status, 201);
  const asha = r.body;
  assert.equal(typeof asha.id, 'number', 'ids are numbers, not strings');
  r = await admin('PUT', `/users/${asha.id}`, { ...asha, designation: 'Senior Merchandiser' });
  assert.equal(r.body.designation, 'Senior Merchandiser');
  assert.equal((await admin('GET', '/users?status=Active')).body.length, 1);

  // Orders
  const tasks = generateStandardTasks('2026-01-01', '2026-04-11');
  tasks[0].task_owner_id = asha.id;
  tasks[0].subtasks = [{ subtask_name: 'Yarn PO', start_date: '2026-01-01', end_date: '2026-01-05', task_owner_id: asha.id }];
  const order = { order_no: 'LF-001', buyer_name: 'Buyer', style_number: 'ST1', order_qty: 1200, booking_date: '2026-01-01', delivery_date: '2026-04-11', tasks };

  r = await admin('POST', '/orders', { ...order, delivery_date: '2025-12-31' });
  assert.equal(r.status, 400, 'delivery before booking is rejected');
  const bad = structuredClone(order);
  bad.tasks[0].subtasks[0].end_date = '2026-01-20';
  r = await admin('POST', '/orders', bad);
  assert.equal(r.status, 400);
  assert.match(r.body.details.join(' '), /parent end \(11-Jan-2026\)/);

  r = await admin('POST', '/orders', order);
  assert.equal(r.status, 201);
  const created = r.body;
  assert.equal(created.total_lead_time_days, 100);
  assert.equal(created.order_qty, 1200);
  assert.equal(created.tasks.length, 10);
  assert.equal(created.tasks[0].owner_name, 'Asha');
  assert.equal(created.tasks[0].start_pct, 0);
  assert.equal(created.tasks[0].date_overridden, false);
  assert.equal(created.tasks[0].subtasks[0].owner_phone, '+91 98765 43210');

  const edited = structuredClone(created);
  edited.order_no = 'LF-001A';
  edited.tasks[1].date_overridden = true;
  r = await admin('PUT', `/orders/${created.id}`, edited);
  assert.equal(r.status, 200);
  assert.equal(r.body.order_no, 'LF-001A');
  assert.equal(r.body.tasks[1].date_overridden, true);
  const subId = r.body.tasks[0].subtasks[0].id;

  r = await admin('PATCH', `/subtasks/${subId}`, { status: 'Completed' });
  assert.equal(r.body.status, 'Completed');
  assert.ok(r.body.actual_date);
  // Real PATCH (no override) works too where the host allows it.
  r = await client({ override: false })('PATCH', `/subtasks/${subId}`, { status: 'Pending' });
  assert.equal(r.status, 401, 'no cookie → rejected, proving the route is reached');

  r = await admin('GET', '/orders');
  assert.equal(r.body[0].stats.total, 11);
  assert.equal(r.body[0].stats.completed, 1);
  assert.ok(r.body[0].next_task);
  assert.equal((await admin('GET', '/open-items')).body.length, 10);

  // Logins
  r = await admin('POST', '/accounts', { username: 'merch1', display_name: 'Merch One', password: 'merch-pass-1' });
  assert.equal(r.status, 201);
  const merch = client();
  assert.equal((await merch('POST', '/auth/login', { username: 'merch1', password: 'merch-pass-1' })).status, 200);
  assert.equal((await merch('GET', '/orders')).status, 200);
  assert.equal((await merch('GET', '/accounts')).status, 403);
  assert.equal((await merch('GET', '/backup')).status, 403);
  assert.equal((await merch('POST', '/auth/password', { current_password: 'merch-pass-1', new_password: 'merch-pass-2' })).status, 204);
  assert.equal((await admin('PUT', `/accounts/${r.body.id}`, { password: 'reset-pass-99' })).status, 200);
  assert.equal((await merch('GET', '/orders')).status, 401, 'reset signs the user out');
  const me = (await admin('GET', '/auth/me')).body;
  assert.equal((await admin('DELETE', `/accounts/${me.id}`)).status, 400);
  assert.equal((await admin('PUT', `/accounts/${me.id}`, { role: 'user' })).status, 400);

  // Backup
  r = await admin('GET', '/backup');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /attachment; filename="tna-backup-/);
  assert.equal(r.body.orders.length, 1);
  assert.equal(r.body.subtasks.length, 1);
  assert.equal(r.body.accounts[0].password_hash, undefined);

  // Deletes — orders only by admins
  assert.equal((await admin('POST', '/accounts', { username: 'viewer1', password: 'viewer-pass-1' })).status, 201);
  const viewer = client();
  await viewer('POST', '/auth/login', { username: 'viewer1', password: 'viewer-pass-1' });
  assert.equal((await viewer('DELETE', `/orders/${created.id}`)).status, 403, 'non-admin cannot delete orders');
  assert.equal((await admin('DELETE', `/users/${asha.id}`)).status, 409);
  assert.equal((await admin('DELETE', `/orders/${created.id}`)).status, 204);
  assert.equal((await admin('DELETE', `/users/${asha.id}`)).status, 204);
  assert.equal((await admin('POST', '/auth/logout')).status, 204);
  assert.equal((await admin('GET', '/orders')).status, 401);
});

test('PHP backend: lockout after repeated wrong passwords', { skip: !hasPhp && 'php not installed' }, async () => {
  const c = client();
  for (let i = 0; i < 8; i++) await c('POST', '/auth/login', { username: 'admin', password: 'nope-nope' });
  assert.equal((await c('POST', '/auth/login', { username: 'admin', password: 'admin-pass-123' })).status, 429);
});
