import { Router } from 'express';
import {
  DEPARTMENTS,
  TASK_STATUSES,
  effectiveStatus,
  leadTimeDays,
  toISODate,
  validateTnaDocument,
  validationMessages,
} from '../../shared/tna.js';
import { transaction } from '../db.js';
import { HttpError } from '../http.js';

const OWNER_COLS = `u.name AS owner_name, u.phone_number AS owner_phone, u.department AS owner_department`;

function normalizeDoc(body) {
  const ownerId = (v) => (v === '' || v == null ? null : Number(v));
  return {
    order_no: String(body.order_no ?? '').trim(),
    style_number: String(body.style_number ?? '').trim(),
    buyer_name: String(body.buyer_name ?? '').trim(),
    order_qty: body.order_qty === '' || body.order_qty == null ? null : Number(body.order_qty),
    booking_date: toISODate(body.booking_date),
    delivery_date: toISODate(body.delivery_date),
    tasks: (Array.isArray(body.tasks) ? body.tasks : []).map((t, i) => ({
      seq: Number(t.seq ?? i + 1),
      task_name: String(t.task_name ?? '').trim(),
      start_pct: t.start_pct ?? null,
      end_pct: t.end_pct ?? null,
      start_date: toISODate(t.start_date),
      end_date: toISODate(t.end_date),
      department: DEPARTMENTS.includes(t.department) ? t.department : 'Others',
      task_owner_id: ownerId(t.task_owner_id),
      status: TASK_STATUSES.includes(t.status) ? t.status : 'Pending',
      actual_date: toISODate(t.actual_date) || null,
      remarks: String(t.remarks ?? ''),
      date_overridden: t.date_overridden ? 1 : 0,
      subtasks: (Array.isArray(t.subtasks) ? t.subtasks : []).map((s, j) => ({
        seq: j + 1,
        subtask_name: String(s.subtask_name ?? '').trim(),
        start_date: toISODate(s.start_date),
        end_date: toISODate(s.end_date),
        task_owner_id: ownerId(s.task_owner_id),
        status: TASK_STATUSES.includes(s.status) ? s.status : 'Pending',
        actual_date: toISODate(s.actual_date) || null,
      })),
    })),
  };
}

function assertValid(db, doc) {
  const result = validateTnaDocument(doc);
  if (!result.valid) throw new HttpError(400, 'Validation failed', validationMessages(result, doc));
  if (!doc.tasks.length) throw new HttpError(400, 'Validation failed', ['At least one task is required']);
  const ownerIds = new Set(
    doc.tasks.flatMap((t) => [t.task_owner_id, ...t.subtasks.map((s) => s.task_owner_id)]).filter((id) => id != null),
  );
  const exists = db.prepare('SELECT 1 FROM users WHERE id = ?');
  for (const id of ownerIds) {
    if (!exists.get(id)) throw new HttpError(400, 'Validation failed', [`Task owner #${id} does not exist`]);
  }
}

function writeTasks(db, orderId, tasks) {
  db.prepare('DELETE FROM tasks WHERE order_id = ?').run(orderId);
  const insTask = db.prepare(
    `INSERT INTO tasks (order_id, seq, task_name, start_pct, end_pct, start_date, end_date, department,
       task_owner_id, status, actual_date, remarks, date_overridden)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insSub = db.prepare(
    `INSERT INTO subtasks (task_id, seq, subtask_name, start_date, end_date, task_owner_id, status, actual_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const t of tasks) {
    const { lastInsertRowid: taskId } = insTask.run(
      orderId, t.seq, t.task_name, t.start_pct, t.end_pct, t.start_date, t.end_date, t.department,
      t.task_owner_id, t.status, t.actual_date, t.remarks, t.date_overridden,
    );
    for (const s of t.subtasks) {
      insSub.run(taskId, s.seq, s.subtask_name, s.start_date, s.end_date, s.task_owner_id, s.status, s.actual_date);
    }
  }
}

export function loadOrder(db, id) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return null;
  const tasks = db
    .prepare(`SELECT t.*, ${OWNER_COLS} FROM tasks t LEFT JOIN users u ON u.id = t.task_owner_id
              WHERE t.order_id = ? ORDER BY t.seq, t.id`)
    .all(id);
  const subStmt = db.prepare(
    `SELECT s.*, ${OWNER_COLS} FROM subtasks s LEFT JOIN users u ON u.id = s.task_owner_id
     WHERE s.task_id = ? ORDER BY s.seq, s.id`,
  );
  return {
    ...order,
    tasks: tasks.map((t) => ({ ...t, date_overridden: !!t.date_overridden, subtasks: subStmt.all(t.id) })),
  };
}

function summarize(order, today) {
  const items = order.tasks.flatMap((t) => [t, ...t.subtasks]);
  const stats = { total: items.length, completed: 0, delayed: 0, in_progress: 0, pending: 0 };
  for (const item of items) {
    const s = effectiveStatus(item, today);
    if (s === 'Completed') stats.completed++;
    else if (s === 'Delayed') stats.delayed++;
    else if (s === 'In Progress') stats.in_progress++;
    else stats.pending++;
  }
  const next = order.tasks
    .filter((t) => t.status !== 'Completed')
    .sort((a, b) => a.end_date.localeCompare(b.end_date))[0];
  const { tasks, ...header } = order;
  return {
    ...header,
    stats,
    order_status: stats.completed === stats.total ? 'Completed' : stats.delayed ? 'Delayed' : 'On Track',
    next_task: next
      ? {
          id: next.id,
          task_name: next.task_name,
          end_date: next.end_date,
          status: effectiveStatus(next, today),
          owner_name: next.owner_name,
          owner_phone: next.owner_phone,
        }
      : null,
  };
}

export function ordersRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const today = new Date();
    const ids = db.prepare('SELECT id FROM orders ORDER BY delivery_date, id').all();
    res.json(ids.map(({ id }) => summarize(loadOrder(db, id), today)));
  });

  router.get('/:id', (req, res) => {
    const order = loadOrder(db, req.params.id);
    if (!order) throw new HttpError(404, 'Order not found');
    res.json(order);
  });

  router.post('/', (req, res) => {
    const doc = normalizeDoc(req.body);
    assertValid(db, doc);
    const id = transaction(db, () => {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO orders (order_no, style_number, buyer_name, order_qty, booking_date, delivery_date, total_lead_time_days)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(doc.order_no, doc.style_number, doc.buyer_name, doc.order_qty, doc.booking_date, doc.delivery_date,
          leadTimeDays(doc.booking_date, doc.delivery_date));
      writeTasks(db, lastInsertRowid, doc.tasks);
      return lastInsertRowid;
    });
    res.status(201).json(loadOrder(db, id));
  });

  router.put('/:id', (req, res) => {
    const doc = normalizeDoc(req.body);
    assertValid(db, doc);
    transaction(db, () => {
      const { changes } = db
        .prepare(
          `UPDATE orders SET order_no = ?, style_number = ?, buyer_name = ?, order_qty = ?, booking_date = ?,
             delivery_date = ?, total_lead_time_days = ?, updated_at = datetime('now') WHERE id = ?`,
        )
        .run(doc.order_no, doc.style_number, doc.buyer_name, doc.order_qty, doc.booking_date, doc.delivery_date,
          leadTimeDays(doc.booking_date, doc.delivery_date), req.params.id);
      if (!changes) throw new HttpError(404, 'Order not found');
      writeTasks(db, req.params.id, doc.tasks);
    });
    res.json(loadOrder(db, req.params.id));
  });

  router.delete('/:id', (req, res) => {
    const { changes } = db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
    if (!changes) throw new HttpError(404, 'Order not found');
    res.status(204).end();
  });

  return router;
}

/** Quick status updates from the dashboard, without re-submitting the whole T&A. */
export function progressRouter(db) {
  const router = Router();

  const patch = (table) => (req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) throw new HttpError(404, 'Not found');
    const status = req.body.status ?? row.status;
    if (!TASK_STATUSES.includes(status)) throw new HttpError(400, 'Invalid status');
    let actual = req.body.actual_date !== undefined ? toISODate(req.body.actual_date) || null : row.actual_date;
    if (status === 'Completed' && !actual) actual = toISODate(new Date());
    if (status !== 'Completed' && req.body.status && req.body.actual_date === undefined) actual = null;
    db.prepare(`UPDATE ${table} SET status = ?, actual_date = ? WHERE id = ?`).run(status, actual, row.id);
    const orderId =
      table === 'tasks' ? row.order_id : db.prepare('SELECT order_id FROM tasks WHERE id = ?').get(row.task_id).order_id;
    db.prepare(`UPDATE orders SET updated_at = datetime('now') WHERE id = ?`).run(orderId);
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(row.id));
  };

  router.patch('/tasks/:id', patch('tasks'));
  router.patch('/subtasks/:id', patch('subtasks'));

  // Every open task / sub-task across all orders, soonest due first.
  router.get('/open-items', (req, res) => {
    const today = new Date();
    const tasks = db
      .prepare(
        `SELECT 'task' AS kind, t.id, t.task_name AS name, NULL AS parent_name, t.start_date, t.end_date, t.status,
                t.department, o.id AS order_id, o.order_no, o.buyer_name, o.style_number, ${OWNER_COLS}
         FROM tasks t JOIN orders o ON o.id = t.order_id LEFT JOIN users u ON u.id = t.task_owner_id
         WHERE t.status <> 'Completed'`,
      )
      .all();
    const subs = db
      .prepare(
        `SELECT 'subtask' AS kind, s.id, s.subtask_name AS name, t.task_name AS parent_name, s.start_date, s.end_date,
                s.status, t.department, o.id AS order_id, o.order_no, o.buyer_name, o.style_number, ${OWNER_COLS}
         FROM subtasks s JOIN tasks t ON t.id = s.task_id JOIN orders o ON o.id = t.order_id
         LEFT JOIN users u ON u.id = s.task_owner_id
         WHERE s.status <> 'Completed'`,
      )
      .all();
    const items = [...tasks, ...subs]
      .map((i) => ({ ...i, effective_status: effectiveStatus(i, today) }))
      .sort((a, b) => a.end_date.localeCompare(b.end_date) || a.order_no.localeCompare(b.order_no));
    res.json(items);
  });

  return router;
}
