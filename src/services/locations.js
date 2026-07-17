const { get } = require('../db');
const { newShortcode } = require('./shortcodes');
const activity = require('./activity');

const KINDS = ['room', 'cabinet', 'shelf', 'bin', 'drawer', 'other'];

function byId(id) {
  return get().prepare('SELECT * FROM locations WHERE id = ?').get(id);
}

function byShortcode(code) {
  return get().prepare('SELECT * FROM locations WHERE shortcode = ?').get(code);
}

function roots() {
  return get().prepare(
    'SELECT * FROM locations WHERE parent_id IS NULL ORDER BY sort_order, name'
  ).all();
}

function children(parentId) {
  return get().prepare(
    'SELECT * FROM locations WHERE parent_id = ? ORDER BY sort_order, name'
  ).all(parentId);
}

// Full breadcrumb chain for a location: [root, ..., self]
function breadcrumb(id) {
  return get().prepare(
    `WITH RECURSIVE chain(id, parent_id, name, depth) AS (
       SELECT id, parent_id, name, 0 FROM locations WHERE id = ?
       UNION ALL
       SELECT l.id, l.parent_id, l.name, chain.depth + 1
       FROM locations l JOIN chain ON l.id = chain.parent_id
     )
     SELECT id, name FROM chain ORDER BY depth DESC`
  ).all(id);
}

// All descendant ids including self
function subtreeIds(id) {
  return get().prepare(
    `WITH RECURSIVE sub(id) AS (
       SELECT id FROM locations WHERE id = ?
       UNION ALL
       SELECT l.id FROM locations l JOIN sub ON l.parent_id = sub.id
     )
     SELECT id FROM sub`
  ).all(id).map(r => r.id);
}

function itemCountInSubtree(id) {
  const ids = subtreeIds(id);
  const placeholders = ids.map(() => '?').join(',');
  return get().prepare(
    `SELECT COUNT(*) AS n FROM items WHERE is_active = 1 AND location_id IN (${placeholders})`
  ).get(...ids).n;
}

function itemsAt(locationId) {
  return get().prepare(
    `SELECT i.*, (SELECT filename FROM photos WHERE item_id = i.id AND is_primary = 1) AS primary_photo
     FROM items i WHERE i.location_id = ? AND i.is_active = 1 ORDER BY i.name`
  ).all(locationId);
}

function computePathCache(id) {
  const chain = breadcrumb(id);
  chain.pop(); // exclude self
  return chain.map(l => l.name).join(' > ');
}

function refreshPathCacheSubtree(rootId) {
  const db = get();
  for (const id of subtreeIds(rootId)) {
    db.prepare('UPDATE locations SET path_cache = ? WHERE id = ?')
      .run(computePathCache(id), id);
  }
}

function create({ name, parent_id, kind, notes }) {
  const db = get();
  const tx = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO locations (parent_id, name, kind, shortcode, notes)
       VALUES (?, ?, ?, ?, ?)`
    ).run(parent_id || null, name.trim(), KINDS.includes(kind) ? kind : 'other',
          newShortcode(), notes || null);
    const id = info.lastInsertRowid;
    db.prepare('UPDATE locations SET path_cache = ? WHERE id = ?')
      .run(computePathCache(id), id);
    activity.log('location', id, 'create', { name });
    return id;
  });
  return tx();
}

function update(id, { name, kind, notes }) {
  const db = get();
  const tx = db.transaction(() => {
    db.prepare('UPDATE locations SET name = ?, kind = ?, notes = ? WHERE id = ?')
      .run(name.trim(), KINDS.includes(kind) ? kind : 'other', notes || null, id);
    refreshPathCacheSubtree(id);
    activity.log('location', id, 'update', { name });
  });
  tx();
}

function move(id, newParentId) {
  const db = get();
  if (newParentId) {
    if (Number(newParentId) === Number(id)) throw new Error('Cannot move a location into itself');
    const descendants = subtreeIds(id);
    if (descendants.includes(Number(newParentId))) {
      throw new Error('Cannot move a location into its own subtree');
    }
  }
  const tx = db.transaction(() => {
    db.prepare('UPDATE locations SET parent_id = ? WHERE id = ?').run(newParentId || null, id);
    refreshPathCacheSubtree(id);
    activity.log('location', id, 'move', { to: newParentId || null });
  });
  tx();
}

function remove(id) {
  const db = get();
  const kids = children(id);
  if (kids.length) throw new Error('Location has sub-locations — move or delete them first');
  const items = itemsAt(id);
  if (items.length) throw new Error('Location still has items — move them first');
  db.prepare('DELETE FROM locations WHERE id = ?').run(id);
  activity.log('location', id, 'delete', {});
}

// Flat list of all locations with full path, for pickers
function allWithPath() {
  return get().prepare(
    `SELECT id, name, kind, path_cache,
            CASE WHEN path_cache = '' THEN name ELSE path_cache || ' > ' || name END AS full_path
     FROM locations ORDER BY full_path`
  ).all();
}

module.exports = {
  KINDS, byId, byShortcode, roots, children, breadcrumb, subtreeIds,
  itemCountInSubtree, itemsAt, create, update, move, remove, allWithPath,
  refreshPathCacheSubtree
};
