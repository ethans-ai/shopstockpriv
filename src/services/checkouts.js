const { get } = require('../db');
const activity = require('./activity');

function upsertPerson(name) {
  const db = get();
  const clean = name.trim();
  if (!clean) throw new Error('Name is required');
  db.prepare(
    `INSERT INTO people (name, last_used_at) VALUES (?, datetime('now'))
     ON CONFLICT(name) DO UPDATE SET last_used_at = datetime('now')`
  ).run(clean);
  return db.prepare('SELECT * FROM people WHERE name = ?').get(clean);
}

function openCheckoutForItem(itemId) {
  return get().prepare(
    `SELECT co.*, p.name AS person_name
     FROM checkouts co JOIN people p ON p.id = co.person_id
     WHERE co.item_id = ? AND co.checked_in_at IS NULL`
  ).get(itemId);
}

function checkout(itemId, personName, note, quantity = 1) {
  const db = get();
  const tx = db.transaction(() => {
    const existing = openCheckoutForItem(itemId);
    if (existing) {
      const err = new Error(`Already checked out to ${existing.person_name}`);
      err.code = 'ALREADY_OUT';
      err.existing = existing;
      throw err;
    }
    const person = upsertPerson(personName);
    db.prepare(
      `INSERT INTO checkouts (item_id, person_id, quantity, note) VALUES (?, ?, ?, ?)`
    ).run(itemId, person.id, quantity, note || null);
    activity.log('item', itemId, 'checkout', { note: note || undefined }, person.name);
  });
  tx();
}

function checkin(itemId, personName) {
  const db = get();
  const tx = db.transaction(() => {
    const open = openCheckoutForItem(itemId);
    if (!open) throw new Error('Item is not checked out');
    db.prepare(`UPDATE checkouts SET checked_in_at = datetime('now') WHERE id = ?`).run(open.id);
    activity.log('item', itemId, 'checkin',
      { was_out_to: open.person_name }, personName || open.person_name);
  });
  tx();
}

// Check in whatever is out, then check out to the new person, atomically
function takeOver(itemId, personName, note) {
  const db = get();
  const tx = db.transaction(() => {
    const open = openCheckoutForItem(itemId);
    if (open) {
      db.prepare(`UPDATE checkouts SET checked_in_at = datetime('now') WHERE id = ?`).run(open.id);
      activity.log('item', itemId, 'checkin', { was_out_to: open.person_name, takeover: true }, personName);
    }
    const person = upsertPerson(personName);
    db.prepare(`INSERT INTO checkouts (item_id, person_id, quantity, note) VALUES (?, ?, 1, ?)`)
      .run(itemId, person.id, note || null);
    activity.log('item', itemId, 'checkout', { takeover: !!open }, person.name);
  });
  tx();
}

function allOpen() {
  return get().prepare(
    `SELECT co.*, p.name AS person_name, i.name AS item_name, i.shortcode, i.id AS item_id,
            (SELECT filename FROM photos WHERE item_id = i.id AND is_primary = 1) AS primary_photo
     FROM checkouts co
     JOIN people p ON p.id = co.person_id
     JOIN items i ON i.id = co.item_id
     WHERE co.checked_in_at IS NULL
     ORDER BY co.checked_out_at`
  ).all();
}

function openCount() {
  return get().prepare(
    'SELECT COUNT(*) AS n FROM checkouts WHERE checked_in_at IS NULL'
  ).get().n;
}

function forPerson(personId) {
  return get().prepare(
    `SELECT co.*, i.name AS item_name, i.id AS item_id, i.shortcode
     FROM checkouts co JOIN items i ON i.id = co.item_id
     WHERE co.person_id = ? AND co.checked_in_at IS NULL
     ORDER BY co.checked_out_at`
  ).all(personId);
}

function personById(id) {
  return get().prepare('SELECT * FROM people WHERE id = ?').get(id);
}

function suggestPeople(q) {
  const db = get();
  if (q) {
    return db.prepare(
      `SELECT name FROM people WHERE name LIKE ? ORDER BY last_used_at DESC LIMIT 8`
    ).all(q + '%').map(r => r.name);
  }
  return db.prepare(
    `SELECT name FROM people ORDER BY last_used_at DESC LIMIT 8`
  ).all().map(r => r.name);
}

function historyForItem(itemId, limit = 10) {
  return get().prepare(
    `SELECT co.*, p.name AS person_name
     FROM checkouts co JOIN people p ON p.id = co.person_id
     WHERE co.item_id = ?
     ORDER BY co.checked_out_at DESC LIMIT ?`
  ).all(itemId, limit);
}

module.exports = {
  upsertPerson, openCheckoutForItem, checkout, checkin, takeOver,
  allOpen, openCount, forPerson, personById, suggestPeople, historyForItem
};
