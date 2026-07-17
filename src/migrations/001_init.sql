-- ShopStock initial schema

CREATE TABLE locations (
  id            INTEGER PRIMARY KEY,
  parent_id     INTEGER NULL REFERENCES locations(id) ON DELETE RESTRICT,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'other',
  shortcode     TEXT NOT NULL UNIQUE,
  path_cache    TEXT NOT NULL DEFAULT '',
  notes         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(parent_id, name)
);
CREATE INDEX idx_locations_parent ON locations(parent_id);

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO categories (name, sort_order) VALUES
  ('Exhaust', 1),
  ('Engine / Dyno', 2),
  ('Plumbing & Fittings', 3),
  ('Consumable Tools', 4),
  ('Test Equipment', 5),
  ('Wiring / Harness', 6),
  ('Fasteners', 7),
  ('Other', 8);

CREATE TABLE items (
  id                  INTEGER PRIMARY KEY,
  shortcode           TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  description         TEXT,
  category_id         INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  location_id         INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  item_type           TEXT NOT NULL DEFAULT 'stock' CHECK (item_type IN ('stock','asset')),
  quantity            REAL NOT NULL DEFAULT 0,
  unit                TEXT NOT NULL DEFAULT 'ea',
  low_stock_threshold REAL NULL,
  manufacturer        TEXT,
  part_number         TEXT,
  supplier            TEXT,
  supplier_url        TEXT,
  attrs_json          TEXT NOT NULL DEFAULT '{}',
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_items_location ON items(location_id);
CREATE INDEX idx_items_category ON items(category_id);
CREATE INDEX idx_items_part_number ON items(part_number);
CREATE INDEX idx_items_type ON items(item_type);

CREATE TABLE people (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  last_used_at TEXT
);

CREATE TABLE checkouts (
  id             INTEGER PRIMARY KEY,
  item_id        INTEGER NOT NULL REFERENCES items(id),
  person_id      INTEGER NOT NULL REFERENCES people(id),
  quantity       REAL NOT NULL DEFAULT 1,
  note           TEXT,
  checked_out_at TEXT NOT NULL DEFAULT (datetime('now')),
  checked_in_at  TEXT NULL
);
CREATE INDEX idx_checkouts_item ON checkouts(item_id, checked_in_at);
CREATE INDEX idx_checkouts_person ON checkouts(person_id);
CREATE UNIQUE INDEX one_open_checkout ON checkouts(item_id) WHERE checked_in_at IS NULL;

CREATE TABLE photos (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_photos_item ON photos(item_id);

CREATE TABLE activity_log (
  id          INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,
  action      TEXT NOT NULL,
  person_name TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_created ON activity_log(created_at);

-- Full-text search over items, kept in sync with triggers
CREATE VIRTUAL TABLE items_fts USING fts5(
  name, description, part_number, manufacturer, attrs,
  content='',
  tokenize='unicode61'
);

CREATE TRIGGER items_fts_insert AFTER INSERT ON items BEGIN
  INSERT INTO items_fts (rowid, name, description, part_number, manufacturer, attrs)
  VALUES (new.id, new.name, coalesce(new.description,''), coalesce(new.part_number,''),
          coalesce(new.manufacturer,''), new.attrs_json);
END;

CREATE TRIGGER items_fts_update AFTER UPDATE ON items BEGIN
  INSERT INTO items_fts (items_fts, rowid) VALUES ('delete', old.id);
  INSERT INTO items_fts (rowid, name, description, part_number, manufacturer, attrs)
  VALUES (new.id, new.name, coalesce(new.description,''), coalesce(new.part_number,''),
          coalesce(new.manufacturer,''), new.attrs_json);
END;

CREATE TRIGGER items_fts_delete AFTER DELETE ON items BEGIN
  INSERT INTO items_fts (items_fts, rowid) VALUES ('delete', old.id);
END;
