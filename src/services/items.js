const { get } = require('../db');
const { newShortcode } = require('./shortcodes');
const activity = require('./activity');
const vendorLinks = require('./vendorLinks');

const UNITS = ['ea', 'ft', 'm', 'in', 'box', 'roll', 'pk', 'set', 'pr', 'L', 'gal'];

const BASE_SELECT = `
  SELECT i.*,
         c.name AS category_name,
         l.name AS location_name,
         CASE WHEN l.path_cache = '' OR l.path_cache IS NULL THEN l.name
              ELSE l.path_cache || ' > ' || l.name END AS location_path,
         (SELECT filename FROM photos WHERE item_id = i.id AND is_primary = 1) AS primary_photo,
         (SELECT COUNT(*) FROM checkouts co WHERE co.item_id = i.id AND co.checked_in_at IS NULL) AS is_checked_out,
         (SELECT label FROM vendor_links v WHERE v.item_id = i.id ORDER BY v.sort_order, v.id LIMIT 1) AS first_vendor_label,
         (SELECT url FROM vendor_links v WHERE v.item_id = i.id ORDER BY v.sort_order, v.id LIMIT 1) AS first_vendor_url
  FROM items i
  LEFT JOIN categories c ON c.id = i.category_id
  LEFT JOIN locations l ON l.id = i.location_id`;

function byId(id) {
  return get().prepare(`${BASE_SELECT} WHERE i.id = ?`).get(id);
}

function byShortcode(code) {
  return get().prepare(`${BASE_SELECT} WHERE i.shortcode = ?`).get(code);
}

function list({ categoryId, limit = 200 } = {}) {
  const db = get();
  if (categoryId) {
    return db.prepare(`${BASE_SELECT} WHERE i.is_active = 1 AND i.category_id = ? ORDER BY i.name LIMIT ?`)
      .all(categoryId, limit);
  }
  return db.prepare(`${BASE_SELECT} WHERE i.is_active = 1 ORDER BY i.name LIMIT ?`).all(limit);
}

function parseAttrs(text) {
  // Accept "key: value" lines from the edit form; store as JSON object
  const attrs = {};
  for (const line of (text || '').split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key && val) attrs[key] = val;
    }
  }
  return attrs;
}

function fieldsFromForm(body) {
  return {
    name: (body.name || '').trim(),
    description: (body.description || '').trim() || null,
    category_id: body.category_id ? Number(body.category_id) : null,
    location_id: body.location_id ? Number(body.location_id) : null,
    item_type: body.item_type === 'asset' ? 'asset' : 'stock',
    quantity: body.quantity !== undefined && body.quantity !== '' ? Number(body.quantity) : 0,
    unit: (body.unit || 'ea').trim(),
    low_stock_threshold: body.low_stock_threshold !== undefined && body.low_stock_threshold !== ''
      ? Number(body.low_stock_threshold) : null,
    manufacturer: (body.manufacturer || '').trim() || null,
    part_number: (body.part_number || '').trim() || null,
    attrs_json: JSON.stringify(parseAttrs(body.attrs_text))
  };
}

function create(body, personName) {
  const db = get();
  const f = fieldsFromForm(body);
  if (!f.name) throw new Error('Name is required');
  const tx = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO items (shortcode, name, description, category_id, location_id, item_type,
                          quantity, unit, low_stock_threshold, manufacturer, part_number,
                          attrs_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(newShortcode(), f.name, f.description, f.category_id, f.location_id, f.item_type,
          f.quantity, f.unit, f.low_stock_threshold, f.manufacturer, f.part_number,
          f.attrs_json);
    const id = info.lastInsertRowid;
    if (body.vendor_links_text !== undefined) {
      vendorLinks.replaceAll(id, body.vendor_links_text, personName);
    }
    activity.log('item', id, 'create', { name: f.name }, personName);
    return id;
  });
  return tx();
}

function update(id, body, personName) {
  const db = get();
  const f = fieldsFromForm(body);
  if (!f.name) throw new Error('Name is required');
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE items SET name = ?, description = ?, category_id = ?, location_id = ?,
                        item_type = ?, quantity = ?, unit = ?, low_stock_threshold = ?,
                        manufacturer = ?, part_number = ?,
                        attrs_json = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(f.name, f.description, f.category_id, f.location_id, f.item_type, f.quantity,
          f.unit, f.low_stock_threshold, f.manufacturer, f.part_number,
          f.attrs_json, id);
    if (body.vendor_links_text !== undefined) {
      vendorLinks.replaceAll(id, body.vendor_links_text, personName);
    }
    activity.log('item', id, 'update', { name: f.name }, personName);
  });
  tx();
}

// Atomic relative quantity change — never read-modify-write
function changeQuantity(id, delta, personName) {
  const db = get();
  const tx = db.transaction(() => {
    const before = db.prepare('SELECT quantity FROM items WHERE id = ?').get(id);
    if (!before) throw new Error('Item not found');
    db.prepare(
      `UPDATE items SET quantity = MAX(0, quantity + ?), updated_at = datetime('now') WHERE id = ?`
    ).run(delta, id);
    const after = db.prepare('SELECT quantity FROM items WHERE id = ?').get(id);
    activity.log('item', id, 'qty_change',
      { delta, qty_from: before.quantity, qty_to: after.quantity }, personName);
    return after.quantity;
  });
  return tx();
}

function setQuantity(id, value, personName) {
  const db = get();
  const qty = Math.max(0, Number(value) || 0);
  const tx = db.transaction(() => {
    const before = db.prepare('SELECT quantity FROM items WHERE id = ?').get(id);
    if (!before) throw new Error('Item not found');
    db.prepare(`UPDATE items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(qty, id);
    activity.log('item', id, 'qty_change',
      { set: qty, qty_from: before.quantity, qty_to: qty }, personName);
    return qty;
  });
  return tx();
}

function moveToLocation(id, locationId, personName) {
  const db = get();
  db.prepare(`UPDATE items SET location_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(locationId || null, id);
  activity.log('item', id, 'move', { to: locationId || null }, personName);
}

function softDelete(id, personName) {
  const db = get();
  db.prepare(`UPDATE items SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
  activity.log('item', id, 'delete', {}, personName);
}

function lowStock() {
  return get().prepare(
    `${BASE_SELECT}
     WHERE i.is_active = 1 AND i.item_type = 'stock'
       AND i.low_stock_threshold IS NOT NULL AND i.quantity <= i.low_stock_threshold
     ORDER BY (CASE WHEN i.low_stock_threshold > 0 THEN i.quantity / i.low_stock_threshold ELSE 0 END)`
  ).all();
}

function lowStockCount() {
  return get().prepare(
    `SELECT COUNT(*) AS n FROM items
     WHERE is_active = 1 AND item_type = 'stock'
       AND low_stock_threshold IS NOT NULL AND quantity <= low_stock_threshold`
  ).get().n;
}

function categories() {
  return get().prepare('SELECT * FROM categories ORDER BY sort_order, name').all();
}

function categoryCounts() {
  return get().prepare(
    `SELECT c.id, c.name, COUNT(i.id) AS item_count
     FROM categories c
     LEFT JOIN items i ON i.category_id = c.id AND i.is_active = 1
     GROUP BY c.id ORDER BY c.sort_order, c.name`
  ).all();
}

module.exports = {
  UNITS, byId, byShortcode, list, create, update, changeQuantity, setQuantity,
  moveToLocation, softDelete, lowStock, lowStockCount, categories, categoryCounts,
  parseAttrs
};
