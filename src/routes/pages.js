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

router.get('/admin', (req, res) => {
  const cfg = config.load();
  const usage = photosSvc.diskUsage();
  const db = require('../db').get();
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
    backupResult: null
  });
});

module.exports = router;
