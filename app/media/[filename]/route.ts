import { isAdmin } from "@/lib/admin-auth";
import { isPublishedTourPhoto } from "@/lib/catalog-store";
import { storageErrorCode } from "@/lib/storage.mjs";
import { isTourMediaFilename, openTourMedia } from "@/lib/tour-media";

export const runtime = "nodejs";

type MediaContext = { params: Promise<{ filename: string }> };

const privateHeaders = { "Cache-Control": "private, no-store" };

function notFound() {
  return new Response(null, { status: 404, headers: privateHeaders });
}

async function respond(request: Request, { params }: MediaContext, head: boolean) {
  const { filename } = await params;
  if (!isTourMediaFilename(filename)) return notFound();

  try {
    const path = `/media/${filename}`;
    const isPublic = isPublishedTourPhoto(path);
    if (!isPublic && !await isAdmin()) return notFound();

    const media = await openTourMedia(filename);
    if (!media) return notFound();

    const headers = new Headers({
      "Content-Type": "image/webp",
      "Content-Length": String(media.size),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": isPublic ? "public, no-cache" : "private, no-store",
    });
    if (isPublic) {
      const etag = `"${filename}"`;
      headers.set("ETag", etag);
      if (request.headers.get("if-none-match")?.split(",").some((value) => {
        const tag = value.trim();
        return tag === etag || tag === `W/${etag}` || tag === "*";
      })) {
        await media.file.close();
        headers.delete("Content-Length");
        return new Response(null, { status: 304, headers });
      }
    }

    if (head) {
      await media.file.close();
      return new Response(null, { headers });
    }

    try {
      // Node's file stream implements the web standard despite different library types.
      const body = media.file.readableWebStream({ autoClose: true }) as unknown as ReadableStream<Uint8Array>;
      return new Response(body, { headers });
    } catch (error) {
      await media.file.close();
      throw error;
    }
  } catch (error) {
    console.error("Не удалось открыть фотографию тура.", storageErrorCode(error));
    return new Response(null, { status: 500, headers: privateHeaders });
  }
}

export async function GET(request: Request, context: MediaContext) {
  return respond(request, context, false);
}

export async function HEAD(request: Request, context: MediaContext) {
  return respond(request, context, true);
}
