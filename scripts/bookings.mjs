import { chmodSync, linkSync, lstatSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { backup } from "node:sqlite";
import { assertPrivateDataDirectory, closeBookings, openBookings, storageErrorCode } from "../lib/storage.mjs";

const [command = "list", argument, ...extra] = process.argv.slice(2);
const statuses = { confirm: "confirmed", decline: "declined" };
const id = argument?.toUpperCase();
const isBookingCommand = command === "show" || Object.hasOwn(statuses, command);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function listBookings(db) {
  const rows = db.prepare(`
    SELECT id AS "Номер", tour_title AS "Тур", departure_date AS "Выезд", days AS "Дни",
      people AS "Участники", CASE with_guide WHEN 1 THEN 'Да' ELSE 'Нет' END AS "Гид",
      total AS "Сумма, сом", status AS "Статус"
    FROM bookings ORDER BY created_at DESC, id DESC
  `).all();

  if (rows.length) console.table(rows);
  else console.log("Заявок пока нет.");
}

function showBooking(db, bookingId) {
  const row = db.prepare(`
    SELECT id AS "Номер", tour_title AS "Тур", departure_date AS "Выезд", days AS "Дни",
      people AS "Участники", CASE with_guide WHEN 1 THEN 'Да' ELSE 'Нет' END AS "Гид",
      base AS "Тур, сом", guide AS "Гид, сом", total AS "Сумма, сом",
      name AS "Имя", contact AS "Контакт", status AS "Статус"
    FROM bookings WHERE id = ?
  `).get(bookingId);

  if (row) console.table([row]);
  else fail("Заявка не найдена.");
}

function updateStatus(db, bookingId, status) {
  const updated = db.prepare(`
    UPDATE bookings SET status = ?, updated_at = ?
    WHERE id = ? AND status = 'pending'
  `).run(status, new Date().toISOString(), bookingId);

  if (updated.changes) {
    console.log(bookingId, status);
    return;
  }

  const current = db.prepare("SELECT status FROM bookings WHERE id = ?").get(bookingId);
  if (current?.status === status) console.log(bookingId, status);
  else fail(current ? "Заявка уже обработана." : "Заявка не найдена.");
}

async function backupBookings(db, path) {
  const target = resolve(path);
  const parent = dirname(target);
  assertPrivateDataDirectory(parent);
  if (lstatSync(target, { throwIfNoEntry: false })) {
    throw Object.assign(new Error("Backup target exists"), { code: "EEXIST" });
  }

  // Publish a completed backup atomically without replacing an existing file.
  const workspace = mkdtempSync(join(parent, ".too-tury-backup-"));
  try {
    const snapshot = join(workspace, "bookings.sqlite");
    await backup(db, snapshot);
    if (process.platform !== "win32") chmodSync(snapshot, 0o600);
    linkSync(snapshot, target);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
  console.log("Резервная копия сохранена.");
}

async function run() {
  const validCommand = (command === "list" && argument === undefined)
    || (isBookingCommand && /^TT-[0-9A-F]{12}$/.test(id ?? ""))
    || (command === "backup" && Boolean(argument?.trim()));

  if (!validCommand || extra.length) {
    fail("npm run bookings -- list | show TT-XXXXXXXXXXXX | confirm TT-XXXXXXXXXXXX | decline TT-XXXXXXXXXXXX | backup ПУТЬ");
    return;
  }

  try {
    const requireFromNext = createRequire(import.meta.resolve("next/package.json"));
    const { loadEnvConfig } = requireFromNext("@next/env");
    loadEnvConfig(process.cwd(), process.env.NODE_ENV === "development", {
      info() {},
      error() {
        throw Object.assign(new Error("Invalid Next.js environment configuration"), { code: "INVALID_ENV_FILE" });
      },
    });
    const db = openBookings();
    if (command === "list") listBookings(db);
    else if (command === "show") showBooking(db, id);
    else if (command === "backup") await backupBookings(db, argument);
    else updateStatus(db, id, statuses[command]);
  } catch (error) {
    const code = storageErrorCode(error);
    if (command === "backup" && code === "EEXIST") fail("Файл резервной копии уже существует. Укажите другой путь.");
    else if (code === "PUBLIC_DATA_DIRECTORY") fail("Используйте закрытый каталог вне public.");
    else fail(`Не удалось выполнить операцию с заявками (${code}). Проверьте каталог и права на запись.`);
  } finally {
    closeBookings();
  }
}

await run();
