import { Router } from 'express';
import { DEPARTMENTS, USER_STATUSES } from '../../shared/tna.js';
import { HttpError } from '../http.js';

function cleanUser(body) {
  const user = {
    name: String(body.name ?? '').trim(),
    department: body.department,
    designation: String(body.designation ?? '').trim(),
    phone_number: String(body.phone_number ?? '').trim(),
    status: body.status || 'Active',
  };
  const errors = [];
  if (!user.name) errors.push('Name is required');
  if (!DEPARTMENTS.includes(user.department)) errors.push('Department is required');
  if (!USER_STATUSES.includes(user.status)) errors.push('Invalid status');
  if (user.phone_number && !/^[+\d][\d\s-]{5,19}$/.test(user.phone_number)) errors.push('Invalid phone number');
  if (errors.length) throw new HttpError(400, 'Validation failed', errors);
  return user;
}

export function usersRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const where = req.query.status ? 'WHERE status = ?' : '';
    const params = req.query.status ? [req.query.status] : [];
    res.json(db.prepare(`SELECT * FROM users ${where} ORDER BY name COLLATE NOCASE`).all(...params));
  });

  router.get('/:id', (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) throw new HttpError(404, 'User not found');
    res.json(user);
  });

  router.post('/', (req, res) => {
    const u = cleanUser(req.body);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (name, department, designation, phone_number, status) VALUES (?, ?, ?, ?, ?)')
      .run(u.name, u.department, u.designation, u.phone_number, u.status);
    res.status(201).json(db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const u = cleanUser(req.body);
    const { changes } = db
      .prepare(
        `UPDATE users SET name = ?, department = ?, designation = ?, phone_number = ?, status = ?,
         updated_at = datetime('now') WHERE id = ?`,
      )
      .run(u.name, u.department, u.designation, u.phone_number, u.status, req.params.id);
    if (!changes) throw new HttpError(404, 'User not found');
    res.json(db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    const { n } = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM tasks WHERE task_owner_id = ?) +
                (SELECT COUNT(*) FROM subtasks WHERE task_owner_id = ?) AS n`,
      )
      .get(req.params.id, req.params.id);
    if (n > 0) {
      throw new HttpError(409, `This user owns ${n} task(s). Mark them Inactive instead of deleting.`);
    }
    const { changes } = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    if (!changes) throw new HttpError(404, 'User not found');
    res.status(204).end();
  });

  return router;
}
