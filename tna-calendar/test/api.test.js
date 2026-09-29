import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { generateStandardTasks } from '../shared/tna.js';

let server;
let base;

before(async () => {
  const app = createApp(openDatabase(':memory:'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

const call = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};

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
