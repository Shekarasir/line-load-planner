import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { usersRouter } from './routes/users.js';
import { ordersRouter, progressRouter } from './routes/orders.js';
import { errorHandler } from './http.js';
import { accountsRouter, authRouter, backupHandler, requireLogin, sessionMiddleware } from './auth.js';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  // Behind Render / Caddy / nginx: trust X-Forwarded-* so req.secure and req.ip are correct.
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(sessionMiddleware(db));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter(db));
  // Everything below requires a signed-in user.
  app.use('/api', requireLogin);
  app.use('/api/accounts', accountsRouter(db));
  app.get('/api/backup', ...backupHandler(db));
  app.use('/api/users', usersRouter(db));
  app.use('/api/orders', ordersRouter(db));
  app.use('/api', progressRouter(db));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // In production the built React app is served from the same origin.
  if (existsSync(DIST)) {
    app.use(express.static(DIST, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (req, res) => res.sendFile(join(DIST, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
