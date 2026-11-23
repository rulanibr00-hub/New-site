"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from "lucide-react";

type Props = {
  image: string;
  gallery: string[];
  onChange: (image: string, gallery: string[]) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
};

const supported = "image/jpeg,image/png,image/webp";
const maxBytes = 8 * 1024 * 1024;
const galleryLimit = 12;
const pathPattern = /^\/media\/[0-9a-f]{32}\.webp$/;

function fileType(file: File) {
  if (supported.split(",").includes(file.type)) return file.type;
  const suffix = file.name.split(".").pop()?.toLowerCase();
  if (!file.type && (suffix === "jpg" || suffix === "jpeg")) return "image/jpeg";
  if (!file.type && (suffix === "png" || suffix === "webp")) return `image/${suffix}`;
  throw new Error("Выберите фотографию в формате JPEG, PNG или WebP.");
}

async function uploadFile(file: File) {
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

export function AdminMediaField({ image, gallery, onChange, onBusyChange, disabled }: Props) {
  const cover = useRef<HTMLInputElement>(null);
  const pictures = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const locked = disabled || uploading;

  async function handleFiles(input: HTMLInputElement, destination: "cover" | "gallery") {
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (!files.length || disabled || inFlight.current) return;
    if (destination === "gallery" && gallery.length + files.length > galleryLimit) {
      setError(`В галерею можно добавить до ${galleryLimit} фотографий.`);
      return;
    }

    inFlight.current = true;
    setUploading(true);
    onBusyChange?.(true);
    setError("");

    const uploaded: string[] = [];
    try {
      for (const file of files) {
        uploaded.push(await uploadFile(file));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Загрузка прервалась. Попробуйте ещё раз.");
    } finally {
      if (uploaded.length) {
        if (destination === "cover") onChange(uploaded[0], gallery);
        else onChange(image, [...gallery, ...uploaded]);
      }
      inFlight.current = false;
      setUploading(false);
      onBusyChange?.(false);
    }
  }

  function move(index: number, step: number) {
    const revised = [...gallery];
    [revised[index], revised[index + step]] = [revised[index + step], revised[index]];
    onChange(image, revised);
  }

  return (
    <div className="admin-media" aria-busy={uploading}>
      <input type="hidden" name="image" value={image} />
      {gallery.map((path, index) => <input key={`${path}-${index}`} type="hidden" name="gallery" value={path} />)}
      <div className="admin-media-list">
        <div className="admin-media-item">
          <h3>Обложка</h3>
          {image && <img className="admin-media-preview" src={image} alt="Обложка тура" />}
          <div className="admin-media-actions">
            <button type="button" className="admin-secondary admin-media-control" disabled={locked} onClick={() => cover.current?.click()}>
              <ImagePlus size={17} aria-hidden="true" /> {image ? "Заменить обложку" : "Загрузить обложку"}
            </button>
            {image && (
              <button type="button" className="admin-secondary admin-media-control" disabled={locked} aria-label="Убрать обложку" onClick={() => onChange("", gallery)}>
                <Trash2 size={17} aria-hidden="true" />
              </button>
            )}
          </div>
          <input hidden ref={cover} type="file" accept={supported} aria-label="Файл обложки" disabled={locked} onChange={(event) => void handleFiles(event.currentTarget, "cover")} />
        </div>
        <div className="admin-media-item">
          <h3>Галерея</h3>
          <div className="admin-media-list">
            {gallery.map((path, index) => (
              <div className="admin-media-item" key={`${path}-${index}`}>
                <img className="admin-media-preview" src={path} alt={`Фото ${index + 1}`} loading="lazy" />
                <div className="admin-media-actions">
                  <button type="button" className="admin-secondary admin-media-control" disabled={locked || index === 0} aria-label={`Переместить фото ${index + 1} влево`} onClick={() => move(index, -1)}>
                    <ArrowLeft size={16} aria-hidden="true" />
                  </button>
                  <button type="button" className="admin-secondary admin-media-control" disabled={locked || index === gallery.length - 1} aria-label={`Переместить фото ${index + 1} вправо`} onClick={() => move(index, 1)}>
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                  <button type="button" className="admin-secondary admin-media-control" disabled={locked} aria-label={`Убрать фото ${index + 1}`} onClick={() => onChange(image, gallery.filter((_, item) => item !== index))}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="admin-secondary admin-media-control admin-media-upload" disabled={locked || gallery.length >= galleryLimit} onClick={() => pictures.current?.click()}>
            <ImagePlus size={17} aria-hidden="true" /> Добавить фото
          </button>
          <input hidden ref={pictures} type="file" accept={supported} multiple aria-label="Файлы галереи" disabled={locked} onChange={(event) => void handleFiles(event.currentTarget, "gallery")} />
        </div>
      </div>
      <p className="admin-media-note">JPEG, PNG или WebP, до 8 МБ и 25 Мп на фотографию. В галерее до {galleryLimit} фото.</p>
      {uploading && <p className="admin-media-note" role="status">Загружаем фотографии…</p>}
      {error && <p className="admin-error admin-media-error" role="alert">{error}</p>}
    </div>
  );
}
