const express = require('express');
const path = require('path');
const items = require('../services/items');
const locations = require('../services/locations');
const qr = require('../services/qr');
const barcode = require('../services/barcode');
const config = require('../config');

const router = express.Router();

const TEMPLATES = {
  avery5160: { name: 'Avery 5160 sheet (30-up, 2.625" × 1")', perPage: 30 },
  dymo30252: { name: 'Dymo 30252 address (3.5" × 1.125")', perPage: 1 },
  dymo30334: { name: 'Dymo 30334 (2.25" × 1.25")', perPage: 1 },
  zebra2x1:  { name: 'Zebra 2" × 1" thermal', perPage: 1 }
};

router.get('/labels', (req, res) => {
  res.render('labels', {
    title: 'Print labels',
    templates: TEMPLATES,
    locationOptions: locations.allWithPath()
  });
});

// ids param: comma-separated with i/l prefixes, e.g. "i3,i7,l2"
// or location_id + include to label everything in a location
router.get('/labels/print', async (req, res, next) => {
  try {
    const cfg = config.load();
    const template = TEMPLATES[req.query.template] ? req.query.template : 'avery5160';
    const start = Math.max(0, parseInt(req.query.start, 10) || 0);
    // 'c128' = Code 128 barcode for USB scanners (single-station mode),
    // 'qr' = QR code URL for phone cameras (LAN mode)
    const sym = req.query.sym === 'qr' ? 'qr' : 'c128';

    const targets = [];
    if (req.query.ids) {
      for (const token of String(req.query.ids).split(',')) {
        const kind = token[0];
        const id = Number(token.slice(1));
        if (!id) continue;
        if (kind === 'i') {
          const it = items.byId(id);
          if (it) targets.push({ kind: 'item', row: it });
        } else if (kind === 'l') {
          const loc = locations.byId(id);
          if (loc) targets.push({ kind: 'location', row: loc });
        }
      }
    }
    if (req.query.location_id) {
      const locId = Number(req.query.location_id);
      const include = String(req.query.include || 'items');
      if (include === 'items' || include === 'both') {
        for (const it of locations.itemsAt(locId)) targets.push({ kind: 'item', row: items.byId(it.id) });
      }
      if (include === 'locations' || include === 'both') {
        const self = locations.byId(locId);
        if (self) targets.push({ kind: 'location', row: self });
        for (const id of locations.subtreeIds(locId)) {
          if (id === locId) continue;
          targets.push({ kind: 'location', row: locations.byId(id) });
        }
      }
    }

    if (!targets.length) return res.redirect('/labels');

    const base = cfg.baseUrl || `http://localhost:${cfg.port}`;
    const labels = [];
    for (const t of targets) {
      const codeSvg = sym === 'qr'
        ? await qr.svgForUrl(qr.urlFor(base, t.kind, t.row.shortcode))
        : barcode.svgForCode(t.row.shortcode);
      labels.push({
        codeSvg,
        name: t.row.name,
        code: t.row.shortcode,
        sub: t.kind === 'item'
          ? [t.row.part_number, t.row.location_path].filter(Boolean).join(' · ')
          : (t.row.path_cache || 'Location')
      });
    }

    res.render(path.join('..', 'labels', 'templates', template), {
      labels, start, sym, baseUrlSet: !!cfg.baseUrl
    });
  } catch (err) { next(err); }
});

router.get('/labels/print-ruler', (req, res) => {
  res.render(path.join('..', 'labels', 'templates', 'ruler'), {});
});

module.exports = router;
