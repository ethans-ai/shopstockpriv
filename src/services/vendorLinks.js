const { get } = require('../db');
const activity = require('./activity');

// Normalize user input into a safe http(s) URL, or throw.
function cleanUrl(raw) {
  let s = (raw || '').trim();
  if (!s) throw new Error('Vendor link URL is required');
  const hadScheme = /^https?:\/\//i.test(s);
  if (!hadScheme) s = 'https://' + s;
  let parsed;
  try { parsed = new URL(s); } catch { throw new Error(`Not a valid URL: "${raw}"`); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Only http/https links are allowed: "${raw}"`);
  }
  // A pasted part number ("91290A115") would otherwise "parse" as a hostname
  // and quietly become a dead link — require a real domain when we guessed
  // the scheme ourselves.
  if (!hadScheme && !parsed.hostname.includes('.')) {
    throw new Error(`"${raw}" doesn't look like a web address`);
  }
  return parsed.href;
}

function labelFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Vendor'; }
}

// Parse the edit-form textarea: one link per line, "Vendor name: https://..."
// A bare URL is fine too — the label falls back to the site's hostname.
function parseLines(text) {
  const links = [];
  for (const rawLine of (text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const httpIdx = line.search(/https?:\/\//i);
    let label, url;
    if (httpIdx >= 0) {
      label = line.slice(0, httpIdx).replace(/[:\s\-–]+$/, '').trim();
      url = cleanUrl(line.slice(httpIdx));
    } else {
      const colon = line.indexOf(':');
      if (colon > 0) {
        label = line.slice(0, colon).trim();
        url = cleanUrl(line.slice(colon + 1));
      } else {
        label = '';
        url = cleanUrl(line);
      }
    }
    links.push({ label: label || labelFromUrl(url), url });
  }
  return links;
}

function forItem(itemId) {
  return get().prepare(
    'SELECT * FROM vendor_links WHERE item_id = ? ORDER BY sort_order, id'
  ).all(itemId);
}

function add(itemId, label, url, personName) {
  const db = get();
  const clean = cleanUrl(url);
  const name = (label || '').trim() || labelFromUrl(clean);
  // Labels can't contain URLs — they wouldn't survive the "Label: URL"
  // line format the edit-form textarea round-trips through.
  if (/https?:\/\//i.test(name)) {
    throw new Error('Put the URL in the URL field — the vendor name can\'t contain a link');
  }
  db.prepare(
    `INSERT INTO vendor_links (item_id, label, url, sort_order)
     VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM vendor_links WHERE item_id = ?))`
  ).run(itemId, name, clean, itemId);
  activity.log('item', itemId, 'vendor_link_add', { label: name }, personName);
}

function remove(linkId, personName) {
  const db = get();
  const link = db.prepare('SELECT * FROM vendor_links WHERE id = ?').get(linkId);
  if (!link) throw new Error('Vendor link not found');
  db.prepare('DELETE FROM vendor_links WHERE id = ?').run(linkId);
  activity.log('item', link.item_id, 'vendor_link_delete', { label: link.label }, personName);
  return link.item_id;
}

// Wholesale replace from the edit-form textarea (called inside the item
// create/update transaction). Only logs when something actually changed.
function replaceAll(itemId, text, personName) {
  const db = get();
  const next = parseLines(text);
  const current = forItem(itemId).map(l => ({ label: l.label, url: l.url }));
  if (JSON.stringify(current) === JSON.stringify(next)) return;
  db.prepare('DELETE FROM vendor_links WHERE item_id = ?').run(itemId);
  const insert = db.prepare(
    'INSERT INTO vendor_links (item_id, label, url, sort_order) VALUES (?, ?, ?, ?)'
  );
  next.forEach((l, i) => insert.run(itemId, l.label, l.url, i));
  activity.log('item', itemId, 'vendor_links_update', { count: next.length }, personName);
}

// For prefilling the edit-form textarea
function toText(itemId) {
  return forItem(itemId).map(l => `${l.label}: ${l.url}`).join('\n');
}

module.exports = { parseLines, cleanUrl, forItem, add, remove, replaceAll, toText };
