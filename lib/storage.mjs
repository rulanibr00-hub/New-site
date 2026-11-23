import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";

let database;

export function storageErrorCode(error) {
  const code = typeof error?.code === "string" && /^[A-Z0-9_]{1,48}$/.test(error.code) ? error.code : "UNKNOWN";
  return Number.isInteger(error?.errcode) ? `${code} (${error.errcode})` : code;
}

function checkPrivateDirectory(directory, publicDirectory) {
  if (directory === publicDirectory || directory.startsWith(publicDirectory + sep)) {
    throw Object.assign(new Error("Booking data directory is publicly served"), { code: "PUBLIC_DATA_DIRECTORY" });
  }
}

export function assertPrivateDataDirectory(directory) {
  const publicDirectory = resolve("public");
  checkPrivateDirectory(directory, publicDirectory);
  if (existsSync(directory) && existsSync(publicDirectory)) {
    checkPrivateDirectory(realpathSync(directory), realpathSync(publicDirectory));
  }
}

export function privateDataDirectory() {
  // Private runtime data belongs to its writable volume, outside build artifacts.
  return resolve(/* turbopackIgnore: true */ process.env.TOO_TURY_DATA_DIR || ".data");
}

function makeOwnerOnly(file, optional = false) {
  try {
    const info = lstatSync(file);
    if (!info.isFile()) {
      throw Object.assign(new Error("Booking data path must be a regular file"), { code: "INVALID_DATA_FILE" });
    }
    if (process.platform !== "win32" && (info.mode & 0o077) !== 0) chmodSync(file, 0o600);
  } catch (error) {
    if (!optional || error.code !== "ENOENT") throw error;
  }
}

export function openBookings() {
  if (database) return database;

  const directory = privateDataDirectory();
  assertPrivateDataDirectory(directory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertPrivateDataDirectory(directory);

  const filename = resolve(directory, "bookings.sqlite");
  try {
    closeSync(openSync(filename, "wx", 0o600));
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  makeOwnerOnly(filename);
  for (const suffix of ["-wal", "-shm", "-journal"]) makeOwnerOnly(filename + suffix, true);

  const db = new DatabaseSync(filename, { timeout: 5000 });
  try {
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        request_id TEXT UNIQUE,
        request_hash TEXT NOT NULL,
        tour_slug TEXT NOT NULL,
        tour_title TEXT NOT NULL,
        option_id TEXT NOT NULL,
        days INTEGER NOT NULL CHECK (days > 0),
        departure_date TEXT NOT NULL,
        people INTEGER NOT NULL CHECK (people > 0),
        with_guide INTEGER NOT NULL CHECK (with_guide IN (0, 1)),
        name TEXT NOT NULL,
        contact TEXT NOT NULL,
        base INTEGER NOT NULL CHECK (base >= 0),
        guide INTEGER NOT NULL CHECK (guide >= 0),
        total INTEGER NOT NULL CHECK (total = base + guide),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `);
  } catch (error) {
    db.close();
    throw error;
  }
  database = db;
  return db;
}

export function closeBookings() {
  if (!database) return;
  database.close();
  database = undefined;
}
