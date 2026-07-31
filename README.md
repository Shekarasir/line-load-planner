# Line Load — Distribution & Access Control Guide

This package is how you keep **one approved master copy** of the planner on SharePoint/OneDrive,
so that people at every location always work from the version you signed off on — while data
entry (orders, achieved volumes, line allocation) stays fully open to everyone as intended.

Read the "Important limitation" section before you upload — it explains why people will
*download and open* the file rather than click a link and have it run instantly, and what
to do if you want that instant-link experience later.

---

## 1. Create the folder and set permissions

1. In OneDrive (or a SharePoint site's document library), create a folder, e.g. `Line-Load-Planner`.
2. Right-click the folder → **Manage access** (OneDrive) or **Share** (SharePoint).
3. Set your own account as **Owner / Full control** (this is automatic if you created it).
4. Share the folder with everyone else as **View only** (OneDrive: "Can view" — turn off
   "Allow editing"; SharePoint: add them with the **Read** permission level, not Contribute or Edit).
5. Upload `production-planner.html` into that folder.

From this point on: only you can overwrite the file in that folder. Everyone else can look at it
and download a copy, but they cannot save changes back into your master folder — so there's no
way for someone's local edits (AI-assisted or otherwise) to silently become "the" file.

## 2. How other users open it

Because they only have View access, they should:

1. Open the shared folder link you send them.
2. Click **Download** on `production-planner.html`.
3. Double-click the downloaded file — it opens directly in their browser like a desktop app, no
   install needed.
4. It connects to OneDrive on its own (Settings → Connect to OneDrive) to read/write the shared
   order, allocation, and achieved-volume data — that part works exactly as before, from anyone's
   downloaded copy, anywhere.

Ask everyone to **re-download** whenever you announce a new build (see versioning below), so
stale or hand-modified copies don't quietly stick around in daily use.

## 3. Important limitation — read before relying on a "click to run" link

SharePoint/OneDrive is excellent for controlling *who can overwrite the master file*, but it is
**not** built to run interactive HTML/JavaScript apps directly from a link the way a real web host
does. Modern SharePoint disables script execution in previewed files as a security measure, so a
shared "view" link often just shows the raw code or forces a download rather than running the app
in-browser. That's *why* step 2 above has people download-then-open rather than click-and-run.

If you'd rather everyone use one link and it just works (no download step, always the latest
version automatically) — that needs an actual static web host, e.g. GitHub Pages, Netlify, or an
Azure Static Web App. Say the word and I'll set that up the same way; it's a similarly small,
one-time setup and plays nicely alongside this SharePoint copy as a backup/offline distribution
method.

## 4. Publishing an intentional update (versioning)

Every time *you* decide to change the app's logic:

1. Open `production-planner.html` in a text editor.
2. Near the top of the `<script>` section, find:
   ```js
   const APP_VERSION = '1.0.0';
   const APP_BUILD_DATE = '2026-07-23';
   ```
3. Bump the version (e.g. `1.1.0`) and set today's date.
4. Save, then upload the file to the SharePoint/OneDrive folder, overwriting the old one.
5. Let your users know a new build is out — the footer of the app (and Settings → Structure
   Integrity) always shows the current stamp, so anyone can check their copy matches.

If you ever see a copy of the file with a build date you don't recognize, or missing the
maintainer name you set in Settings, treat it as unverified and don't trust its logic.
