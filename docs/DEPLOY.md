# Deploying ShopStock

Two deployment modes. **Single-station is the default** and needs no admin
rights, no firewall changes, and no IT involvement.

---

## Mode 1 — Single-station lab PC (default)

One PC in the lab runs everything. A USB barcode scanner is the input device.
The server binds to `127.0.0.1`, so nothing is reachable from the network.

### Option A: portable bundle (recommended for locked-down PCs)

On any Windows x64 machine where the app runs (e.g. your dev machine):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\make-portable.ps1
```

Copy `shopstock-portable.zip` to the lab PC (USB stick works), unzip anywhere —
`C:\shopstock`, a user folder, wherever you have write access — and double-click
**`start.cmd`**. That's it: the bundle carries its own `node.exe`, so the target
PC needs **no installs and no internet, ever**.

### Option B: normal install (if you can install Node and reach npm)

1. Install Node.js LTS from https://nodejs.org. (The zip/portable Node build also
   works without admin, but it does NOT add itself to PATH — you'd have to add its
   folder to your user PATH first. If you're reaching for the zip because installs
   are blocked, the portable bundle in Option A is the better answer.)
2. ```powershell
   git clone https://github.com/ethans-ai/shopstock   # or copy the folder
   cd shopstock        # <- npm MUST run inside the project folder
   npm install
   ```
3. Double-click `scripts\start-shopstock.cmd`.

> **The errors you get if you skip `cd`:** npm EPERM on
> `C:\WINDOWS\system32\package-lock.json`, "Cannot find module
> ...system32\scripts\seed-demo.js", ENOENT package.json — all mean the shell's
> working directory is not the project folder.

### Auto-start at login (no admin)

Win+R → `shell:startup` → Enter, then put a shortcut to `start.cmd` (portable)
or `scripts\start-shopstock.cmd` (normal install) in that folder. The launcher
is idempotent — if the server is already running it just opens the browser.

### Barcode scanner

Plug in any USB HID ("keyboard wedge") scanner. Defaults are almost always
right: it types the code and sends Enter. Scan from any page in the app — it
jumps to the scanned item/location. Print labels from `/labels` with code type
**Barcode (Code 128)**. Run the ruler calibration page (`/admin`) once per
printer before a big label batch.

### Backups (protect against losing this PC)

**Built in — set it up once on `/admin`:** enter a backup destination folder
(a network share / UNC path like `\\fileserver\share\shopstock-backups`, or a
second drive) and the app backs itself up automatically while it is running —
by default every 24 h, keeping 30 days of zips. Each backup is a single zip
holding a consistent database snapshot (safe while the app is in use), all
photos, and a manifest. The Backups panel on `/admin` shows the last good
backup, its size, and any errors (e.g. share offline — the app keeps running
and retries).

Ask IT for any folder this PC's user account can write to; paste it on
`/admin`, save (reachability is checked immediately), then click **Back up
now** once to verify end-to-end. Until a destination is configured, manual
backups land in `data\backups` on the same PC — better than nothing, but they
do not survive losing the machine.

**Alternative (app not running / belt-and-braces):** schedule
`scripts\backup.ps1` daily in Task Scheduler (works per-user, no admin):

```
Program:   powershell
Arguments: -NoProfile -ExecutionPolicy Bypass -File C:\shopstock\scripts\backup.ps1 -Dest "\\fileserver\share\shopstock-backups"
```

Both zips restore the same way with `scripts\restore.ps1` (the in-app zip
additionally carries a `manifest.json` with counts and a settings snapshot).

### Restore

With the server **stopped** (close its console window):

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\restore.ps1 -Zip "\\fileserver\share\shopstock-backups\shopstock-2026-07-17_0200.zip"
```

The script refuses to run while the server is up, validates the zip, moves the
old `shopstock.db*` files aside into `data\pre-restore-<stamp>\` (kept until
you delete them), and merges photos back in. It exists because of a real trap
in doing it by hand: **a stale `data\shopstock.db-wal` file left next to a
restored database gets replayed into it and corrupts it.** If you must restore
manually, delete `data\shopstock.db`, `-wal`, and `-shm` first, then unzip the
backup into `data\`.

### Admin PIN (optional but recommended)

Set an admin PIN on `/admin` (Admin PIN section). Once set, **server config
and backup settings** require unlocking with the PIN; the unlock re-locks
itself after ~10 minutes without an admin action. Everything else — scanning,
quantities, checkouts, adding items, printing — stays open; the station is
still walk-up zero-friction.

The PIN is stored as a salted scrypt hash in `config.json` (`adminPinHash`),
never in plain text, and is deliberately left out of backup zips. Wrong-PIN
attempts are rate-limited (5 tries, then a cooldown that doubles with each
lockout). Changing the PIN signs out every unlocked browser. **Lost PIN:**
stop the server, delete the `adminPinHash` line from `config.json`, start
again — the app is back to open, set a new PIN.

---

## Mode 2 — LAN server (phones + QR labels)

Only if/when IT is on board. Needs an inbound firewall rule and a static
IP/DHCP reservation **before printing QR labels** (printed URLs are permanent).

1. **Set an admin PIN on `/admin` first** — setting the *first* PIN is open
   to whoever gets there first, which is fine on a locked single PC but not
   once the whole network can reach the app. Do this before flipping bindHost.
2. **Set `"bindHost": "0.0.0.0"` in `config.json`** and restart the server —
   without this the server only listens on 127.0.0.1 and no other device can
   connect, no matter what the firewall allows.
3. `New-NetFirewallRule -DisplayName "ShopStock" -Direction Inbound -LocalPort 8340 -Protocol TCP -Action Allow -Profile Domain,Private` (elevated)
4. Set the Base URL on `/admin` to `http://<static-ip>:8340`.
5. Install as a service so it survives reboots: `scripts\install-service.ps1`
   (uses NSSM, elevated).
6. Test phone → PC reachability before printing labels. If it fails, check
   bindHost first (step 2), then corporate Wi-Fi client isolation / guest VLAN.
7. Print QR labels (code type dropdown on `/labels`). Phones scan with the
   native camera app — no app install needed.

Both modes can coexist: a LAN deployment still works with the USB scanner, and
2D scanners read the QR labels too.

---

## Maintenance notes

- **Don't upgrade Node casually** — `better-sqlite3` and `sharp` are native
  modules built per Node version. After a Node upgrade run `npm rebuild`.
  (The portable bundle is immune: its runtime is pinned inside the zip.)
- All state is the `data\` folder (DB + photos). Code is stateless.
- Reset to empty: stop server, delete `data\shopstock.db*` and `data\photos\*`,
  start again. `node scripts/seed-demo.js` (or `seed-demo.cmd` in the portable
  bundle) loads demo data into an empty DB.
