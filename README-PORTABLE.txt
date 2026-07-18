ShopStock portable bundle
=========================
1. Unzip this folder anywhere you have write access (C:\shopstock, a user
   folder, etc.). No installs, no admin rights, no internet needed.
2. Double-click start.cmd  ->  the app opens at http://localhost:8340
3. Optional demo data (empty database only): double-click seed-demo.cmd
4. Auto-start at login: Win+R -> shell:startup -> put a shortcut to start.cmd there.

Ignore the Quick start section in README.md - it describes the git/npm
developer setup. This bundle is self-contained; start.cmd is all you need.
Your inventory lives in the data\ subfolder - back that folder up.

Upgrading from an older version (keeps ALL your data)
-----------------------------------------------------
Everything you have built (locations, sub-locations, items, quantities,
checkouts, history, photos) lives in the data\ subfolder, and settings in
config.json. Neither is inside this zip, so upgrading never touches them.

1. Close the ShopStock server window first (or reboot) so the database
   is not mid-write.
2. EITHER unzip the new version straight over your existing folder,
   replacing files when asked - data\ and config.json are not in the zip,
   so they are left alone.
   OR unzip to a new folder, then MOVE the old install's data\ folder
   (and config.json, if you made one) into the new folder before starting.
3. Copy or move the data\ folder as a whole - shopstock.db together with
   any shopstock.db-wal / -shm files and the photos\ subfolder. Never copy
   the .db file by itself; recent changes live in the -wal file.
4. Double-click start.cmd. Any database updates a new version needs are
   applied automatically on first start.
