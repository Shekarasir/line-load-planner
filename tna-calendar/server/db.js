import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  department    TEXT NOT NULL CHECK (department IN ('Merch','Fabric','Store','Production','OCR','Costing','Admin','Others')),
  designation   TEXT NOT NULL DEFAULT '',
  phone_number  TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no              TEXT NOT NULL,
  style_number          TEXT NOT NULL DEFAULT '',
  buyer_name            TEXT NOT NULL,
  order_qty             INTEGER,
  booking_date          TEXT NOT NULL,
  delivery_date         TEXT NOT NULL,
  total_lead_time_days  INTEGER NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (delivery_date > booking_date)
);

CREATE TABLE IF NOT EXISTS tasks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seq              INTEGER NOT NULL,
  task_name        TEXT NOT NULL,
  start_pct        REAL,
  end_pct          REAL,
  start_date       TEXT NOT NULL,
  end_date         TEXT NOT NULL,
  department       TEXT NOT NULL,
  task_owner_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','In Progress','Delayed','Completed')),
  actual_date      TEXT,
  remarks          TEXT NOT NULL DEFAULT '',
  date_overridden  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subtasks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id        INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  seq            INTEGER NOT NULL,
  subtask_name   TEXT NOT NULL,
  start_date     TEXT NOT NULL,
  end_date       TEXT NOT NULL,
  task_owner_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','In Progress','Delayed','Completed')),
  actual_date    TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT NOT NULL UNIQUE,
  display_name   TEXT NOT NULL DEFAULT '',
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_order ON tasks(order_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
`;

export function openDatabase(file = process.env.DB_PATH || './data/tna.db') {
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

/** Run fn inside a transaction, rolling back on any thrown error. */
export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
