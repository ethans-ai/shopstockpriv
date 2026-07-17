-- Multiple vendor/purchase links per item, replacing the single
-- supplier/supplier_url pair (columns stay for backward compat but the UI
-- now reads/writes vendor_links only).

-- AUTOINCREMENT matters here: link rows are deleted/recreated by the edit
-- form's wholesale replace, and without it SQLite reuses freed ids — letting
-- a stale delete form in an old browser tab remove some other link.
CREATE TABLE vendor_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  url        TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_vendor_links_item ON vendor_links(item_id);

-- Backfill from the legacy per-item supplier fields (scheme-less URLs too)
INSERT INTO vendor_links (item_id, label, url)
SELECT id,
       COALESCE(NULLIF(TRIM(supplier), ''), 'Vendor'),
       CASE WHEN TRIM(supplier_url) LIKE 'http%' THEN TRIM(supplier_url)
            ELSE 'https://' || TRIM(supplier_url) END
FROM items
WHERE supplier_url IS NOT NULL AND TRIM(supplier_url) <> '';

-- Items that had a supplier NAME but no URL can't become links — preserve the
-- name as a visible attribute so no reorder info is silently lost.
UPDATE items
SET attrs_json = json_set(COALESCE(attrs_json, '{}'), '$.Supplier', TRIM(supplier))
WHERE TRIM(COALESCE(supplier, '')) <> ''
  AND (supplier_url IS NULL OR TRIM(supplier_url) = '');
