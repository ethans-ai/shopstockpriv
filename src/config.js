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
  siteName: 'ShopStock'
};

function load() {
  let fileCfg = {};
  if (fs.existsSync(CONFIG_PATH)) {
    fileCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }
  // Blank values fall back to defaults (baseUrl is legitimately blank until configured)
  for (const key of ['port', 'bindHost', 'dataDir', 'siteName']) {
    if (fileCfg[key] === '' || fileCfg[key] === null || fileCfg[key] === undefined) delete fileCfg[key];
  }
  return { ...defaults, ...fileCfg };
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
