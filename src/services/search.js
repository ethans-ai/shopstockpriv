const { get } = require('../db');

// Build an FTS5 prefix query from user input: each word becomes word*
// Quotes strip FTS operators so raw user input can't break the query.
function ftsQuery(q) {
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return null;
  return words.map(w => `"${w.replace(/"/g, '')}"*`).join(' ');
}

function items(q, limit = 50) {
  const fq = ftsQuery(q);
  if (!fq) return [];
  try {
    return get().prepare(
      `SELECT i.*, c.name AS category_name,
              CASE WHEN l.path_cache = '' OR l.path_cache IS NULL THEN l.name
                   ELSE l.path_cache || ' > ' || l.name END AS location_path,
              (SELECT filename FROM photos WHERE item_id = i.id AND is_primary = 1) AS primary_photo,
              (SELECT COUNT(*) FROM checkouts co WHERE co.item_id = i.id AND co.checked_in_at IS NULL) AS is_checked_out
       FROM items_fts f
       JOIN items i ON i.id = f.rowid
       LEFT JOIN categories c ON c.id = i.category_id
       LEFT JOIN locations l ON l.id = i.location_id
       WHERE items_fts MATCH ? AND i.is_active = 1
       ORDER BY rank
       LIMIT ?`
    ).all(fq, limit);
  } catch {
    return [];
  }
}

function locations(q, limit = 20) {
  const like = `%${q.trim()}%`;
  return get().prepare(
    `SELECT *, CASE WHEN path_cache = '' THEN name ELSE path_cache || ' > ' || name END AS full_path
     FROM locations WHERE name LIKE ? ORDER BY full_path LIMIT ?`
  ).all(like, limit);
}

// Exact shortcode match (typed-in codes) checked first by the search page
function byShortcode(q) {
  const code = q.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) return null;
  const db = get();
  const item = db.prepare('SELECT id FROM items WHERE shortcode = ?').get(code);
  if (item) return { type: 'item', id: item.id };
  const loc = db.prepare('SELECT id FROM locations WHERE shortcode = ?').get(code);
  if (loc) return { type: 'location', id: loc.id };
  return null;
}

module.exports = { items, locations, byShortcode };
