import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { usersRouter } from './routes/users.js';
import { ordersRouter, progressRouter } from './routes/orders.js';
import { errorHandler } from './http.js';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
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
