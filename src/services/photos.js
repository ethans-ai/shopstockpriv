const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { nanoid } = require('nanoid/non-secure');
const { get } = require('../db');
const activity = require('./activity');

let photosDir;

function init(dataDir) {
  photosDir = path.join(dataDir, 'photos');
}

function forItem(itemId) {
  return get().prepare(
    'SELECT * FROM photos WHERE item_id = ? ORDER BY is_primary DESC, id'
  ).all(itemId);
}

async function add(itemId, buffer, personName) {
  const db = get();
  const filename = `${itemId}-${nanoid(8)}.jpg`;

  // .rotate() applies EXIF orientation, then EXIF is stripped by re-encoding
  const image = sharp(buffer).rotate();
  await image
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toFile(path.join(photosDir, filename));
  await sharp(buffer).rotate()
    .resize({ width: 300, height: 300, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toFile(path.join(photosDir, 'thumbs', filename));

  const hasPrimary = db.prepare(
    'SELECT 1 FROM photos WHERE item_id = ? AND is_primary = 1'
  ).get(itemId);
  db.prepare(
    'INSERT INTO photos (item_id, filename, is_primary) VALUES (?, ?, ?)'
  ).run(itemId, filename, hasPrimary ? 0 : 1);
  activity.log('item', itemId, 'photo_add', { filename }, personName);
  return filename;
}

function setPrimary(photoId) {
  const db = get();
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId);
  if (!photo) throw new Error('Photo not found');
  const tx = db.transaction(() => {
    db.prepare('UPDATE photos SET is_primary = 0 WHERE item_id = ?').run(photo.item_id);
    db.prepare('UPDATE photos SET is_primary = 1 WHERE id = ?').run(photoId);
  });
  tx();
  return photo.item_id;
}

function remove(photoId, personName) {
  const db = get();
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId);
  if (!photo) throw new Error('Photo not found');
  db.prepare('DELETE FROM photos WHERE id = ?').run(photoId);
  for (const p of [path.join(photosDir, photo.filename),
                   path.join(photosDir, 'thumbs', photo.filename)]) {
    try { fs.unlinkSync(p); } catch {}
  }
  // Promote another photo to primary if we deleted the primary one
  if (photo.is_primary) {
    const next = db.prepare(
      'SELECT id FROM photos WHERE item_id = ? ORDER BY id LIMIT 1'
    ).get(photo.item_id);
    if (next) db.prepare('UPDATE photos SET is_primary = 1 WHERE id = ?').run(next.id);
  }
  activity.log('item', photo.item_id, 'photo_delete', { filename: photo.filename }, personName);
  return photo.item_id;
}

function diskUsage() {
  let bytes = 0, count = 0;
  try {
    for (const f of fs.readdirSync(photosDir)) {
      const full = path.join(photosDir, f);
      const stat = fs.statSync(full);
      if (stat.isFile()) { bytes += stat.size; count++; }
    }
  } catch {}
  return { bytes, count };
}

module.exports = { init, forItem, add, setPrimary, remove, diskUsage };
