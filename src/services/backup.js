// Full backup = consistent DB snapshot (SQLite backup API, safe on a live WAL
// database) + photos + manifest, zipped and written to the configured
// destination (network share / UNC path / second drive — cfg.backupDest).
// The destination is runtime config: it may be blank (not decided yet), offline
// (share unreachable — record the error, never crash the app), or changed on
// /admin at any time. With no destination set, manual backups fall back to
// data/backups on this PC and the scheduler stays off.
//
// Zipping uses Windows' built-in bsdtar (C:\Windows\System32\tar.exe,
// ships with Windows 10 1803+) — no npm dependency, no PowerShell spawn.
//
// Every operation that touches the DESTINATION uses async fs: sync calls
// against a dead UNC path block the event loop for the whole SMB timeout,
// freezing every request the app is serving. Local staging stays sync (fast).

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../config');
const db = require('../db');

const state = { running: false };

const HISTORY_KEEP = 200;          // backup_runs rows retained
const CHECK_MS = 5 * 60 * 1000;    // scheduler poll interval
const RETRY_BACKOFF_MS = 60 * 60 * 1000; // min gap between failed scheduled attempts

function isConfigured(cfg) {
  return !!(cfg.backupDest && String(cfg.backupDest).trim());
}

function localFallbackDir(cfg) {
  return path.join(cfg.dataDir, 'backups');
}

// Filename-safe local-time stamp, e.g. 2026-07-17_143205 (same family as
// scripts/backup.ps1 so one prune pattern covers both).
function stamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
         `_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function zipWith(tarArgs) {
  return new Promise((resolve, reject) => {
    const proc = spawn('tar.exe', tarArgs, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('error', err => {
      reject(err.code === 'ENOENT'
        ? new Error('tar.exe not found (needs Windows 10 1803+). Use scripts\\backup.ps1 instead.')
        : err);
    });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`zip failed (tar exit ${code}): ${stderr.trim().slice(0, 300)}`));
    });
  });
}

// Photos can be DELETED from the UI while a backup runs, so copy them into
// staging one by one, tolerating files that vanish mid-walk — tar would fail
// the whole backup over a single missing file.
function stagePhotos(srcDir, destDir) {
  let entries;
  try {
    entries = fs.readdirSync(srcDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return; // photos dir itself gone — nothing to stage
    throw err;
  }
  fs.mkdirSync(destDir, { recursive: true });
  for (const e of entries) {
    const from = path.join(srcDir, e.name);
    const to = path.join(destDir, e.name);
    try {
      if (e.isDirectory()) stagePhotos(from, to);
      else if (e.isFile()) fs.copyFileSync(from, to);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err; // vanished mid-backup: skip, don't fail
    }
  }
}

function record(row) {
  const d = db.get();
  d.prepare(
    `INSERT INTO backup_runs (started_at, finished_at, ok, source, dest, bytes, error)
     VALUES (@started_at, @finished_at, @ok, @source, @dest, @bytes, @error)`
  ).run({ dest: null, bytes: null, error: null, ...row });
  d.prepare(
    `DELETE FROM backup_runs
     WHERE id <= (SELECT MAX(id) FROM backup_runs) - ?`
  ).run(HISTORY_KEEP);
}

// Retention at the destination. Never deletes the newest zip: if backups have
// silently failed for longer than keepDays, the last good one must survive.
// Runs AFTER the run is recorded as successful and failures here must never
// mark the backup itself failed — on an append-only share (deny-delete ACLs,
// a common ransomware protection) every delete throws EPERM forever, and the
// backups are still perfectly good.
async function prune(destDir, keepDays) {
  const names = await fsp.readdir(destDir);
  // Half-copied leftovers from a run that died mid-copy. Cleaned regardless of
  // retention settings (keepDays 0 = keep zips forever, not keep junk forever).
  for (const f of names) {
    if (!f.endsWith('.partial')) continue;
    const full = path.join(destDir, f);
    if ((await fsp.stat(full)).mtimeMs < Date.now() - 86400000) {
      await fsp.rm(full, { force: true });
    }
  }
  if (!(keepDays > 0)) return;
  const zips = [];
  for (const f of names) {
    if (!/^shopstock-.*\.zip$/i.test(f)) continue;
    const full = path.join(destDir, f);
    zips.push({ full, mtime: (await fsp.stat(full)).mtimeMs });
  }
  zips.sort((a, b) => b.mtime - a.mtime);
  const cutoff = Date.now() - keepDays * 86400000;
  for (const z of zips.slice(1)) {
    if (z.mtime < cutoff) await fsp.rm(z.full, { force: true });
  }
}

// Always resolves: { ok, file, bytes } | { ok: false, error } | { busy: true }.
// Failures (share offline, tar missing, ...) are recorded in backup_runs and
// surfaced on /admin — a backup must never take the app down with it.
async function run(source) {
  if (state.running) return { busy: true };
  state.running = true;
  const startedAt = new Date().toISOString();
  const cfg = config.load();
  const destDir = isConfigured(cfg) ? String(cfg.backupDest).trim() : localFallbackDir(cfg);
  let staging, tmpZip;
  try {
    staging = fs.mkdtempSync(path.join(os.tmpdir(), 'shopstock-backup-'));
    await db.get().backup(path.join(staging, 'shopstock.db'));

    const d = db.get();
    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify({
      app: 'shopstock',
      version: require('../../package.json').version,
      created_at: startedAt,
      source,
      counts: {
        items: d.prepare('SELECT COUNT(*) AS n FROM items WHERE is_active = 1').get().n,
        locations: d.prepare('SELECT COUNT(*) AS n FROM locations').get().n,
        photos: d.prepare('SELECT COUNT(*) AS n FROM photos').get().n
      },
      // Settings snapshot so a from-scratch PC rebuild can be reconstructed.
      // adminPinHash stays out: backup zips live on a multi-reader share, and
      // a short PIN's scrypt hash cracks offline in minutes (a rebuilt PC
      // just sets a fresh PIN).
      config: { ...cfg, adminPinHash: undefined }
    }, null, 2));

    stagePhotos(path.join(cfg.dataDir, 'photos'), path.join(staging, 'photos'));

    tmpZip = staging + '.zip';
    const args = ['-a', '-c', '-f', tmpZip, '-C', staging, 'shopstock.db', 'manifest.json'];
    if (fs.existsSync(path.join(staging, 'photos'))) args.push('photos');
    await zipWith(args);

    // .partial + rename so a half-copied zip on the share never looks like a
    // completed backup (network drop mid-copy leaves only a .partial behind)
    await fsp.mkdir(destDir, { recursive: true });
    const finalPath = path.join(destDir, `shopstock-${stamp()}.zip`);
    await fsp.copyFile(tmpZip, finalPath + '.partial');
    await fsp.rename(finalPath + '.partial', finalPath);
    const bytes = (await fsp.stat(finalPath)).size;

    // The backup is complete and safe on the destination — record the success
    // BEFORE retention, so a prune failure can never mark this run failed.
    record({ started_at: startedAt, finished_at: new Date().toISOString(),
             ok: 1, source, dest: finalPath, bytes });

    try {
      await prune(destDir, cfg.backupKeepDays);
    } catch (err) {
      console.error(`Backup retention cleanup failed (backup itself succeeded): ${err.message || err}`);
    }

    return { ok: true, file: finalPath, bytes };
  } catch (err) {
    const error = String(err.message || err).slice(0, 500);
    try {
      record({ started_at: startedAt, finished_at: new Date().toISOString(),
               ok: 0, source, dest: destDir, error });
    } catch (e2) {
      console.error('Could not record backup failure:', e2);
    }
    console.error(`Backup failed (${source}):`, error);
    return { ok: false, error };
  } finally {
    state.running = false;
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
    if (tmpZip) fs.rmSync(tmpZip, { force: true });
  }
}

function lastRuns(limit = 5) {
  return db.get().prepare('SELECT * FROM backup_runs ORDER BY id DESC LIMIT ?').all(limit);
}

function lastOk() {
  return db.get().prepare('SELECT * FROM backup_runs WHERE ok = 1 ORDER BY id DESC LIMIT 1').get();
}

function lastRun() {
  return db.get().prepare('SELECT * FROM backup_runs ORDER BY id DESC LIMIT 1').get();
}

// Latest success written to THIS destination dir. The scheduler keys off this,
// not lastOk(): after the destination is set (or changed), an earlier success
// to data/backups or the old share must not delay the first backup to the new
// place by a whole interval. Windows paths → case-insensitive compare.
function lastOkForDest(destDir) {
  const want = path.resolve(destDir).toLowerCase();
  return db.get()
    .prepare('SELECT * FROM backup_runs WHERE ok = 1 ORDER BY id DESC')
    .all()
    .find(r => r.dest && path.resolve(path.dirname(r.dest)).toLowerCase() === want);
}

function isRunning() {
  return state.running;
}

// One source of truth for "when does the scheduler act next" — /admin renders
// exactly this instead of re-deriving (and mis-stating) the backoff behavior.
// Returns { mode: 'unconfigured' | 'off' | 'scheduled', dueAtMs, retrying }.
function scheduleInfo(cfg) {
  if (!isConfigured(cfg)) return { mode: 'unconfigured' };
  if (!(cfg.backupIntervalHours > 0)) return { mode: 'off' };
  const destDir = String(cfg.backupDest).trim();
  const ok = lastOkForDest(destDir);
  let dueAtMs = ok ? Date.parse(ok.finished_at) + cfg.backupIntervalHours * 3600000 : 0;
  let retrying = false;
  const last = lastRun();
  if (last && !last.ok && last.source === 'scheduled') {
    const backoffEnd = Date.parse(last.finished_at) + RETRY_BACKOFF_MS;
    if (backoffEnd > Date.now() && backoffEnd > dueAtMs) {
      dueAtMs = backoffEnd;
      retrying = true;
    }
  }
  return { mode: 'scheduled', dueAtMs, retrying };
}

// In-app scheduler: while the server runs, back up whenever the last success
// to the configured destination is older than backupIntervalHours. Age-based
// (not clock-time) so it is robust to the PC sleeping, the app restarting, or
// the share being offline for a stretch. Only active once a destination is
// configured — a schedule that only ever writes to the same PC would be false
// comfort. The whole body is guarded: this runs as a bare timer callback, and
// a stray throw (config.json mid-edit, sick DB) must not crash the app.
async function check() {
  try {
    const cfg = config.load();
    const info = scheduleInfo(cfg);
    if (info.mode !== 'scheduled' || info.dueAtMs > Date.now()) return;
    await run('scheduled');
  } catch (err) {
    console.error('Scheduled backup check failed:', err.message || err);
  }
}

function startScheduler() {
  setInterval(check, CHECK_MS).unref();
  // First check soon after boot: an overdue backup runs right away instead of
  // waiting out the poll interval (lab PC may have been off for days)
  setTimeout(check, 45 * 1000).unref();
}

module.exports = {
  run, prune, lastRuns, lastOk, lastRun, lastOkForDest, isRunning,
  isConfigured, localFallbackDir, scheduleInfo, startScheduler, CHECK_MS
};
