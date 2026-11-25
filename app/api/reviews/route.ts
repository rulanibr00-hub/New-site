import { getPublishedTour } from "@/lib/catalog-store";
import { reviewLimits } from "@/lib/review-types";
import { saveReview } from "@/lib/review-store";
import { storageErrorCode } from "@/lib/storage.mjs";

export const runtime = "nodejs";

const maxBodyBytes = 8192;
const bookingIdPattern = /^TT-[0-9A-F]{12}$/;
// Line breaks are allowed in the review text; other control characters are not.
const controlsInName = /\p{Cc}/u;
const controlsInBody = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u;

function json(body: object, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function error(message: string, status = 400) {
  return json({ error: message }, status);
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

function readReview(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const { tourSlug, author, rating, body, bookingId } = input as Record<string, unknown>;
  if (
    typeof tourSlug !== "string" || tourSlug.length > 64 ||
    typeof author !== "string" || author.length > 200 ||
    typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5 ||
    typeof body !== "string" || body.length > 4000 ||
    (bookingId !== undefined && bookingId !== null && (typeof bookingId !== "string" || bookingId.length > 40))
  ) return null;

  const cleanAuthor = author.trim();
  const cleanBody = body.trim().replace(/\r\n?/g, "\n");
  if (
    cleanAuthor.length < reviewLimits.authorMin || cleanAuthor.length > reviewLimits.authorMax ||
    cleanBody.length < reviewLimits.bodyMin || cleanBody.length > reviewLimits.bodyMax ||
    controlsInName.test(cleanAuthor) || controlsInBody.test(cleanBody)
  ) return null;

  const cleanBookingId = typeof bookingId === "string" ? bookingId.trim().toUpperCase() : "";
  return {
    tourSlug,
    author: cleanAuthor,
    rating,
    body: cleanBody,
    // A mistyped booking number must not block the review, it just stays unverified.
    bookingId: bookingIdPattern.test(cleanBookingId) ? cleanBookingId : null,
  };
}

export async function POST(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") return error("Отправьте данные отзыва в формате JSON.", 415);
  if (Number(request.headers.get("content-length") ?? 0) > maxBodyBytes) return error("Отзыв слишком большой.", 413);
  if (!request.body) return error("Проверьте данные отзыва.");

  let value: unknown;
  try {
    const result = await readBody(request.body);
    if (result.tooLarge) return error("Отзыв слишком большой.", 413);
    value = result.value;
  } catch {
    return error("Проверьте данные отзыва.");
  }

  // Hidden field that only automated senders fill in: pretend the review was accepted.
  if (value && typeof value === "object" && "website" in value && (value as { website?: unknown }).website) {
    return json({ ok: true }, 201);
  }

  const review = readReview(value);
  if (!review) {
    return error(`Проверьте имя, оценку и текст отзыва: от ${reviewLimits.bodyMin} до ${reviewLimits.bodyMax} символов.`);
  }
  if (!getPublishedTour(review.tourSlug, { includeRouteTrack: false })) return error("Тур больше не доступен.", 404);

  try {
    const result = saveReview(review);
    if (result === "limit") return error("Сейчас поступает слишком много отзывов. Попробуйте позже.", 429);
  } catch (cause) {
    console.error("Не удалось сохранить отзыв.", storageErrorCode(cause));
    return error("Не удалось сохранить отзыв. Попробуйте ещё раз.", 500);
  }
  // A repeated identical review is acknowledged without creating a second record.
  return json({ ok: true }, 201);
}
