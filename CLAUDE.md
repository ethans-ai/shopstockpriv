# ShopStock — project context

Parts inventory + barcode/QR labeling for a powertrain test-engineering lab.
Runs on **one Windows PC**, no accounts, no cloud, no build step. A USB barcode
scanner is the primary input device: scan any printed label from any page and
the app jumps to that item or location.

## Read this first: which repo am I in?

There are two repos and **this one is generated output**.

| Repo | Role |
|---|---|
| [`ethans-ai/shopstock`](https://github.com/ethans-ai/shopstock) | **Source of truth.** All development happens here. |
| `ethans-ai/shopstockpriv` (this repo) | **Derived build.** Source + `node_modules` + a bundled `node.exe`, so a locked-down PC can download a ZIP and run it with no installs, no admin rights, no internet. |

`src/`, `public/`, `server.js`, `package.json` and `docs/DEPLOY.md` are
**byte-identical** to the source repo. They are produced by
`scripts/make-portable.ps1` (which lives only in the source repo) and committed
here.

**So: make code changes in `ethans-ai/shopstock`, then regenerate this bundle.**
A code edit made only here is undone the next time the bundle is rebuilt.

### Regenerating this repo

On a Windows x64 machine with the source repo working and `npm install` done:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\make-portable.ps1
```

That stages `server.js`, `package.json`, `package-lock.json`,
`config.example.json`, `README.md`, `src/`, `public/`, `scripts/`, `docs/`,
`node_modules/`; adds `node.exe`, `NODE_VERSION.txt`, `start.cmd`,
`seed-demo.cmd`, `README-PORTABLE.txt`; and drops `start-shopstock.cmd` and
`make-portable.ps1` (both assume Node on PATH — shipping them would be a
silent-failure trap). Unzip the result over this repo's working tree and commit.

**Gotcha:** `README.md` here is *hand-maintained* and different from the source
repo's — it documents the Download-ZIP install path instead of the dev setup.
`make-portable.ps1` copies the source README over it, so after regenerating,
restore this repo's README before committing.

## Stack

Node 24 · Express 5 · EJS server-rendered views · htmx for partial updates ·
better-sqlite3 (WAL) · bwip-js + qrcode for labels · sharp for photo thumbs ·
multer for uploads. **No frontend framework and no build step** — `public/js/app.js`
is plain JS, `public/css/app.css` is hand-written (Fluent / Windows 11 look, with
dark mode). Keep it that way; the whole point is that a lab PC can run the app
straight from a ZIP.

## Layout

```
server.js              app wiring, static mounts, error handler, listen
src/config.js          config.json load/save; only non-default keys are persisted
src/db.js              opens SQLite, runs src/migrations/*.sql in order
src/routes/
  pages.js             GET page renders (htmx-aware: returns a partial when HX-Request)
  mutations.js         POST handlers
  api.js  labels.js  qr.js
src/services/          business logic, one module per domain
  items locations checkouts search shortcodes activity
  photos barcode qr vendorLinks backup auth
src/views/             EJS pages + partials/
src/labels/templates/  label sheet layouts (Avery 5160, Dymo 30252/30334, Zebra 2x1, ruler)
src/migrations/        001_init, 002_vendor_links, 003_backup_runs
scripts/               backup.ps1, restore.ps1, install-service.ps1, seed-demo.js
```

## Conventions

- **Routes stay thin**; logic lives in `src/services/*`. Routers are mounted at
  `/` (except `api.js` at `/api`) and are order-sensitive in `server.js`.
- **htmx**: a handler checks `req.headers['hx-request']` and renders a partial
  (`src/views/partials/...`) instead of a full page. The error handler does the
  same — fragment for htmx, full error page otherwise.
- **Express 5 quirk**: `req.body` is `undefined` when nothing was parsed; a
  middleware in `server.js` normalizes it to `{}`. Don't remove it.
- **Migrations are append-only.** Add `NNN_name.sql`; never edit an applied one.
  They run automatically on start, inside a transaction, tracked in
  `schema_migrations`.
- **No accounts.** Actions are attributed by a person name kept in
  `localStorage` (`shopstock_person`) and posted in hidden `.person-hidden` fields.
- **Comments carry decisions, not narration** — see `src/services/auth.js`, which
  records the actual product decisions and their dates. Follow that style.

## State and configuration

- All state is `data/` (`shopstock.db` + `-wal`/`-shm`, and `photos/`). Code is
  stateless. `data/` and `config.json` are **not** committed and are absent from
  the ZIP, so upgrading in place never touches a user's inventory.
- `config.json` is written from the `/admin` page, never hand-edited.
  `src/config.js` persists only keys that differ from defaults, so a copied
  project folder doesn't drag another machine's absolute `dataDir` with it.
- Defaults: port `8340`, `bindHost` `127.0.0.1` (localhost-only), 24 h backups,
  30-day retention.

## Gotchas

- **Never copy `shopstock.db` alone.** A stale `data/shopstock.db-wal` next to a
  restored database gets replayed into it and corrupts it. Move `data/` as a
  whole, or use `scripts/restore.ps1`, which handles this.
- **`better-sqlite3` and `sharp` are native modules** built per Node version.
  After a Node upgrade, `npm rebuild`. The bundle here is immune — its runtime
  is pinned (`NODE_VERSION.txt`: Node v24.15.0 win-x64).
- **QR label URLs are permanent once printed.** Fix `baseUrl` and the machine's
  IP *before* printing QR labels in LAN mode.
- **Set the admin PIN before enabling LAN mode.** Setting the *first* PIN is open
  to whoever reaches `/admin` first — fine on a locked single PC, not once the
  network can reach the app. Lost PIN: stop the server, delete the
  `adminPinHash` line from `config.json`, restart.
- `.gitattributes` here is `* -text`, so the `.ps1` scripts are stored with LF
  while the source repo has CRLF. Content is identical; ignore that diff.

## Running it

- **Windows, this bundle:** double-click `start.cmd` → http://localhost:8340.
  Demo data into an empty DB: `seed-demo.cmd`.
- **Dev (source repo):** `npm install` then `npm run dev` (`node --watch server.js`).
- **This repo will not boot on Linux/macOS as-is.** Its vendored `node_modules`
  are win32-x64 builds — `sharp` fails at require time, before the server
  starts (`@img/sharp-win32-x64` is the only platform package present). To run
  or develop from a clone on a non-Windows machine, `npm install` first, which
  fetches that platform's binaries. Reading and editing code needs nothing.
- There is **no test suite** and no linter configured. Verify changes by running
  the app and exercising the affected page.

Deployment, backup/restore, LAN mode and the admin PIN are documented in
`docs/DEPLOY.md`. Version-by-version history is in `docs/PROJECT-LOG.md`.
