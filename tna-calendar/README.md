# T&A Calendar — Lakkifashions Private Limited

A responsive Time & Action (T&A) calendar for garment orders. Enter an order's booking and
delivery dates and the 10 standard production milestones are planned automatically from the
lead time. Assign owners from the User Master, break tasks into sub-tasks, track progress on
desktop or phone, and print a clean A4 T&A sheet.

| Layer    | Tech |
|----------|------|
| Frontend | Vite + React 19, Tailwind CSS 3, lucide-react, date-fns, React Router |
| Backend  | Node.js 22 + Express 5 (REST API under `/api`) **or** PHP 7.4+ (`php/api.php`) |
| Database | SQLite via Node's built-in `node:sqlite` (no native build step) |
| Print    | Dedicated `@media print` stylesheet, A4 portrait/landscape |
| Deploy   | PHP package for ordinary web hosting (`npm run build:php`), or Docker / Render (Node) |

## Quick start (development)

Requires **Node.js 22.13+**.

```bash
cd tna-calendar
npm install
npm run seed      # optional: 6 sample staff so owner drop-downs aren't empty
npm run dev       # API on :3001, web app on http://localhost:5173
npm test          # date rules + Node API + PHP API tests (PHP tests need the php CLI)
```

The database file is created at `./data/tna.db` (override with `DB_PATH`).

## Logins

Everyone signs in with a username and password. Sessions last 30 days, and 8 wrong attempts
lock that username for 15 minutes.

- **First admin:** on first start (no logins yet) the server creates an admin login.
  Set `ADMIN_USERNAME` (default `admin`) and `ADMIN_PASSWORD` (min 8 characters) as
  environment variables before the first start. If `ADMIN_PASSWORD` isn't set, a random password
  is generated and printed once in the server log.
- **Admins** (account menu → *Manage logins*) add logins, reset passwords and choose each
  login's role: *Admin* or *User*. Users can do everything except manage logins.
- **Everyone** can change their own password from the account menu (top-right).
- Forgotten password: an admin resets it; that person is signed out on all devices.

Logins are separate from the User Master: the User Master is the list of task owners
shown on the T&A, while logins are the people who can open the app.

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
| 3 | Accessories | 25 | 45 | Store |
| 4 | Pre-production Approval | 35 | 45 | Merch |
| 5 | Pre-production Meeting | 36 | 46 | Production |
| 6 | Production | 45 | 50 | Production |
| 7 | QA | 50 | 75 | Production |
| 8 | Final Inspection | 75 | 90 | Production |
| 9 | OCR (Order Closing Report) | 95 | 95 | OCR |
| 10 | P&L Report | 100 | 100 | Costing |

- Orders created before a change to this list keep their own tasks and timings.
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
- Only **admins** can delete orders (delete icon in the order list and on the order page); the
  API refuses deletes from other logins.

## Printing

Every T&A prints on **one A4 portrait page**. The print page measures the document and scales it
down just enough to fit (the toolbar shows e.g. "scaled to 80%" for long plans); short plans print
at 100%. Navigation, buttons, inputs and dialogs are hidden. In the browser's print dialog keep
*Margins: Default* and turn *Headers and footers* off.

## Project layout

```
shared/tna.js          task templates, date calculation, validation (client + server)
server/                Express app, SQLite schema, routes (users, orders, progress)
php/                   PHP version of the same API for shared hosting
scripts/build-php.mjs  builds the PHP upload package (dist-php/)
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
| POST | `/api/auth/login`, `/api/auth/logout`, `/api/auth/password` | sign in / out / change own password |
| GET | `/api/auth/me` | current login |
| GET/POST/PUT/DELETE | `/api/accounts[/:id]` | manage logins (admin only) |

All endpoints except `/api/health`, `/api/auth/login`, `/api/auth/status` and first-run
`/api/auth/setup` require a signed-in session. Admins can also `GET /api/backup`.

The PHP version exposes the same endpoints as `api.php?r=/path` (e.g. `api.php?r=/orders/5`);
PUT/PATCH/DELETE may be sent as `POST …&_method=PUT` for hosts that block those methods.

## Live setup: lakkifashions.in (GoDaddy cPanel hosting)

| Address | Folder in cPanel | Package |
|---|---|---|
| `https://lakkifashions.in` | `public_html` | start page (`portal/`) linking to all apps |
| `https://tna.lakkifashions.in` | subdomain folder | T&A Calendar (`release/tna-upload.zip`) |
| `https://lineload.lakkifashions.in` | subdomain folder | Line Load Planner (`lineload/`) |

**Installing or updating any of them without uploading files:** in cPanel File Manager, create
`install.php` in the site's folder with the contents of [`release/install.php`](release/install.php),
then open `https://<site>/install.php?app=tna` (or `?app=portal`, `?app=lineload`). It downloads the
latest package from this repository, unpacks it and deletes itself. T&A data lives in
`/home/<user>/tna-data/` and is never touched by installs or updates.

**Publishing a new version:** `npm run build:php`, zip `dist-php/` into `release/tna-upload.zip`
(and `portal/`, `lineload/` into their zips), commit and push to `main`, then run the installer.

## Install on the existing website (PHP hosting: CWP / cPanel) — recommended

The same app also ships as a **PHP version** that runs on ordinary web hosting, next to the
Line Load planner. It needs **PHP 7.4+ with the `pdo_sqlite` extension** (enabled on almost
every host). No Node.js, no database setup, no DNS change. It opens at
**`https://lakkifashions.com/tna/`**.

### Build the upload package (developer)

```bash
npm run build:php      # → dist-php/  (upload its contents to public_html/tna/)
```

### Install in CWP (Control Web Panel)

1. Log in to CWP → **File Management → File Manager** → open **`public_html`**.
2. Create a folder named **`tna`** and open it.
3. **Upload** `tna-upload.zip`, right-click it → **Extract**. The folder should now contain
   `index.html`, `api.php`, `assets/`, `lib/` … (you can delete the zip afterwards).
4. Check the server: open `https://lakkifashions.com/tna/api.php?r=/health`.
   You should see `{"ok":true,"php":"…","sqlite":true}`.
5. Open **`https://lakkifashions.com/tna/`** → the **First-time setup** screen appears.
   Create the admin login **straight away** (the first person to open it becomes admin).
6. Add staff in **User Master** and logins in **Manage logins**.

**Where the data is kept:** a SQLite file in `/home/<user>/tna-data/` — next to `public_html`,
so it can't be downloaded from the web. (If that folder can't be created, the app uses
`tna/data/` with a random file name and a deny-all `.htaccess`.) Updating the app never touches it.

**Updating:** upload the new `tna-upload.zip` into `public_html/tna/` and extract it, replacing
files. Logins and data stay as they are.

**Backups:** admins can click **Manage logins → Download backup** for a JSON copy of all
orders, tasks and staff. Keep copies in OneDrive / Google Drive. CWP's own account backup also
includes the `tna-data` folder.

**Troubleshooting**
| Symptom | Fix |
|---|---|
| `"sqlite":false` or "pdo_sqlite is not enabled" | Enable the *pdo_sqlite* PHP extension (CWP → PHP settings / ask the host) |
| "Cannot create a data folder" | Make `public_html/tna` writable (permissions 755) or create `/home/<user>/tna-data` |
| 500 error on every page | Check file permissions: folders 755, files 644 |
| Old screens after an update | Hard-refresh the browser (Ctrl + F5) |

Optional settings (database path, time zone) go in `config.php` — see `config.sample.php`.

## Alternative: Node.js deployment to `tna.lakkifashions.com`

The app is a single Node process (API + built client) with a SQLite file, so it needs a host
with a persistent disk — a small VPS or any Docker host.

1. Create a DNS **A record** `tna.lakkifashions.com → <server public IP>`.
2. On the server, clone this repository and run:
   ```bash
   docker compose up -d --build
   ```
   Caddy serves the site on ports 80/443 and obtains the HTTPS certificate automatically.
   To use another domain, edit `deploy/Caddyfile`.
   Put `ADMIN_PASSWORD=<a strong password>` in a `.env` file next to `docker-compose.yml`
   first so you know the admin password (otherwise read it from `docker compose logs app`).
3. Data lives in the `tna-data` Docker volume. Back it up with e.g.
   ```bash
   docker compose exec app node -e "new (require('node:sqlite').DatabaseSync)('/data/tna.db').exec(\"VACUUM INTO '/data/backup.db'\")"
   docker compose cp app:/data/backup.db ./tna-backup-$(date +%F).db
   ```

### Option: Render (no server to manage)

1. render.com → **New → Web Service** → pick this GitHub repository (runtime: Docker, branch `main`).
2. Instance type **Starter** (the free plan has no persistent disk).
3. **Advanced → Add Disk**: mount path `/data`, 1 GB.
4. **Environment**: add `ADMIN_PASSWORD` = a strong password (and optionally `ADMIN_USERNAME`).
5. Create the service. Then **Settings → Custom Domains** → add `tna.lakkifashions.com` and create
   the CNAME record Render shows at your DNS provider. HTTPS is automatic.

Every push to `main` redeploys; data on the disk is kept.

Without Docker: `npm ci && npm run build && npm start` (serves on `PORT`, default 3001) behind
any reverse proxy (nginx, IIS, Caddy) that forwards the domain to that port.

> Serverless hosts such as Vercel/Netlify have no persistent disk, so SQLite data would be
> lost between deployments. Use the Docker route above, or swap `server/db.js` for a hosted
> PostgreSQL database before deploying there.
