import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { ensureAdminAccount } from './auth.js';

const port = Number(process.env.PORT || 3001);
const db = openDatabase();
ensureAdminAccount(db);
const app = createApp(db);

app.listen(port, () => {
  console.log(`T&A Calendar API listening on http://localhost:${port}`);
});
