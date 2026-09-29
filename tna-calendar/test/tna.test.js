import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_TEMPLATES,
  effectiveStatus,
  generateStandardTasks,
  leadTimeDays,
  recalculateTasks,
  validateOrderHeader,
  validateSubtask,
  validateTnaDocument,
} from '../shared/tna.js';

test('lead time is delivery minus booking in calendar days', () => {
  assert.equal(leadTimeDays('2026-01-01', '2026-04-11'), 100);
  assert.equal(leadTimeDays('2026-01-01', ''), null);
});

test('generates the 10 standard tasks from lead-time percentages', () => {
  const tasks = generateStandardTasks('2026-01-01', '2026-04-11'); // 100-day lead
  assert.equal(tasks.length, 10);
  const byName = Object.fromEntries(tasks.map((t) => [t.task_name, t]));
  assert.deepEqual([byName['Yarn Procurement'].start_date, byName['Yarn Procurement'].end_date], ['2026-01-01', '2026-01-11']);
  assert.deepEqual([byName['Fabric In-house'].start_date, byName['Fabric In-house'].end_date], ['2026-01-26', '2026-02-05']);
  assert.deepEqual([byName['Cutting'].start_date, byName['Cutting'].end_date], ['2026-02-15', '2026-02-20']);
  assert.equal(byName['OCR (Order Closing Report)'].start_date, byName['OCR (Order Closing Report)'].end_date);
  assert.deepEqual([byName['P&L Report'].start_date, byName['P&L Report'].end_date], ['2026-04-11', '2026-04-11']);
  assert.equal(byName['OCR (Order Closing Report)'].department, 'OCR');
  assert.equal(byName['P&L Report'].department, 'Costing');
});

test('percentages round to the nearest day', () => {
  const tasks = generateStandardTasks('2026-01-01', '2026-01-31'); // 30-day lead
  const ppm = tasks.find((t) => t.seq === 6); // 36% → 10.8 → 11, 46% → 13.8 → 14
  assert.equal(ppm.start_date, '2026-01-12');
  assert.equal(ppm.end_date, '2026-01-15');
});

test('recalculation keeps manually overridden tasks and sub-tasks', () => {
  const tasks = generateStandardTasks('2026-01-01', '2026-04-11');
  tasks[0] = { ...tasks[0], start_date: '2026-01-03', date_overridden: true, task_owner_id: 7 };
  tasks[1].subtasks = [{ subtask_name: 'x', start_date: '2026-01-26', end_date: '2026-01-27' }];
  const next = recalculateTasks(tasks, '2026-02-01', '2026-05-12');
  assert.equal(next[0].start_date, '2026-01-03');
  assert.equal(next[0].task_owner_id, 7);
  assert.equal(next[1].start_date, '2026-02-26');
  assert.equal(next[1].subtasks.length, 1);
});

test('delivery date must be after booking date', () => {
  const base = { order_no: 'A1', buyer_name: 'B' };
  assert.ok(validateOrderHeader({ ...base, booking_date: '2026-01-10', delivery_date: '2026-01-10' }).delivery_date);
  assert.ok(validateOrderHeader({ ...base, booking_date: '2026-01-10', delivery_date: '2026-01-01' }).delivery_date);
  assert.deepEqual(validateOrderHeader({ ...base, booking_date: '2026-01-10', delivery_date: '2026-01-11' }), {});
});

test('sub-task must stay within parent task dates', () => {
  const parent = { start_date: '2026-02-01', end_date: '2026-02-10' };
  assert.deepEqual(validateSubtask({ subtask_name: 'ok', start_date: '2026-02-01', end_date: '2026-02-10' }, parent), {});
  assert.ok(validateSubtask({ subtask_name: 'early', start_date: '2026-01-31', end_date: '2026-02-05' }, parent).start_date);
  assert.ok(validateSubtask({ subtask_name: 'late', start_date: '2026-02-02', end_date: '2026-02-11' }, parent).end_date);
  assert.ok(validateSubtask({ subtask_name: 'rev', start_date: '2026-02-05', end_date: '2026-02-03' }, parent).end_date);
});

test('whole document validation flags a bad sub-task', () => {
  const tasks = generateStandardTasks('2026-01-01', '2026-04-11');
  tasks[6].subtasks = [{ subtask_name: 'Lay plan', start_date: '2026-01-01', end_date: '2026-02-16' }];
  const res = validateTnaDocument({ order_no: 'A', buyer_name: 'B', booking_date: '2026-01-01', delivery_date: '2026-04-11', tasks });
  assert.equal(res.valid, false);
  assert.ok(res.tasks[6].subtasks[0].start_date);
});

test('open tasks past their end date are effectively Delayed', () => {
  const today = new Date('2026-03-01T10:00:00');
  assert.equal(effectiveStatus({ status: 'Pending', end_date: '2026-02-28' }, today), 'Delayed');
  assert.equal(effectiveStatus({ status: 'In Progress', end_date: '2026-03-01' }, today), 'In Progress');
  assert.equal(effectiveStatus({ status: 'Completed', end_date: '2026-01-01' }, today), 'Completed');
});

test('templates cover the specified 10 tasks', () => {
  assert.deepEqual(
    TASK_TEMPLATES.map((t) => [t.start_pct, t.end_pct]),
    [[0, 10], [25, 35], [25, 35], [35, 45], [35, 45], [36, 46], [45, 50], [75, 90], [95, 95], [100, 100]],
  );
});
