// Admin unlock for the shared station (user decisions, 2026-07-17):
// - Gates ONLY server config + backup settings ("config only") — everything
//   else stays walk-up zero-friction, including scans, qty, checkouts.
// - One shared admin PIN, scrypt-hashed into config.json (adminPinHash).
//   Until a PIN is set, nothing is gated (first-run setup stays frictionless);
//   /admin nudges to set one.
// - Unlock = HttpOnly SameSite=Strict cookie backed by an in-memory session
//   with a sliding ~10-minute idle expiry. Server restart relocks everything.
//   SameSite=Strict also means a hostile page in the lab PC's browser cannot
//   ride an existing unlock to repoint backups (the CSRF note from the v1.3
//   review).

const crypto = require('crypto');
const config = require('../config');

const COOKIE = 'shopstock_admin';
const IDLE_MS = 10 * 60 * 1000;      // sliding re-lock window
const MAX_FAILS = 5;                 // then a cooldown on PIN attempts
// Cooldown doubles with each consecutive lockout (30 s, 1 m, 2 m ... 15 m
// cap) and resets on a correct PIN. A flat 30 s allows ~14k guesses/day —
// enough to sweep a 4-digit space overnight if LAN mode is ever enabled.
const FAIL_COOLDOWN_MS = 30 * 1000;
const FAIL_COOLDOWN_MAX_MS = 15 * 60 * 1000;

const sessions = new Map();          // token -> lastSeen ms
const fails = { count: 0, streak: 0, lockedUntil: 0 };

function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pin), salt, 32);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

function verifyPin(pin, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(String(pin), Buffer.from(saltHex, 'hex'), 32);
  const expected = Buffer.from(hashHex, 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

function pinSet(cfg = config.load()) {
  return !!cfg.adminPinHash;
}

function cookieToken(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === COOKIE) return v || null;
  }
  return null;
}

function pruneSessions() {
  const cutoff = Date.now() - IDLE_MS;
  for (const [token, seen] of sessions) {
    if (seen < cutoff) sessions.delete(token);
  }
}

// Valid session? Touch it (sliding expiry) and say yes.
function isUnlocked(req) {
  if (!pinSet()) return true; // nothing gated until a PIN exists
  pruneSessions();
  const token = cookieToken(req);
  if (!token || !sessions.has(token)) return false;
  sessions.set(token, Date.now());
  return true;
}

function attemptsBlocked() {
  return fails.lockedUntil > Date.now();
}

function blockedForMs() {
  return Math.max(0, fails.lockedUntil - Date.now());
}

function issueSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now());
  return token;
}

// All unlocks everywhere die now — used when the PIN is rotated, so a session
// opened under a possibly-compromised old PIN can't outlive it.
function revokeAll() {
  sessions.clear();
}

// Returns a token on success, null on a wrong PIN (counting toward the
// cooldown), or 'blocked' while the cooldown is active.
function unlock(pin) {
  if (attemptsBlocked()) return 'blocked';
  const cfg = config.load();
  if (!pinSet(cfg) || !verifyPin(pin, cfg.adminPinHash)) {
    fails.count += 1;
    if (fails.count >= MAX_FAILS) {
      fails.count = 0;
      fails.streak += 1;
      fails.lockedUntil = Date.now() +
        Math.min(FAIL_COOLDOWN_MS * 2 ** (fails.streak - 1), FAIL_COOLDOWN_MAX_MS);
    }
    return null;
  }
  fails.count = 0;
  fails.streak = 0;
  return issueSession();
}

function lock(req) {
  const token = cookieToken(req);
  if (token) sessions.delete(token);
}

function setCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`);
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

// Route guard for the gated POSTs. Friendly redirect, not a 401 — the /admin
// page shows the unlock form.
function requireAdmin(req, res, next) {
  if (isUnlocked(req)) return next();
  res.redirect('/admin?auth=locked');
}

module.exports = {
  pinSet, isUnlocked, unlock, lock, requireAdmin, issueSession, revokeAll,
  hashPin, verifyPin, setCookie, clearCookie, attemptsBlocked, blockedForMs, IDLE_MS
};
