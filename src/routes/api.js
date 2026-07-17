const express = require('express');
const search = require('../services/search');
const checkouts = require('../services/checkouts');
const locations = require('../services/locations');

const router = express.Router();

router.get('/locations', (req, res) => {
  res.json(locations.allWithPath().map(l => ({ id: l.id, full_path: l.full_path })));
});

router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ items: [], locations: [] });
  res.json({
    items: search.items(q, 10).map(i => ({
      id: i.id, name: i.name, part_number: i.part_number,
      location_path: i.location_path, shortcode: i.shortcode
    })),
    locations: search.locations(q, 5).map(l => ({
      id: l.id, name: l.name, full_path: l.full_path, shortcode: l.shortcode
    }))
  });
});

router.get('/people/suggest', (req, res) => {
  res.json(checkouts.suggestPeople((req.query.q || '').trim()));
});

module.exports = router;
