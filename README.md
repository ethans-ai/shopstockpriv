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

The app serves `localhost` only — nothing is exposed to the network.
