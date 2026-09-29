import { Router } from 'express';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { HttpError } from './http.js';

const COOKIE = 'tna_session';
const SESSION_DAYS = 30;
const ROLES = ['admin', 'user'];
const MAX_FAILURES = 8;
const LOCK_MINUTES = 15;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

// Only a hash of the session token is stored, so a leaked database can't be used to log in.
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(req, res, token, maxAgeSeconds) {
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`);
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new HttpError(400, 'Password must be at least 8 characters');
  }
}

function cleanUsername(value) {
  const username = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new HttpError(400, 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore');
  }
  return username;
}

const publicAccount = (a) => ({
  id: a.id,
  username: a.username,
  display_name: a.display_name,
  role: a.role,
  created_at: a.created_at,
});

/**
 * Create the first admin login when there are no accounts yet.
 * Uses ADMIN_USERNAME / ADMIN_PASSWORD if set, otherwise generates a
 * password and prints it once to the server log.
 */
export function ensureAdminAccount(db, env = process.env, log = console.log) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM accounts').get();
  if (n > 0) return null;
  const username = cleanUsername(env.ADMIN_USERNAME || 'admin');
  const generated = !env.ADMIN_PASSWORD;
  const password = env.ADMIN_PASSWORD || randomBytes(9).toString('base64url');
  validatePassword(password);
  db.prepare(`INSERT INTO accounts (username, display_name, password_hash, role) VALUES (?, ?, ?, 'admin')`).run(
    username,
    'Administrator',
    hashPassword(password),
  );
  if (generated) {
    log(`\n  First admin login created →  username: ${username}   password: ${password}\n  Sign in and change this password (or set ADMIN_PASSWORD before first start).\n`);
  } else {
    log(`First admin login "${username}" created from ADMIN_USERNAME / ADMIN_PASSWORD.`);
  }
  return { username, password };
}

/** Attaches req.account when a valid session cookie is present. */
export function sessionMiddleware(db) {
  const find = db.prepare(
    `SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
  );
  return (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) {
      const account = find.get(tokenHash(token));
      if (account) req.account = account;
    }
    next();
  };
}

export function requireLogin(req, res, next) {
  if (!req.account) throw new HttpError(401, 'Please sign in');
  next();
}

export function requireAdmin(req, res, next) {
  if (req.account?.role !== 'admin') throw new HttpError(403, 'Only an admin can do this');
  next();
}

export function authRouter(db) {
  const router = Router();
  // Simple in-memory brute-force protection, keyed by IP + username.
  const failures = new Map();

  router.post('/login', (req, res) => {
    const username = String(req.body.username ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');
    const key = `${req.ip}|${username}`;
    const f = failures.get(key);
    if (f && f.count >= MAX_FAILURES && Date.now() - f.last < LOCK_MINUTES * 60_000) {
      throw new HttpError(429, `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`);
    }
    const account = db.prepare('SELECT * FROM accounts WHERE username = ?').get(username);
    if (!account || !verifyPassword(password, account.password_hash)) {
      failures.set(key, { count: (f?.count || 0) + 1, last: Date.now() });
      throw new HttpError(401, 'Wrong username or password');
    }
    failures.delete(key);
    const token = randomBytes(32).toString('base64url');
    db.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`).run();
    db.prepare(`INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, datetime('now', ?))`).run(
      tokenHash(token),
      account.id,
      `+${SESSION_DAYS} days`,
    );
    setSessionCookie(req, res, token, SESSION_DAYS * 86400);
    res.json(publicAccount(account));
  });

  router.post('/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    setSessionCookie(req, res, '', 0);
    res.status(204).end();
  });

  router.get('/me', requireLogin, (req, res) => res.json(publicAccount(req.account)));

  router.post('/password', requireLogin, (req, res) => {
    if (!verifyPassword(String(req.body.current_password ?? ''), req.account.password_hash)) {
      throw new HttpError(400, 'Current password is incorrect');
    }
    validatePassword(req.body.new_password);
    db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.new_password), req.account.id);
    // Sign out other devices, keep this one.
    const token = parseCookies(req.headers.cookie)[COOKIE];
    db.prepare('DELETE FROM sessions WHERE account_id = ? AND token_hash <> ?').run(req.account.id, tokenHash(token));
    res.status(204).end();
  });

  return router;
}

/** Admin-only management of login accounts. */
export function accountsRouter(db) {
  const router = Router();
  router.use(requireAdmin);

  const adminCount = () => db.prepare(`SELECT COUNT(*) AS n FROM accounts WHERE role = 'admin'`).get().n;

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM accounts ORDER BY username').all().map(publicAccount));
  });

  router.post('/', (req, res) => {
    const username = cleanUsername(req.body.username);
    const role = ROLES.includes(req.body.role) ? req.body.role : 'user';
    validatePassword(req.body.password);
    if (db.prepare('SELECT 1 FROM accounts WHERE username = ?').get(username)) {
      throw new HttpError(409, `Username "${username}" is already taken`);
    }
    const { lastInsertRowid } = db
      .prepare('INSERT INTO accounts (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(username, String(req.body.display_name ?? '').trim(), hashPassword(req.body.password), role);
    res.status(201).json(publicAccount(db.prepare('SELECT * FROM accounts WHERE id = ?').get(lastInsertRowid)));
  });

  router.put('/:id', (req, res) => {
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!account) throw new HttpError(404, 'Login not found');
    const role = ROLES.includes(req.body.role) ? req.body.role : account.role;
    if (account.role === 'admin' && role !== 'admin' && adminCount() <= 1) {
      throw new HttpError(400, 'There must be at least one admin');
    }
    db.prepare('UPDATE accounts SET display_name = ?, role = ? WHERE id = ?').run(
      String(req.body.display_name ?? account.display_name).trim(),
      role,
      account.id,
    );
    if (req.body.password) {
      validatePassword(req.body.password);
      db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.password), account.id);
      db.prepare('DELETE FROM sessions WHERE account_id = ?').run(account.id);
    }
    res.json(publicAccount(db.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id)));
  });

  router.delete('/:id', (req, res) => {
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!account) throw new HttpError(404, 'Login not found');
    if (account.id === req.account.id) throw new HttpError(400, 'You cannot delete your own login');
    if (account.role === 'admin' && adminCount() <= 1) throw new HttpError(400, 'There must be at least one admin');
    db.prepare('DELETE FROM accounts WHERE id = ?').run(account.id);
    res.status(204).end();
  });

  return router;
}
