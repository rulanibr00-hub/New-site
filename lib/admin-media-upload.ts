export const supportedImageTypes = "image/jpeg,image/png,image/webp";

const maxBytes = 8 * 1024 * 1024;
const pathPattern = /^\/media\/[0-9a-f]{32}\.webp$/;

function fileType(file: File) {
  if (supportedImageTypes.split(",").includes(file.type)) return file.type;
  const suffix = file.name.split(".").pop()?.toLowerCase();
  if (!file.type && (suffix === "jpg" || suffix === "jpeg")) return "image/jpeg";
  if (!file.type && (suffix === "png" || suffix === "webp")) return `image/${suffix}`;
  throw new Error("Выберите фотографию в формате JPEG, PNG или WebP.");
}

export async function uploadAdminImage(file: File) {
  if (!file.size || file.size > maxBytes) {
    throw new Error("Размер фотографии должен быть больше нуля и не больше 8 МБ.");
  }
  const type = fileType(file);
  let response: Response;
  try {
    response = await fetch("/api/admin/media", {
      method: "POST",
      headers: { "Content-Type": type },
      body: file,
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new Error("Загрузка прервалась. Попробуйте ещё раз.");
  }
  const result: unknown = await response.json().catch(() => null);
  if (response.ok && typeof result === "object" && result !== null && "path" in result
    && typeof result.path === "string" && pathPattern.test(result.path)) {
    return result.path;
  }
  const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
    ? result.error : "Не удалось загрузить фотографию. Попробуйте ещё раз.";
  throw new Error(message);
}
