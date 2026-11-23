import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { openBookings } from "./storage.mjs";

export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;
const loginWindow = 10 * 60 * 1000;
const loginLimit = 8;
const initialized = new WeakSet();

function adminDatabase() {
  const db = openBookings();
  if (initialized.has(db)) return db;

  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_credentials (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      salt BLOB NOT NULL,
      password_hash BLOB NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS admin_session_expiry ON admin_sessions (expires_at);
    CREATE TABLE IF NOT EXISTS admin_login_window (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      attempts INTEGER NOT NULL,
      resets_at INTEGER NOT NULL
    ) STRICT;
  `);
  initialized.add(db);
  return db;
}

/** @param {unknown} value @returns {value is string} */
export function validAdminPassword(value) {
  if (typeof value !== "string" || value.length > 320 || !value.trim() || /[\p{Cc}\p{Cs}]/u.test(value)) return false;
  const length = [...value].length;
  return length >= 12 && length <= 160;
}

/** @param {string} password @param {Uint8Array} salt @returns {Promise<Buffer>} */
function derivePassword(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, hash) => {
      if (error) reject(error);
      else resolve(hash);
    });
  });
}

/** @param {string} password */
export async function setAdminPassword(password) {
  if (!validAdminPassword(password)) throw new Error("Invalid administrator password");

  const salt = randomBytes(32);
  const hash = await derivePassword(password, salt);
  const db = adminDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      INSERT INTO admin_credentials (id, salt, password_hash) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET salt = excluded.salt, password_hash = excluded.password_hash
    `).run(salt, hash);
    db.exec("DELETE FROM admin_sessions; DELETE FROM admin_login_window; COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** @param {string} token */
function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

/** @param {unknown} token @returns {token is string} */
function validToken(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** @param {string} password */
export async function verifyPasswordAndCreateSession(password) {
  const db = adminDatabase();
  const credential = /** @type {{salt: Uint8Array, password_hash: Uint8Array} | undefined} */ (
    db.prepare("SELECT salt, password_hash FROM admin_credentials WHERE id = 1").get()
  );
  if (!credential) return { status: "unconfigured" };

  // Reserve before computing scrypt so simultaneous requests share the same limit.
  const now = Date.now();
  const attempt = db.prepare(`
    INSERT INTO admin_login_window (id, attempts, resets_at) VALUES (1, 1, ?)
    ON CONFLICT(id) DO UPDATE SET
      attempts = CASE WHEN admin_login_window.resets_at <= ? THEN 1 ELSE admin_login_window.attempts + 1 END,
      resets_at = CASE WHEN admin_login_window.resets_at <= ? THEN excluded.resets_at ELSE admin_login_window.resets_at END
    WHERE admin_login_window.resets_at <= ? OR admin_login_window.attempts < ?
    RETURNING attempts
  `).get(now + loginWindow, now, now, now, loginLimit);
  if (!attempt) return { status: "limited" };
  if (!validAdminPassword(password)) return { status: "invalid" };

  const hash = await derivePassword(password, credential.salt);
  if (hash.length !== credential.password_hash.length || !timingSafeEqual(hash, credential.password_hash)) {
    return { status: "invalid" };
  }

  const issuedAt = Date.now();
  const token = randomBytes(32).toString("base64url");
  // Matching the salt prevents an attempt already in flight from issuing a session after rotation.
  db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(issuedAt);
  const inserted = db.prepare(`
    INSERT INTO admin_sessions (token_hash, expires_at)
    SELECT ?, ? FROM admin_credentials WHERE id = 1 AND salt = ?
  `).run(tokenHash(token), issuedAt + ADMIN_SESSION_SECONDS * 1000, credential.salt);
  if (!inserted.changes) return { status: "invalid" };
  db.prepare("DELETE FROM admin_login_window WHERE id = 1").run();
  return { status: "ok", token };
}

/** @param {unknown} token */
export function validateAdminToken(token) {
  if (!validToken(token)) return false;
  const row = adminDatabase().prepare("SELECT 1 FROM admin_sessions WHERE token_hash = ? AND expires_at > ?")
    .get(tokenHash(token), Date.now());
  return Boolean(row);
}

/** @param {unknown} token */
export function revokeAdminToken(token) {
  if (!validToken(token)) return;
  adminDatabase().prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash(token));
}
