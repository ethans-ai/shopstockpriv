const express = require('express');
const multer = require('multer');
const items = require('../services/items');
const locations = require('../services/locations');
const checkouts = require('../services/checkouts');
const photos = require('../services/photos');
const config = require('../config');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Person name travels in a hidden field (prefilled from localStorage client-side)
function who(req) {
  const name = (req.body.person_name_hidden || req.body.person_name || '').trim();
  return name || null;
}

router.post('/items', (req, res, next) => {
  try {
    const id = items.create(req.body, who(req));
    res.redirect(`/items/${id}`);
  } catch (err) { next(err); }
});

router.post('/items/:id', (req, res, next) => {
  try {
    items.update(req.params.id, req.body, who(req));
    res.redirect(`/items/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/items/:id/delete', (req, res, next) => {
  try {
    items.softDelete(req.params.id, who(req));
    res.redirect('/items');
  } catch (err) { next(err); }
});

router.post('/items/:id/qty', (req, res, next) => {
  try {
    const id = req.params.id;
    let qty;
    if (req.body.set !== undefined && req.body.set !== '') {
      qty = items.setQuantity(id, req.body.set, who(req));
    } else {
      qty = items.changeQuantity(id, Number(req.body.delta) || 0, who(req));
    }
    if (req.headers['hx-request']) {
      const item = items.byId(id);
      return res.render('partials/qty-controls', { item });
    }
    res.redirect(`/items/${id}`);
  } catch (err) { next(err); }
});

router.post('/items/:id/move', (req, res, next) => {
  try {
    items.moveToLocation(req.params.id, req.body.location_id ? Number(req.body.location_id) : null, who(req));
    res.redirect(`/items/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/items/:id/checkout', (req, res, next) => {
  try {
    const name = (req.body.person_name || '').trim();
    if (!name) throw new Error('Enter your name to check out');
    if (req.body.takeover === '1') {
      checkouts.takeOver(req.params.id, name, req.body.note);
    } else {
      checkouts.checkout(req.params.id, name, req.body.note);
    }
    res.redirect(`/items/${req.params.id}`);
  } catch (err) {
    if (err.code === 'ALREADY_OUT') {
      const item = items.byId(req.params.id);
      return res.status(409).render('checkout-conflict', {
        title: 'Already checked out',
        item,
        existing: err.existing,
        attemptedName: (req.body.person_name || '').trim(),
        attemptedNote: (req.body.note || '').trim()
      });
    }
    next(err);
  }
});

router.post('/items/:id/checkin', (req, res, next) => {
  try {
    checkouts.checkin(req.params.id, who(req));
    if (req.headers['hx-request'] && req.body.from === 'list') {
      return res.send(''); // row removes itself
    }
    res.redirect(req.body.redirect || `/items/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/items/:id/vendor-links', (req, res, next) => {
  try {
    const vendorLinks = require('../services/vendorLinks');
    vendorLinks.add(Number(req.params.id), req.body.label, req.body.url, who(req));
    res.redirect(`/items/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/vendor-links/:id/delete', (req, res, next) => {
  try {
    const vendorLinks = require('../services/vendorLinks');
    const itemId = vendorLinks.remove(Number(req.params.id), who(req));
    res.redirect(`/items/${itemId}`);
  } catch (err) { next(err); }
});

router.post('/items/:id/photos', upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) throw new Error('No photo selected');
    await photos.add(Number(req.params.id), req.file.buffer, who(req));
    res.redirect(`/items/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/photos/:id/primary', (req, res, next) => {
  try {
    const itemId = photos.setPrimary(req.params.id);
    res.redirect(`/items/${itemId}`);
  } catch (err) { next(err); }
});

router.post('/photos/:id/delete', (req, res, next) => {
  try {
    const itemId = photos.remove(req.params.id, who(req));
    res.redirect(`/items/${itemId}`);
  } catch (err) { next(err); }
});

router.post('/locations', (req, res, next) => {
  try {
    const id = locations.create(req.body);
    res.redirect(`/locations/${id}`);
  } catch (err) { next(err); }
});

router.post('/locations/:id', (req, res, next) => {
  try {
    locations.update(req.params.id, req.body);
    res.redirect(`/locations/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/locations/:id/move', (req, res, next) => {
  try {
    locations.move(Number(req.params.id), req.body.parent_id ? Number(req.body.parent_id) : null);
    res.redirect(`/locations/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/locations/:id/delete', (req, res, next) => {
  try {
    const parent = locations.byId(req.params.id)?.parent_id;
    locations.remove(req.params.id);
    res.redirect(parent ? `/locations/${parent}` : '/locations');
  } catch (err) { next(err); }
});

router.post('/admin/config', (req, res, next) => {
  try {
    config.save({
      baseUrl: (req.body.baseUrl || '').trim().replace(/\/+$/, ''),
      siteName: (req.body.siteName || 'ShopStock').trim()
    });
    res.redirect('/admin?saved=1');
  } catch (err) { next(err); }
});

router.post('/admin/categories', (req, res, next) => {
  try {
    const db = require('../db').get();
    const name = (req.body.name || '').trim();
    if (name) {
      db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, 99)').run(name);
    }
    res.redirect('/admin');
  } catch (err) { next(err); }
});

router.post('/admin/backup-config', async (req, res, next) => {
  try {
    // IT-pasted paths often arrive wrapped in quotes — strip them
    const dest = (req.body.backupDest || '').trim().replace(/^"(.*)"$/, '$1').trim();
    const num = (v, dflt) => {
      const n = Number(v);
      return v === '' || v === undefined || !Number.isFinite(n) || n < 0 ? dflt : n;
    };
    config.save({
      backupDest: dest,
      backupIntervalHours: num(req.body.backupIntervalHours, 24),
      backupKeepDays: num(req.body.backupKeepDays, 30)
    });
    // Immediate reachability feedback (catches typo'd UNC paths). A failed
    // probe still saves — the share may simply be offline right now. Async fs
    // throughout: sync calls on a dead UNC block the event loop for the whole
    // SMB timeout.
    let probe = '';
    if (dest) {
      try {
        const fsp = require('fs/promises');
        const path = require('path');
        await fsp.mkdir(dest, { recursive: true });
        const p = path.join(dest, '.shopstock-write-test');
        await fsp.writeFile(p, 'ok');
        await fsp.rm(p, { force: true });
        probe = '&dest=ok';
      } catch (err) {
        probe = '&dest=err&destmsg=' + encodeURIComponent(String(err.message || err).slice(0, 200));
      }
    }
    res.redirect('/admin?saved=1' + probe);
  } catch (err) { next(err); }
});

router.post('/admin/backup', async (req, res, next) => {
  try {
    const backup = require('../services/backup');
    const result = await backup.run('manual');
    res.redirect(result.busy ? '/admin?backup=busy' : '/admin?backup=done');
  } catch (err) { next(err); }
});

module.exports = router;
