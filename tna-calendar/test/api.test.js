import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { generateStandardTasks } from '../shared/tna.js';
import { ensureAdminAccount } from '../server/auth.js';

let server;
let base;

before(async () => {
  const db = openDatabase(':memory:');
  ensureAdminAccount(db, { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'admin-pass-123' }, () => {});
  const app = createApp(db);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

// Minimal cookie jar per "browser" so tests can act as different signed-in users.
function client() {
  let cookie = '';
  return async (method, path, body) => {
    const headers = body ? { 'Content-Type': 'application/json' } : {};
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
}

const call = client();

test('login is required and admin can manage logins', async () => {
  const anon = client();
  assert.equal((await anon('GET', '/orders')).status, 401);
  assert.equal((await anon('GET', '/users')).status, 401);
  assert.equal((await anon('GET', '/health')).status, 200);
  assert.equal((await anon('POST', '/auth/login', { username: 'admin', password: 'wrong-password' })).status, 401);

  let r = await call('POST', '/auth/login', { username: 'Admin', password: 'admin-pass-123' });
  assert.equal(r.status, 200);
  assert.equal(r.body.role, 'admin');
  assert.equal(r.body.password_hash, undefined, 'hash never leaves the server');

  r = await call('POST', '/accounts', { username: 'merch1', display_name: 'Merch One', password: 'short' });
  assert.equal(r.status, 400);
  r = await call('POST', '/accounts', { username: 'merch1', display_name: 'Merch One', password: 'merch-pass-1' });
  assert.equal(r.status, 201);
  const merchId = r.body.id;

  const merch = client();
  assert.equal((await merch('POST', '/auth/login', { username: 'merch1', password: 'merch-pass-1' })).status, 200);
  assert.equal((await merch('GET', '/orders')).status, 200, 'normal users can use the app');
  assert.equal((await merch('GET', '/accounts')).status, 403, 'but cannot manage logins');

  r = await merch('POST', '/auth/password', { current_password: 'nope', new_password: 'merch-pass-2' });
  assert.equal(r.status, 400);
  r = await merch('POST', '/auth/password', { current_password: 'merch-pass-1', new_password: 'merch-pass-2' });
  assert.equal(r.status, 204);

  // Admin reset signs the user out everywhere.
  r = await call('PUT', `/accounts/${merchId}`, { password: 'reset-pass-99' });
  assert.equal(r.status, 200);
  assert.equal((await merch('GET', '/orders')).status, 401);

  const me = (await call('GET', '/auth/me')).body;
  assert.equal((await call('DELETE', `/accounts/${me.id}`)).status, 400, 'cannot delete yourself');
  assert.equal((await call('PUT', `/accounts/${me.id}`, { role: 'user' })).status, 400, 'last admin stays admin');

  assert.equal((await merch('POST', '/auth/logout')).status, 204);
  assert.equal((await call('DELETE', `/accounts/${merchId}`)).status, 204);
});

test('user CRUD and order lifecycle', async () => {
  let r = await call('POST', '/users', { name: '', department: 'Nope' });
  assert.equal(r.status, 400);

  r = await call('POST', '/users', { name: 'Asha', department: 'Merch', designation: 'Merchandiser', phone_number: '+91 98765 43210' });
  assert.equal(r.status, 201);
  const asha = r.body;

  const tasks = generateStandardTasks('2026-01-01', '2026-04-11');
  tasks[0].task_owner_id = asha.id;
  tasks[0].subtasks = [{ subtask_name: 'Yarn PO', start_date: '2026-01-01', end_date: '2026-01-05', task_owner_id: asha.id }];
  const order = { order_no: 'LF-001', buyer_name: 'Buyer', style_number: 'ST1', order_qty: 1200, booking_date: '2026-01-01', delivery_date: '2026-04-11', tasks };

  r = await call('POST', '/orders', { ...order, delivery_date: '2025-12-31' });
  assert.equal(r.status, 400, 'delivery before booking is rejected');

  const bad = structuredClone(order);
  bad.tasks[0].subtasks[0].end_date = '2026-01-20';
  r = await call('POST', '/orders', bad);
  assert.equal(r.status, 400, 'sub-task outside parent window is rejected');
  assert.match(r.body.details.join(' '), /parent end/);

  r = await call('POST', '/orders', order);
  assert.equal(r.status, 201);
  assert.equal(r.body.total_lead_time_days, 100);
  assert.equal(r.body.tasks.length, 10);
  assert.equal(r.body.tasks[0].owner_name, 'Asha');
  assert.equal(r.body.tasks[0].subtasks[0].owner_phone, '+91 98765 43210');
  const created = r.body;

  r = await call('PATCH', `/subtasks/${created.tasks[0].subtasks[0].id}`, { status: 'Completed' });
  assert.equal(r.body.status, 'Completed');
  assert.ok(r.body.actual_date, 'completion stamps an actual date');

  r = await call('GET', '/orders');
  assert.equal(r.body.length, 1);
  assert.equal(r.body[0].stats.total, 11);
  assert.equal(r.body[0].stats.completed, 1);

  r = await call('GET', '/open-items');
  assert.equal(r.body.length, 10);

  r = await call('DELETE', `/users/${asha.id}`);
  assert.equal(r.status, 409, 'cannot delete a user who owns tasks');

  r = await call('DELETE', `/orders/${created.id}`);
  assert.equal(r.status, 204);
  r = await call('DELETE', `/users/${asha.id}`);
  assert.equal(r.status, 204);
});
