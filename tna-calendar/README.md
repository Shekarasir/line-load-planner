# T&A Calendar — Lakkifashions Private Limited

A responsive Time & Action (T&A) calendar for garment orders. Enter an order's booking and
delivery dates and the 10 standard production milestones are planned automatically from the
lead time. Assign owners from the User Master, break tasks into sub-tasks, track progress on
desktop or phone, and print a clean A4 T&A sheet.

| Layer    | Tech |
|----------|------|
| Frontend | Vite + React 19, Tailwind CSS 3, lucide-react, date-fns, React Router |
| Backend  | Node.js 22 + Express 5 (REST API under `/api`) |
| Database | SQLite via Node's built-in `node:sqlite` (no native build step) |
| Print    | Dedicated `@media print` stylesheet, A4 portrait/landscape |
| Deploy   | Dockerfile + docker-compose with Caddy (auto-HTTPS for `tna.lakkifashions.com`) |

## Quick start (development)

Requires **Node.js 22.13+**.

```bash
cd tna-calendar
npm install
npm run seed      # optional: 6 sample staff so owner drop-downs aren't empty
npm run dev       # API on :3001, web app on http://localhost:5173
npm test          # date-calculation, validation and API tests
```

The database file is created at `./data/tna.db` (override with `DB_PATH`).

## Screens

- **Dashboard** (`/`) — summary tiles (active / delayed orders, overdue tasks, due in 7 days),
  an **Orders** tab (desktop table, mobile cards) with progress, next task and the owner's
  tap-to-call phone number, and a **Pending Tasks** tab to update statuses in place.
- **T&A Generator** (`/orders/new`, `/orders/:id/edit`) — order header, live lead-time
  calculation, the 10 auto-generated tasks with editable dates, department and owner drop-downs,
  and a sub-task accordion per task.
- **Order detail** (`/orders/:id`) — task table or **Gantt** view (desktop), card list (mobile),
  quick status updates, *Print T&A*.
- **User Master** (`/users`) — add / edit / delete staff, filter by department and status.
- **Print** (`/orders/:id/print`) — A4 preview with portrait/landscape toggle; *Print T&A* on
  the order page opens it and triggers the browser print dialog.

## Planning rules

`lead_time = delivery_date − booking_date` (calendar days).
Each task's dates are `booking_date + round(lead_time × pct)`:

| # | Task | Start % | End % | Default dept |
|---|------|--------:|------:|--------------|
| 1 | Yarn Procurement | 0 | 10 | Fabric |
| 2 | Fabric In-house | 25 | 35 | Fabric |
| 3 | Stitching Accessories | 25 | 35 | Store |
| 4 | Packaging Accessories | 35 | 45 | Store |
| 5 | Pre-production Approval | 35 | 45 | Merch |
| 6 | Pre-production Meeting | 36 | 46 | Production |
| 7 | Cutting | 45 | 50 | Production |
| 8 | Final Inspection | 75 | 90 | Production |
| 9 | OCR (Order Closing Report) | 95 | 95 | OCR |
| 10 | P&L Report | 100 | 100 | Costing |

- Task dates can be edited by hand. Edited tasks are marked *edited* and keep their dates when
  the order dates change; *reset* / *Recalculate all* restores the calculated dates.
- Delivery date must be after the booking date.
- A sub-task cannot start before its parent task starts or end after it ends. Violations are
  shown inline as you type and are rejected by the API as well (the same rules in
  `shared/tna.js` run on both sides).
- A task that isn't *Completed* after its planned end date is shown as **Delayed**
  automatically. Marking a task *Completed* stamps today as its actual date.
- Only **Active** users can be picked as owners; users who own tasks can't be deleted (mark them
  Inactive instead).

## Printing

The print stylesheet hides navigation, buttons, inputs, dialogs and backgrounds, repeats the
table header on every page, never splits a row across pages, and prints *Page X of Y* in the
footer (Chrome/Edge). Choose **A4 landscape** (default) or **portrait** on the print page; the
choice is remembered. In the browser's print dialog, leave *Margins* on *Default* and turn
*Headers and footers* off for the cleanest sheet.

## Project layout

```
shared/tna.js          task templates, date calculation, validation (client + server)
server/                Express app, SQLite schema, routes (users, orders, progress)
src/pages/             Dashboard, TnaGenerator, OrderDetail, UserMaster, PrintView
src/components/        Layout, Gantt, Modal, Toast, shared UI controls
src/lib/               API client and data-loading hook
test/                  node:test unit + API tests
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/users` | list (`?status=Active`) / create |
| PUT/DELETE | `/api/users/:id` | update / delete |
| GET/POST | `/api/orders` | list with progress summary / create order + tasks + sub-tasks |
| GET/PUT/DELETE | `/api/orders/:id` | full T&A / replace / delete |
| PATCH | `/api/tasks/:id`, `/api/subtasks/:id` | quick `{ status, actual_date }` update |
| GET | `/api/open-items` | all open tasks and sub-tasks, soonest due first |

## Deployment to `tna.lakkifashions.com`

The app is a single Node process (API + built client) with a SQLite file, so it needs a host
with a persistent disk — a small VPS or any Docker host.

1. Create a DNS **A record** `tna.lakkifashions.com → <server public IP>`.
2. On the server, copy this folder and run:
   ```bash
   docker compose up -d --build
   ```
   Caddy serves the site on ports 80/443 and obtains the HTTPS certificate automatically.
   To use another domain, edit `deploy/Caddyfile`.
3. Data lives in the `tna-data` Docker volume. Back it up with e.g.
   ```bash
   docker compose exec app node -e "new (require('node:sqlite').DatabaseSync)('/data/tna.db').exec(\"VACUUM INTO '/data/backup.db'\")"
   docker compose cp app:/data/backup.db ./tna-backup-$(date +%F).db
   ```

Without Docker: `npm ci && npm run build && npm start` (serves on `PORT`, default 3001) behind
any reverse proxy (nginx, IIS, Caddy) that forwards the domain to that port.

> Serverless hosts such as Vercel/Netlify have no persistent disk, so SQLite data would be
> lost between deployments. Use the Docker route above, or swap `server/db.js` for a hosted
> PostgreSQL database before deploying there.

There is no login in this version — run it on the company network/VPN or put the domain behind
an access proxy (e.g. Cloudflare Access) if it is exposed to the internet.
