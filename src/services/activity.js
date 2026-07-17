const { get } = require('../db');

function log(entityType, entityId, action, detail = {}, personName = null) {
  get().prepare(
    `INSERT INTO activity_log (entity_type, entity_id, action, person_name, detail_json)
     VALUES (?, ?, ?, ?, ?)`
  ).run(entityType, entityId, action, personName, JSON.stringify(detail));
}

function recent(limit = 50) {
  return get().prepare(
    `SELECT a.*,
            CASE a.entity_type
              WHEN 'item' THEN (SELECT name FROM items WHERE id = a.entity_id)
              WHEN 'location' THEN (SELECT name FROM locations WHERE id = a.entity_id)
            END AS entity_name
     FROM activity_log a
     ORDER BY a.id DESC
     LIMIT ?`
  ).all(limit).map(parseRow);
}

function forItem(itemId, limit = 10) {
  return get().prepare(
    `SELECT * FROM activity_log
     WHERE (entity_type = 'item' AND entity_id = ?)
     ORDER BY id DESC LIMIT ?`
  ).all(itemId, limit).map(parseRow);
}

function parseRow(row) {
  return { ...row, detail: JSON.parse(row.detail_json || '{}') };
}

module.exports = { log, recent, forItem };
