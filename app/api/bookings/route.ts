import { createHash, randomUUID } from "node:crypto";
import { type DatabaseSync, type SQLInputValue } from "node:sqlite";
import { after } from "next/server";
import { ensureCatalog, getPublishedTour } from "@/lib/catalog-store";
import { storageErrorCode } from "@/lib/storage.mjs";
import { triggerTelegramDelivery } from "@/lib/telegram-notifications";
import { ensureTelegram, queueTelegramBooking } from "@/lib/telegram-store";
import { canDepart, priceTour } from "@/lib/tours";

export const runtime = "nodejs";

type SavedBooking = { id: string; total: number; request_hash: string };

const emailedContact = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneContact = /^\+?[\d\p{Zs}()-]+$/u;
const contactControls = /\p{Cc}/u;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxBodyBytes = 8192;

function readBooking(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const { requestId, tourSlug, optionId, date, people, withGuide, name, contact, quotedTotal } =
    input as Record<string, unknown>;

  if (
    (requestId !== undefined && (typeof requestId !== "string" || !uuid.test(requestId))) ||
    typeof tourSlug !== "string" || tourSlug.length > 64 ||
    typeof optionId !== "string" || optionId.length > 64 ||
    typeof date !== "string" || date.length !== 10 ||
    typeof people !== "number" || !Number.isSafeInteger(people) || people < 1 ||
    typeof withGuide !== "boolean" ||
    typeof name !== "string" || name.length > 100 ||
    typeof contact !== "string" || contact.length > 160 ||
    typeof quotedTotal !== "number" || !Number.isSafeInteger(quotedTotal)
  ) return null;

  const cleanName = name.trim();
  const cleanContact = contact.trim();
  const digits = cleanContact.replace(/\D/g, "").length;
  const validPhone = phoneContact.test(cleanContact) && digits >= 7 && digits <= 15;
  if (
    cleanName.length < 2 || contactControls.test(cleanName) || contactControls.test(cleanContact)
    || (!emailedContact.test(cleanContact) && !validPhone)
  ) return null;

  return { requestId: requestId?.toLowerCase() ?? null, tourSlug, optionId, date, people, withGuide,
    name: cleanName, contact: cleanContact, quotedTotal };
}

function json(body: object, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function error(message: string, status = 400, code?: string) {
  return json({ error: message, code }, status);
}

function savedResponse(saved: SavedBooking, hash: string) {
  if (saved.request_hash !== hash) return error("Параметры заявки изменились. Отправьте заявку заново.", 409);
  return json({ id: saved.id, total: saved.total }, 201);
}

async function readBody(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const buffer = new Uint8Array(maxBodyBytes);
  let length = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.byteLength > maxBodyBytes) {
        void reader.cancel().catch(() => {});
        return { tooLarge: true } as const;
      }
      buffer.set(value, length);
      length += value.byteLength;
    }

    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length));
    return { tooLarge: false, value: JSON.parse(text) as unknown } as const;
  } finally {
    reader.releaseLock();
  }
}

function saveBooking(db: DatabaseSync, booking: NonNullable<ReturnType<typeof readBooking>>) {
  const { requestId, ...fields } = booking;
  const { tourSlug, optionId, date, people, withGuide, name, contact, quotedTotal } = fields;
  const hash = createHash("sha256").update(JSON.stringify(fields)).digest("hex");

  if (requestId) {
    const saved = db.prepare("SELECT id, total, request_hash FROM bookings WHERE request_id = ?")
      .get(requestId) as SavedBooking | undefined;
    if (saved) return savedResponse(saved, hash);
  }

  const tour = getPublishedTour(tourSlug);
  if (!tour) return error("Тур больше не доступен для оформления.", 404);
  if (!canDepart(tour, date)) return error("Выберите доступную дату выезда.", 409, "availability_changed");
  const option = tour.options.find((candidate) => candidate.id === optionId);
  const quote = priceTour(tour, optionId, people, withGuide);
  if (!option || !quote) {
    return error("Доступные варианты тура изменились. Обновите параметры поездки.", 409, "availability_changed");
  }
  if (quote.total !== quotedTotal) {
    return error("Стоимость тура обновилась. Обновите цену перед отправкой заявки.", 409, "price_changed");
  }

  const id = "TT-" + randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const now = new Date().toISOString();
  const values: SQLInputValue[] = [
    id, requestId, hash, tourSlug, tour.title, optionId, option.days, date, people, Number(withGuide),
    name, contact, quote.base, quote.guide, quote.total, now, now,
  ];
  const inserted = db.prepare(`
      INSERT INTO bookings (
        id, request_id, request_hash, tour_slug, tour_title, option_id, days, departure_date, people,
        with_guide, name, contact, base, guide, total, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id, total, request_hash
  `).get(...values) as SavedBooking;
  queueTelegramBooking(db, inserted.id, tour.category);
  return savedResponse(inserted, hash);
}

export async function POST(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") return error("Отправьте данные заявки в формате JSON.", 415);
  if (Number(request.headers.get("content-length") ?? 0) > maxBodyBytes) {
    return error("Данные заявки слишком большие.", 413);
  }
  if (!request.body) return error("Проверьте данные заявки.");

  let booking;
  try {
    const body = await readBody(request.body);
    if (body.tooLarge) return error("Данные заявки слишком большие.", 413);
    booking = readBooking(body.value);
  } catch {
    return error("Проверьте данные заявки.");
  }
  if (!booking) return error("Проверьте параметры тура, имя и телефон или электронную почту.");

  let response: Response;
  try {
    const db = ensureTelegram(ensureCatalog());
    db.exec("BEGIN IMMEDIATE");
    try {
      response = saveBooking(db, booking);
      db.exec("COMMIT");
    } catch (cause) {
      db.exec("ROLLBACK");
      throw cause;
    }
  } catch (cause) {
    console.error("Не удалось сохранить заявку в SQLite.", storageErrorCode(cause));
    return error("Не удалось сохранить заявку. Попробуйте ещё раз.", 500);
  }
  if (response.status === 201) after(triggerTelegramDelivery);
  return response;
}
