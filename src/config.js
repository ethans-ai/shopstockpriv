const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

const defaults = {
  port: 8340,
  // 127.0.0.1 = single-station mode: only this PC can reach the app (no firewall
  // rules, no network exposure). Set to "0.0.0.0" to serve phones/PCs on the LAN.
  bindHost: '127.0.0.1',
  baseUrl: '',            // for LAN mode QR labels, e.g. "http://192.168.1.50:8340"
  dataDir: path.join(__dirname, '..', 'data'),
  siteName: 'ShopStock',
  // Off-PC backup destination (network share / UNC path / second drive).
  // Blank until the user's IT department decides where backups should live —
  // manual backups then fall back to data/backups on this PC and the
  // scheduler stays off. Set it on /admin; no code edit or restart needed.
  backupDest: '',
  backupIntervalHours: 24,  // 0 disables the in-app scheduler
  backupKeepDays: 30        // 0 keeps backups forever
};

function load() {
  let fileCfg = {};
  if (fs.existsSync(CONFIG_PATH)) {
    fileCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }
  // Blank values fall back to defaults (baseUrl and backupDest are
  // legitimately blank until configured)
  for (const key of ['port', 'bindHost', 'dataDir', 'siteName', 'backupIntervalHours', 'backupKeepDays']) {
    if (fileCfg[key] === '' || fileCfg[key] === null || fileCfg[key] === undefined) delete fileCfg[key];
  }
  const cfg = { ...defaults, ...fileCfg };
  // Hand-edited config.json may hold strings/garbage for the numeric knobs
  for (const key of ['backupIntervalHours', 'backupKeepDays']) {
    const n = Number(cfg[key]);
    cfg[key] = Number.isFinite(n) && n >= 0 ? n : defaults[key];
  }
  return cfg;
}

function save(updates) {
  const current = load();
  const next = { ...current, ...updates };
  // Only persist values that differ from defaults, so a copied project folder
  // doesn't carry another machine's absolute dataDir along with it.
  const toWrite = {};
  for (const key of Object.keys(defaults)) {
    if (next[key] !== defaults[key]) toWrite[key] = next[key];
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(toWrite, null, 2));
  return next;
}

module.exports = { load, save, CONFIG_PATH };
