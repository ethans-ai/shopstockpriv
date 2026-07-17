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

### Backups (still worth doing on a single PC)

Schedule daily in Task Scheduler (works per-user, no admin):

```
Program:   powershell
Arguments: -NoProfile -ExecutionPolicy Bypass -File C:\shopstock\scripts\backup.ps1 -Dest "D:\shopstock-backups"
```

Point `-Dest` at a network share or second drive if available. The script uses
the SQLite backup API (safe while the app runs) and zips photos alongside.

**Restore:** stop the server, then **delete `data\shopstock.db`, `data\shopstock.db-wal`,
and `data\shopstock.db-shm`** (a stale `-wal` file left in place would be replayed
into the restored database and corrupt it), unzip the backup into `data\`, start again.

---

## Mode 2 — LAN server (phones + QR labels)

Only if/when IT is on board. Needs an inbound firewall rule and a static
IP/DHCP reservation **before printing QR labels** (printed URLs are permanent).

1. **Set `"bindHost": "0.0.0.0"` in `config.json`** and restart the server —
   without this the server only listens on 127.0.0.1 and no other device can
   connect, no matter what the firewall allows.
2. `New-NetFirewallRule -DisplayName "ShopStock" -Direction Inbound -LocalPort 8340 -Protocol TCP -Action Allow -Profile Domain,Private` (elevated)
3. Set the Base URL on `/admin` to `http://<static-ip>:8340`.
4. Install as a service so it survives reboots: `scripts\install-service.ps1`
   (uses NSSM, elevated).
5. Test phone → PC reachability before printing labels. If it fails, check
   bindHost first (step 1), then corporate Wi-Fi client isolation / guest VLAN.
6. Print QR labels (code type dropdown on `/labels`). Phones scan with the
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
