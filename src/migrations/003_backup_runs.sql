-- Backup run history: powers the backup health panel on /admin. One row per
-- in-app attempt (manual button or scheduler); runs of the external
-- scripts/backup.ps1 are not recorded here.

-- AUTOINCREMENT: old rows are pruned as history grows; without it SQLite
-- could reuse freed rowids and break "newest = highest id" ordering.
CREATE TABLE backup_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  TEXT NOT NULL,            -- ISO 8601 UTC, written by the app
  finished_at TEXT NOT NULL,
  ok          INTEGER NOT NULL,         -- 1 success / 0 failure
  source      TEXT NOT NULL,            -- 'manual' | 'scheduled'
  dest        TEXT,                     -- zip path on success, target dir on failure
  bytes       INTEGER,                  -- zip size on success
  error       TEXT                      -- failure message
);
