const express = require('express');
const items = require('../services/items');
const locations = require('../services/locations');
const checkouts = require('../services/checkouts');
const photosSvc = require('../services/photos');
const vendorLinks = require('../services/vendorLinks');
const activity = require('../services/activity');
const search = require('../services/search');
const config = require('../config');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('home', {
    title: 'ShopStock',
    categories: items.categoryCounts()
  });
});

router.get('/search', (req, res) => {
  let q = (req.query.q || '').trim();
  if (!q) return res.redirect('/');

  // A scanner reading a legacy QR label types the full URL — extract its code
  // (this also covers scans landing in the autofocused search box, where the
  // client-side wedge deliberately stays out of the way)
  const urlMatch = q.match(/\/(i|l)\/([A-Za-z0-9]{4,8})$/);
  if (urlMatch) q = urlMatch[2];

  // A typed-in shortcode goes straight to the thing
  const codeHit = search.byShortcode(q);
  if (codeHit) {
    return res.redirect(codeHit.type === 'item'
      ? `/items/${codeHit.id}` : `/locations/${codeHit.id}`);
  }

  const view = req.headers['hx-request'] ? 'partials/search-results' : 'search';
  res.render(view, {
    title: `Search: ${q}`,
    q,
    itemResults: search.items(q),
    locationResults: search.locations(q)
  });
});

router.get('/items/new', (req, res) => {
  res.render('item-form', {
    title: 'Add item',
    item: null,
    vendorLinksText: '',
    categories: items.categories(),
    locationOptions: locations.allWithPath(),
    units: items.UNITS,
    presetLocationId: req.query.location_id ? Number(req.query.location_id) : null
  });
});

router.get('/items/:id/edit', (req, res) => {
  const item = items.byId(req.params.id);
  if (!item) return res.status(404).render('not-found', { title: 'Not found' });
  res.render('item-form', {
    title: `Edit ${item.name}`,
    item,
    vendorLinksText: vendorLinks.toText(item.id),
    categories: items.categories(),
    locationOptions: locations.allWithPath(),
    units: items.UNITS,
    presetLocationId: null
  });
});

router.get('/items/:id', (req, res) => {
  const item = items.byId(req.params.id);
  if (!item) return res.status(404).render('not-found', { title: 'Not found' });
  res.render('item', {
    title: item.name,
    item,
    attrs: JSON.parse(item.attrs_json || '{}'),
    vendorLinks: vendorLinks.forItem(item.id),
    photos: photosSvc.forItem(item.id),
    openCheckout: checkouts.openCheckoutForItem(item.id),
    checkoutHistory: checkouts.historyForItem(item.id, 5),
    recentActivity: activity.forItem(item.id, 8),
    breadcrumb: item.location_id ? locations.breadcrumb(item.location_id) : []
  });
});

router.get('/items', (req, res) => {
  const categoryId = req.query.category ? Number(req.query.category) : null;
  const category = categoryId
    ? items.categories().find(c => c.id === categoryId) : null;
  res.render('items', {
    title: category ? category.name : 'All items',
    items: items.list({ categoryId }),
    category
  });
});

router.get('/locations', (req, res) => {
  res.render('locations', {
    title: 'Locations',
    roots: locations.roots().map(l => ({
      ...l, itemCount: locations.itemCountInSubtree(l.id)
    }))
  });
});

router.get('/locations/:id', (req, res) => {
  const loc = locations.byId(req.params.id);
  if (!loc) return res.status(404).render('not-found', { title: 'Not found' });
  res.render('location', {
    title: loc.name,
    loc,
    breadcrumb: locations.breadcrumb(loc.id),
    children: locations.children(loc.id).map(l => ({
      ...l, itemCount: locations.itemCountInSubtree(l.id)
    })),
    itemsHere: locations.itemsAt(loc.id),
    subtreeCount: locations.itemCountInSubtree(loc.id),
    kinds: locations.KINDS,
    locationOptions: locations.allWithPath()
  });
});

router.get('/low-stock', (req, res) => {
  res.render('low-stock', { title: 'Low stock', items: items.lowStock() });
});

router.get('/checkouts', (req, res) => {
  res.render('checkouts', { title: 'Checked out', checkouts: checkouts.allOpen() });
});

router.get('/people/:id', (req, res) => {
  const person = checkouts.personById(req.params.id);
  if (!person) return res.status(404).render('not-found', { title: 'Not found' });
  res.render('person', {
    title: person.name,
    person,
    open: checkouts.forPerson(person.id)
  });
});

router.get('/activity', (req, res) => {
  res.render('activity', { title: 'Activity', entries: activity.recent(100) });
});

// Human-friendly age for the backup health panel ("3 h ago"). The server and
// the person reading this run on the same PC, so local time is correct.
function ago(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (ms < 90 * 1000) return 'just now';
  const min = Math.round(ms / 60000);
  if (min < 90) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function fmtRun(r) {
  return {
    ...r,
    whenText: new Date(r.finished_at).toLocaleString(),
    agoText: ago(r.finished_at),
    sizeText: r.bytes == null ? null
      : r.bytes < 1048576 ? Math.max(1, Math.round(r.bytes / 1024)) + ' KB'
      : (r.bytes / 1048576).toFixed(1) + ' MB'
  };
}

router.get('/admin', (req, res) => {
  const backupSvc = require('../services/backup');
  const cfg = config.load();
  const usage = photosSvc.diskUsage();
  const db = require('../db').get();

  const lastOk = backupSvc.lastOk();
  const schedule = backupSvc.scheduleInfo(cfg);
  let nextDueText = null;
  if (schedule.mode === 'scheduled') {
    nextDueText = schedule.dueAtMs > Date.now()
      ? new Date(schedule.dueAtMs).toLocaleString() +
        (schedule.retrying ? ' (waiting out a failed attempt)' : '')
      : 'overdue — runs within a few minutes while the app is open';
  }

  res.render('admin', {
    title: 'Admin',
    config: cfg,
    photoUsage: usage,
    stats: {
      items: db.prepare('SELECT COUNT(*) AS n FROM items WHERE is_active = 1').get().n,
      locations: db.prepare('SELECT COUNT(*) AS n FROM locations').get().n,
      photos: db.prepare('SELECT COUNT(*) AS n FROM photos').get().n,
      people: db.prepare('SELECT COUNT(*) AS n FROM people').get().n
    },
    categories: items.categories(),
    saved: req.query.saved === '1',
    backup: {
      configured: backupSvc.isConfigured(cfg),
      running: backupSvc.isRunning(),
      lastOk: lastOk ? fmtRun(lastOk) : null,
      lastRun: backupSvc.lastRun() ? fmtRun(backupSvc.lastRun()) : null,
      runs: backupSvc.lastRuns(5).map(fmtRun),
      nextDueText,
      localDir: backupSvc.localFallbackDir(cfg)
    },
    backupFlash: req.query.backup || null,          // 'done' | 'busy'
    destProbe: req.query.dest || null,              // 'ok' | 'err'
    destProbeMsg: req.query.destmsg || ''
  });
});

module.exports = router;
