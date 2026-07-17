const { customAlphabet } = require('nanoid/non-secure');
const { get } = require('../db');

// No 0/O/1/I/L — every code is unambiguous when printed small
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const generate = customAlphabet(ALPHABET, 5);

// Generate a shortcode unique across BOTH items and locations so /i/ and /l/
// mistakes can be cross-redirected.
function newShortcode() {
  const db = get();
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generate();
    const hit = db.prepare(
      `SELECT 1 FROM items WHERE shortcode = ?
       UNION SELECT 1 FROM locations WHERE shortcode = ?`
    ).get(code, code);
    if (!hit) return code;
  }
  throw new Error('Could not generate a unique shortcode');
}

module.exports = { newShortcode, ALPHABET };
