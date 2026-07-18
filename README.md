# ShopStock — ready-to-run build

This repo is the **self-contained, ready-to-run build** of ShopStock (parts
inventory + barcode labeling for the test lab). It carries its own Node.js
runtime — the target PC needs **no installs, no admin rights, and no internet
after download**.

Source code lives in the main [shopstock](https://github.com/ethans-ai/shopstock)
repo; this one exists purely for easy installation on locked-down PCs.

## Install (pick either)

**A — Download ZIP (no git needed):**
1. Green **Code** button (top right) → **Download ZIP**
2. Unzip anywhere you have write access — `C:\shopstock`, a user folder, whatever
3. Double-click **`start.cmd`** → the app opens at http://localhost:8340

**B — Release asset:** grab `shopstock-portable.zip` from the
[latest release](../../releases/latest) and unzip — identical contents, single file.

## After install

- **Demo data** (optional, empty database only): double-click `seed-demo.cmd`
- **Auto-start at login**: Win+R → `shell:startup` → drop in a shortcut to `start.cmd`
- **Barcode scanner**: plug in any USB scanner — it works immediately; scan any
  printed label from any page in the app
- **Print labels**: Labels page → Code 128 → Avery 5160 sheet on any office printer
- **Your inventory lives in the `data\` subfolder** it creates on first run —
  back that folder up (see `docs/DEPLOY.md`; `scripts\backup.ps1` is scheduled-task ready)

## Upgrading (your data is safe)

Everything you've built — locations, sub-locations, items, quantities,
checkouts, history, photos — lives in the `data\` subfolder, and settings in
`config.json`. **Neither ships in this repo or the zip**, so upgrading never
overwrites them. Any database updates a new version needs are applied
automatically on first start.

1. Close the ShopStock server window (the minimized `ShopStock server`
   console), or just reboot.
2. Download the new version (either install path above) and unzip.
3. Copy the new files **over your existing install folder**, replacing when
   asked — `data\` and `config.json` aren't in the download, so they're left
   untouched. (The Download ZIP path unzips into a `shopstockpriv-main\`
   wrapper folder — copy that folder's *contents* over your install folder.)
   *Or*, if you prefer a fresh folder: unzip anywhere new, then **move** your
   old `data\` folder (and `config.json`, if you created one) into it.
4. Always move or copy `data\` as a whole — `shopstock.db` together with any
   `shopstock.db-wal` / `-shm` files and the `photos\` subfolder. Never the
   `.db` file alone; the most recent changes live in the `-wal` file.
5. Double-click `start.cmd` — everything is right where you left it.

The app serves `localhost` only — nothing is exposed to the network.
