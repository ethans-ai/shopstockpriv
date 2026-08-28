# ShopStock — project log

Reconstructed from the commit history of both repos so any machine or session
can pick the work up cold. Dates are commit dates.

Two histories track the same work: development happens in
[`ethans-ai/shopstock`](https://github.com/ethans-ai/shopstock), and each
milestone is then re-bundled into this build repo (`shopstockpriv`) with a
version tag in `package.json`.

| Version | Build repo | Source repo | Date |
|---|---|---|---|
| — | — | `a7b3064` initial release | 2026-07-12 |
| 1.0 | `2f6633c` ready-to-run build | `1e383c4` single-station mode | 2026-07-16 |
| 1.1 | `d30598a` | `58fb378` vendor links | 2026-07-16 |
| 1.2 | `d87dd83` | `cacd40d` Fluent UI restyle | 2026-07-17 |
| 1.3 | `40509a2` | `c9c629a` off-PC backups | 2026-07-17 |
| 1.4 | `c2683cb` | `eba1181` admin PIN | 2026-07-18 |

---

## Initial release — 2026-07-12

Node/Express/SQLite app for shop inventory: nested storage locations, QR labels
with browser-print templates (Avery / Dymo / Zebra), stock quantity tracking
with a low-stock dashboard, tool check-out/check-in, photo uploads, full-text
search, activity logging. No accounts, no build step.

## v1.0 — single-station mode — 2026-07-16

**The pivot.** Work IT constraints ruled out a LAN web server, so the default
deployment became one lab PC with a USB barcode scanner.

- Server binds `127.0.0.1` by default (`bindHost`); LAN mode is opt-in.
- Scanner wedge in `app.js`: scan from any page to jump to an item/location.
  Scanner-speed bursts inside form fields are intercepted (field restored, no
  accidental submit), unrecognized codes swallowed safely, legacy QR-URL labels
  parsed both client- and server-side.
- Code 128 barcode labels (bwip-js) became the default type; QR retained. All
  four templates support both layouts.
- `start-shopstock.cmd` launcher: no admin, reads the configured port,
  CRLF-safe, `call node` to survive version-manager shims.
- `make-portable.ps1`: self-contained bundle with `node_modules` + `node.exe`
  (resolved via `process.execPath`, not PATH shims) for no-install deployment.
  **This build repo is that bundle's output.**

## v1.1 — per-item vendor links — 2026-07-16

Replaced the single `supplier`/`supplier_url` pair with a `vendor_links` table
(label + URL, ordered, AUTOINCREMENT ids so stale delete forms can't hit reused
rowids). Item page gets quick add/remove buttons; the edit form takes a bulk
`Vendor: URL` textarea that round-trips; the low-stock dashboard reorders from
each item's first link. URLs validated (http/https only, auto-https for bare
domains, part numbers rejected). Migration `002` backfills legacy rows.

## v1.2 — Fluent UI restyle — 2026-07-17

`app.css` rewritten as a Fluent 2 / Windows 11 design system: dark-first tokens
in `:root` with `[data-theme=light]` overrides, Segoe UI Variable stack (native
on Windows, nothing vendored), 4px controls / 8px surfaces, W11 input
bottom-stripe focus, nav pill indicator, translucent topbar. 36 Fluent UI System
Icons (MIT, `microsoft/fluentui-system-icons`) vendored as `public/img/icons.svg`
with a `partials/icon.ejs` helper; all emoji swept from views. Theme toggle
persisted in `localStorage` (`shopstock_theme`) with a no-FOUC bootstrap. Touch
targets deliberately unchanged (qty 64px, FAB 58px). Print media forces light and
hides chrome; label templates untouched (still black-on-white).

## v1.3 — off-PC backups — 2026-07-17

Protects against losing the single PC.

- Backup destination is runtime config, admin-editable, persisted to
  `config.json`: any folder IT provides (UNC share, mapped drive, second disk).
  Blank until decided — manual backups then fall back to `data\backups` with an
  explicit this-won't-survive-the-PC warning on `/admin`.
- One backup = one zip: SQLite backup-API snapshot (safe on the live WAL
  database) + photos + `manifest.json`. Zipped with Windows' built-in bsdtar, so
  no new dependency. Written as `.partial` then renamed, so a network drop never
  leaves a fake backup.
- In-app scheduler, active only once a destination is set: age-based and robust
  to restarts/sleep — backs up whenever the last success *to that destination* is
  older than `backupIntervalHours` (default 24, 0 = off). 5-minute poll, 45-second
  boot catch-up, hourly backoff while the share is offline.
- `backup_runs` table (migration `003`) powers the `/admin` health panel: last
  good backup, size, next due, failures with the real error, recent-runs list.
  Retention prunes zips older than `backupKeepDays` but never the newest one.
- `scripts\restore.ps1`: validates the zip before touching data, refuses to run
  while the server is up, moves old `shopstock.db*` aside into
  `data\pre-restore-<stamp>\` (the stale `-wal` replay trap), merges photos back.
- Adversarial-review fixes baked in: success recorded before pruning (a
  deny-delete share can't mark good backups failed), scheduler poll fully guarded,
  all destination filesystem work async (dead-UNC SMB timeouts can't freeze the
  app), photos staged with vanish-tolerant copies.

## v1.4 — admin PIN — 2026-07-18

**User decisions (2026-07-17):** config-only gating, one shared PIN, ~10-minute
idle re-lock. Everything else stays walk-up zero-friction — scanning, quantities,
checkouts, categories, and *Back up now* are all ungated.

- `src/services/auth.js`: scrypt `salt:hash` PIN in `config.json`
  (`adminPinHash`; `''` = unset, nothing gated, `/admin` nudges to set one; lost
  PIN = delete the line). Unlock is an HttpOnly `SameSite=Strict` cookie backed by
  an in-memory session with a sliding 10-minute idle expiry; restart relocks.
- Gated POSTs: `/admin/config` and `/admin/backup-config`. `SameSite=Strict` also
  closed the v1.3 review's CSRF-to-backup-destination note for those routes.
- Brute force: 5 wrong PINs → cooldown doubling per lockout (30 s … 15 min cap),
  reset on success, shared with the change-PIN form, honest countdown in the flash.
- Changing the PIN requires the current one and revokes every existing unlock, so
  rotating away from a compromised PIN can't leave stale sessions.
- **Backup manifests no longer embed `adminPinHash`** — the review's top finding:
  backup zips live on a multi-reader share and a short PIN's scrypt hash cracks
  offline in minutes.
- `/admin` UI: lockbar with inline unlock, disabled+dimmed fieldsets while locked,
  *Lock now*, set/change PIN forms. `DEPLOY.md` gained an Admin PIN section, and
  its LAN-mode checklist now leads with setting the PIN before flipping `bindHost`.

---

## Where things stand

Shipped and current at **v1.4**. Both repos are in sync at that version; the
default deployment is single-station (localhost-only, USB scanner).

## Open threads

Visible in the repo as unresolved — not a committed roadmap:

- **Backup destination is still blank by default.** v1.3 deliberately left it
  unset pending an IT-provided share; until someone sets it on `/admin`, backups
  land on the same PC they are meant to protect.
- **LAN mode (Mode 2 in `docs/DEPLOY.md`) has never been enabled** — it needs a
  firewall rule and a static IP, and QR label URLs become permanent once printed.
- **No test suite and no linter.** Changes are verified by running the app.
- **`docs/DEPLOY.md` is shared verbatim between the repos**, so in this build repo
  it points at `scripts\make-portable.ps1`, which the bundle deliberately omits.
  Harmless, but it will confuse anyone reading it from a ZIP install.
- **This repo's `README.md` is hand-maintained** and gets overwritten by
  `make-portable.ps1`; restore it after each regeneration (see `CLAUDE.md`).
