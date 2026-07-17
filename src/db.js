const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let db;

function open(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'photos', 'thumbs'), { recursive: true });

  db = new Database(path.join(dataDir, 'shopstock.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');

  migrate();
  return db;
}

function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
  );

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const version = parseInt(file.split('_')[0], 10);
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
    })();
    console.log(`Applied migration ${file}`);
  }
}

function get() {
  if (!db) throw new Error('Database not opened yet');
  return db;
}

module.exports = { open, get };
