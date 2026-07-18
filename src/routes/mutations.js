const express = require('express');
const multer = require('multer');
const items = require('../services/items');
const locations = require('../services/locations');
const checkouts = require('../services/checkouts');
const photos = require('../services/photos');
const config = require('../config');
const auth = require('../services/auth');

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

router.post('/admin/config', auth.requireAdmin, (req, res, next) => {
  try {
    config.save({
      baseUrl: (req.body.baseUrl || '').trim().replace(/\/+$/, ''),
      siteName: (req.body.siteName || 'ShopStock').trim()
    });
    res.redirect('/admin?saved=1');
  } catch (err) { next(err); }
});

router.post('/admin/unlock', (req, res, next) => {
  try {
    // Trim to match how the set/change forms store the PIN — a pasted
    // trailing space must not read as a wrong PIN (and eat the cooldown)
    const result = auth.unlock((req.body.pin || '').trim());
    if (result === 'blocked') return res.redirect('/admin?auth=blocked');
    if (!result) return res.redirect('/admin?auth=badpin');
    auth.setCookie(res, result);
    res.redirect('/admin?auth=unlocked');
  } catch (err) { next(err); }
});

router.post('/admin/lock', (req, res, next) => {
  try {
    auth.lock(req);
    auth.clearCookie(res);
    res.redirect('/admin?auth=lockednow');
  } catch (err) { next(err); }
});

// Set the first PIN (open while none exists — same trust as today's open
// station) or change it (always requires the current PIN, unlocked or not).
router.post('/admin/pin', (req, res, next) => {
  try {
    const cfg = config.load();
    const pin = (req.body.pin || '').trim();
    const confirm = (req.body.pin_confirm || '').trim();
    if (pin.length < 4) return res.redirect('/admin?auth=pinshort');
    if (pin !== confirm) return res.redirect('/admin?auth=pinmismatch');
    if (auth.pinSet(cfg)) {
      if (auth.attemptsBlocked()) return res.redirect('/admin?auth=blocked');
      const current = (req.body.pin_current || '').trim();
      // Route the check through unlock() so wrong "current PIN" guesses count
      // toward the same attempt cooldown as the unlock form
      const ok = auth.unlock(current);
      if (ok === 'blocked') return res.redirect('/admin?auth=blocked');
      if (!ok) return res.redirect('/admin?auth=badpin');
      // Rotating the PIN revokes every existing unlock — a session opened
      // under the old (possibly compromised) PIN must not survive it
      auth.revokeAll();
    }
    config.save({ adminPinHash: auth.hashPin(pin) });
    // Whoever just proved (or first set) the PIN is unlocked — don't greet
    // them with a locked page for the settings they came to change
    auth.setCookie(res, auth.issueSession());
    res.redirect('/admin?auth=pinset');
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

router.post('/admin/backup-config', auth.requireAdmin, async (req, res, next) => {
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
