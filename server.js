const express = require('express');
const path = require('path');
const os = require('os');
const config = require('./src/config');
const db = require('./src/db');
const photos = require('./src/services/photos');

const cfg = config.load();
db.open(cfg.dataDir);
photos.init(cfg.dataDir);

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/photos', express.static(path.join(cfg.dataDir, 'photos'), {
  maxAge: '30d', immutable: true
}));

// Make config + nav badge counts available to every view
app.use((req, res, next) => {
  const items = require('./src/services/items');
  const checkouts = require('./src/services/checkouts');
  res.locals.cfg = config.load();
  res.locals.lowStockCount = items.lowStockCount();
  res.locals.openCheckoutCount = checkouts.openCount();
  res.locals.currentPath = req.path;
  next();
});

app.use('/', require('./src/routes/qr'));
app.use('/', require('./src/routes/pages'));
app.use('/', require('./src/routes/mutations'));
app.use('/', require('./src/routes/labels'));
app.use('/api', require('./src/routes/api'));

// 404 → search-style fallback page
app.use((req, res) => {
  res.status(404).render('not-found', { title: 'Not found' });
});

// Error handler: htmx requests get a fragment, full pages get the error page
app.use((err, req, res, next) => {
  console.error(err);
  const msg = err.message || 'Something went wrong';
  if (req.headers['hx-request']) {
    res.status(400).send(`<div class="flash flash-error">${escapeHtml(msg)}</div>`);
  } else {
    res.status(400).render('error', { title: 'Error', message: msg });
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

app.listen(cfg.port, cfg.bindHost, () => {
  console.log(`ShopStock running at http://localhost:${cfg.port}`);
  if (cfg.bindHost === '127.0.0.1' || cfg.bindHost === 'localhost') {
    console.log('Single-station mode: only this PC can reach the app (bindHost = 127.0.0.1).');
    return;
  }
  console.log(`Serving on the network (bindHost = ${cfg.bindHost}).`);
  if (!cfg.baseUrl) {
    console.warn('WARNING: baseUrl is not set in config.json — QR labels will not work until it is.');
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.warn(`  Likely LAN address: http://${net.address}:${cfg.port}`);
        }
      }
    }
  } else {
    console.log(`Base URL: ${cfg.baseUrl}`);
  }
});
