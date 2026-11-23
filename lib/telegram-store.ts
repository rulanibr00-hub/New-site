import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, linkSync, openSync, readSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type DatabaseSync } from "node:sqlite";
import { assertPrivateDataDirectory, openBookings, privateDataDirectory } from "./storage.mjs";

type SettingsRow = {
  enabled: 0 | 1;
  chat_id: string;
  sealed_token: Uint8Array | null;
  revision: number;
  route_version: number;
};

type SettingsInput = { enabled: boolean; chatId: string; token: string; clearToken: boolean };

export type TelegramSettings = {
  enabled: boolean;
  chatId: string;
  hasToken: boolean;
  revision: number;
  pending: number;
  sent: number;
  failed: number;
};

type BookingDetails = {
  id: string;
  tour_title: string;
  category: string;
  departure_date: string;
  days: number;
  people: number;
  with_guide: number;
  name: string;
  contact: string;
  base: number;
  guide: number;
  total: number;
  created_at: string;
};

export type TelegramJob = {
  id: string;
  lease: string;
  attempt: number;
  chatId: string;
  token: string;
  booking: BookingDetails;
};

type DeliveryOutcome =
  | { status: "sent" }
  | { status: "retry"; retryAt: number; error: string }
  | { status: "failed"; error: string };

export class TelegramSettingsError extends Error {}

const initialized = new WeakSet<DatabaseSync>();
const tokenPattern = /^\d{5,20}:[A-Za-z0-9_-]{20,120}$/;
const chatPattern = /^-?[1-9]\d{0,15}$/;
const context = Buffer.from("too-tury.telegram-token.v1");
const leaseDuration = 60_000;

export function ensureTelegram(db = openBookings()): DatabaseSync {
  if (initialized.has(db)) return db;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS telegram_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        chat_id TEXT NOT NULL,
        sealed_token BLOB,
        revision INTEGER NOT NULL CHECK (revision >= 0),
        route_version INTEGER NOT NULL CHECK (route_version >= 0),
        CHECK (enabled = 0 OR (chat_id <> '' AND sealed_token IS NOT NULL))
      ) STRICT;
      INSERT INTO telegram_settings (id, enabled, chat_id, revision, route_version)
      VALUES (1, 0, '', 0, 0) ON CONFLICT(id) DO NOTHING;
      CREATE TABLE IF NOT EXISTS telegram_outbox (
        booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        route_version INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'canceled')),
        next_at INTEGER NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 0,
        lease TEXT,
        lease_until INTEGER,
        error_code TEXT,
        CHECK ((lease IS NULL) = (lease_until IS NULL))
      ) STRICT;
      CREATE INDEX IF NOT EXISTS telegram_outbox_pending
      ON telegram_outbox (route_version, next_at) WHERE status = 'pending';
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  initialized.add(db);
  return db;
}

function readSettings(db: DatabaseSync) {
  return db.prepare("SELECT enabled, chat_id, sealed_token, revision, route_version FROM telegram_settings WHERE id = 1")
    .get() as SettingsRow;
}

function settingsView(db: DatabaseSync, row: SettingsRow): TelegramSettings {
  const counts = db.prepare(`
    SELECT count(*) FILTER (WHERE status = 'pending') AS pending,
           count(*) FILTER (WHERE status = 'sent') AS sent,
           count(*) FILTER (WHERE status = 'failed') AS failed
    FROM telegram_outbox
  `).get() as Pick<TelegramSettings, "pending" | "sent" | "failed">;
  return {
    enabled: row.enabled === 1,
    chatId: row.chat_id,
    hasToken: row.sealed_token !== null,
    revision: row.revision,
    ...counts,
  };
}

export function getTelegramSettings(): TelegramSettings {
  const db = ensureTelegram();
  return settingsView(db, readSettings(db));
}

function loadKey(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size !== 32 || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) {
      throw new Error("Invalid Telegram key file");
    }
    const key = Buffer.alloc(32);
    if (readSync(fd, key, 0, key.length, 0) !== key.length) throw new Error("Invalid Telegram key length");
    return key;
  } finally {
    closeSync(fd);
  }
}

function encryptionKey(create: boolean) {
  const directory = realpathSync(/* turbopackIgnore: true */ privateDataDirectory());
  assertPrivateDataDirectory(directory);
  if (process.platform !== "win32" && (statSync(directory).mode & 0o022) !== 0) {
    throw new Error("Unsafe Telegram key directory");
  }
  const path = join(directory, "telegram.key");
  try {
    return loadKey(path);
  } catch (error) {
    if (!create || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const staging = join(directory, `.telegram-key-${randomUUID()}`);
  const fd = openSync(staging, "wx", 0o600);
  try {
    try {
      writeFileSync(fd, randomBytes(32));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    try {
      linkSync(staging, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  } finally {
    unlinkSync(staging);
  }
  if (process.platform !== "win32") {
    const directoryFd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY);
    try {
      fsyncSync(directoryFd);
    } finally {
      closeSync(directoryFd);
    }
  }
  return loadKey(path);
}

function sealToken(token: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(true), nonce);
  cipher.setAAD(context);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), data]);
}

function openToken(sealed: Uint8Array) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(false), sealed.subarray(0, 12));
  decipher.setAuthTag(sealed.subarray(12, 28));
  decipher.setAAD(context);
  const token = Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]).toString("utf8");
  if (!tokenPattern.test(token)) throw new Error("Invalid stored Telegram token");
  return token;
}

export function saveTelegramSettings(input: SettingsInput, expectedRevision: number): TelegramSettings {
  const chatId = input.chatId.trim();
  const token = input.token.trim();
  if (chatId && (!chatPattern.test(chatId) || Math.abs(Number(chatId)) >= 2 ** 52)) {
    throw new TelegramSettingsError("Укажите числовой ID чата Telegram. ID группы может начинаться с минуса.");
  }
  if (token && !tokenPattern.test(token)) throw new TelegramSettingsError("Проверьте формат токена Telegram-бота.");
  if (input.clearToken && token) throw new TelegramSettingsError("Выберите одно действие с токеном.");

  const db = ensureTelegram();
  db.exec("BEGIN IMMEDIATE");
  try {
    const previous = readSettings(db);
    if (!Number.isSafeInteger(expectedRevision) || previous.revision !== expectedRevision) {
      throw new TelegramSettingsError("Настройки уже изменились. Обновите страницу и повторите попытку.");
    }
    const willHaveToken = !input.clearToken && (Boolean(token) || previous.sealed_token !== null);
    if (input.enabled && (!chatId || !willHaveToken)) {
      throw new TelegramSettingsError("Чтобы включить уведомления, укажите ID чата и токен бота.");
    }
    const sealed = input.clearToken ? null : token ? sealToken(token) : previous.sealed_token;
    const enabled = input.enabled ? 1 : 0;
    const routeChanged = enabled !== previous.enabled || chatId !== previous.chat_id
      || Boolean(token) || (input.clearToken && previous.sealed_token !== null);
    const routing = previous.route_version + Number(routeChanged);
    const row = db.prepare(`
      UPDATE telegram_settings
      SET enabled = ?, chat_id = ?, sealed_token = ?, revision = revision + 1, route_version = ?
      WHERE id = 1 RETURNING enabled, chat_id, sealed_token, revision, route_version
    `).get(enabled, chatId, sealed, routing) as SettingsRow;
    if (routeChanged) {
      db.prepare(`
        UPDATE telegram_outbox SET status = 'canceled', lease = NULL, lease_until = NULL
        WHERE status = 'pending' AND route_version <> ?
      `).run(routing);
    }
    const result = settingsView(db, row);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getTelegramCredentials(): { chatId: string; token: string } | null {
  const row = readSettings(ensureTelegram());
  if (!row.chat_id || !row.sealed_token) return null;
  return { chatId: row.chat_id, token: openToken(row.sealed_token) };
}

export function queueTelegramBooking(db: DatabaseSync, bookingId: string, category: string) {
  db.prepare(`
    INSERT INTO telegram_outbox (booking_id, category, route_version, status, next_at)
    SELECT ?, ?, route_version, 'pending', ? FROM telegram_settings WHERE id = 1 AND enabled = 1
    ON CONFLICT(booking_id) DO NOTHING
  `).run(bookingId, category, Date.now());
}

export function claimTelegramJob(): TelegramJob | null {
  const db = ensureTelegram();
  const now = Date.now();
  const candidate = db.prepare(`
    SELECT b.id, b.tour_title, o.category, b.departure_date, b.days, b.people, b.with_guide,
      b.name, b.contact, b.base, b.guide, b.total, b.created_at,
      s.chat_id, s.sealed_token, s.route_version
    FROM telegram_outbox AS o
    JOIN bookings AS b ON b.id = o.booking_id
    JOIN telegram_settings AS s ON s.id = 1 AND s.enabled = 1 AND s.route_version = o.route_version
    WHERE o.status = 'pending' AND o.next_at <= ?
      AND (o.lease_until IS NULL OR o.lease_until <= ?)
      AND NOT EXISTS (
        SELECT 1 FROM telegram_outbox AS deferred
        WHERE deferred.route_version = o.route_version AND deferred.status = 'pending'
          AND deferred.error_code = 'rate_limit' AND deferred.next_at > ?
      )
    ORDER BY o.next_at, o.booking_id LIMIT 1
  `).get(now, now, now) as (BookingDetails & Pick<SettingsRow, "chat_id" | "route_version"> & {
    sealed_token: Uint8Array;
  }) | undefined;
  if (!candidate) return null;

  const { chat_id: chatId, sealed_token: sealed, route_version: routing, ...booking } = candidate;
  const lease = randomUUID();
  const claimed = db.prepare(`
    UPDATE telegram_outbox AS job SET lease = ?, lease_until = ?, attempt = attempt + 1
    WHERE job.booking_id = ? AND job.route_version = ? AND job.status = 'pending' AND job.next_at <= ?
      AND (job.lease_until IS NULL OR job.lease_until <= ?)
      AND NOT EXISTS (
        SELECT 1 FROM telegram_outbox AS deferred
        WHERE deferred.route_version = job.route_version AND deferred.status = 'pending'
          AND deferred.error_code = 'rate_limit' AND deferred.next_at > ?
      )
    RETURNING attempt
  `).get(lease, now + leaseDuration, booking.id, routing, now, now, now) as { attempt: number } | undefined;
  if (!claimed) return null;

  try {
    return { id: booking.id, lease, attempt: claimed.attempt, chatId, token: openToken(sealed), booking };
  } catch {
    finishTelegramJob({ id: booking.id, lease }, { status: "failed", error: "credentials_unreadable" });
    return null;
  }
}

export function finishTelegramJob(job: Pick<TelegramJob, "id" | "lease">, outcome: DeliveryOutcome) {
  const status = outcome.status === "retry" ? "pending" : outcome.status;
  const nextAt = outcome.status === "retry" ? outcome.retryAt : Date.now();
  const errorCode = outcome.status === "sent" ? null
    : /^[a-z0-9_-]{1,60}$/i.test(outcome.error) ? outcome.error : "delivery_error";
  ensureTelegram().prepare(`
    UPDATE telegram_outbox SET status = ?, next_at = ?, error_code = ?, lease = NULL, lease_until = NULL
    WHERE booking_id = ? AND lease = ? AND status = 'pending'
  `).run(status, nextAt, errorCode, job.id, job.lease);
}
