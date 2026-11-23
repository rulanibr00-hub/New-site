import sharp from "sharp";
import { adminActionOrigin, isAdmin } from "@/lib/admin-auth";
import { storageErrorCode } from "@/lib/storage.mjs";
import { maxTourMediaBytes, saveTourMedia } from "@/lib/tour-media";

export const runtime = "nodejs";

const formats = new Map([
  ["image/jpeg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function json(payload: object, status: number) {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

async function readImage(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks, length);
      length += value.byteLength;
      if (length > maxTourMediaBytes) {
        void reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  if (!await isAdmin()) return json({ error: "Войдите в панель управления." }, 401);
  if (!await adminActionOrigin()) return json({ error: "Запрос отклонён." }, 403);

  const type = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  const format = type && formats.get(type);
  if (!format) return json({ error: "Выберите фотографию в формате JPEG, PNG или WebP." }, 415);
  if (Number(request.headers.get("content-length") ?? 0) > maxTourMediaBytes) {
    return json({ error: "Размер фотографии должен быть не больше 8 МБ." }, 413);
  }

  let image;
  try {
    if (!request.body) return json({ error: "Выберите фотографию." }, 400);
    const bytes = await readImage(request.body);
    if (!bytes) return json({ error: "Размер фотографии должен быть не больше 8 МБ." }, 413);

    const decoder = sharp(bytes, { limitInputPixels: 25_000_000, failOn: "warning" });
    const source = await decoder.metadata();
    if (source.format !== format || (source.pages ?? 1) > 1) {
      return json({ error: "Выберите неподвижную фотографию в указанном формате." }, 422);
    }

    image = await decoder.autoOrient()
      .resize({ width: 2000, height: 1500, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return json({ error: "Не удалось прочитать фотографию. Проверьте файл и его разрешение до 25 Мп." }, 422);
  }

  try {
    const path = await saveTourMedia(image.data);
    return json({ path, width: image.info.width, height: image.info.height }, 201);
  } catch (error) {
    console.error("Не удалось сохранить фотографию тура.", storageErrorCode(error));
    return json({ error: "Не удалось сохранить фотографию. Попробуйте ещё раз." }, 500);
  }
}
