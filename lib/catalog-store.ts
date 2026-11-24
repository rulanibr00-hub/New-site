import "server-only";
import { randomUUID } from "node:crypto";
import { lstatSync } from "node:fs";
import { resolve } from "node:path";
import { type DatabaseSync } from "node:sqlite";
import { openBookings } from "./storage.mjs";
import { isStoredTourMediaPath, storedTourMediaExists } from "./tour-media";
import {
  getToday, normalizeTourRouteTrack, parseRouteCoordinate, tourRouteLatitudeLimit, tourRoutePointLimit,
  tourRouteTrackPayloadLimit, tours, type Tour, type TourOption, type TourRoutePoint, type TourRouteTrack,
} from "./tours";

export type ManagedTour = {
  draft: Tour;
  published: Tour | null;
  revision: number;
  publishedRevision: number | null;
  updatedAt: string;
};

export type SiteSettings = {
  name: string;
  headline: string;
  tagline: string;
  about: string;
  email: string;
  phone: string;
  demo: boolean;
  revision: number;
};

type SettingsContent = Omit<SiteSettings, "revision">;
type TourRow = {
  draft: string;
  published: string | null;
  revision: number;
  published_revision: number | null;
  updated_at: string;
};
type PublishedRow = { published: string; demo: number };
type SettingsRow = { content: string; revision: number };

export class CatalogError extends Error {}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const optionPattern = /^[a-zA-Z0-9_-]+$/;
const bundledPhotoPattern = /^\/tours\/[a-z0-9-]+\.webp$/;
const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const emailPattern = /^[^\s@<>"?#&%]+@[^\s@<>"?#&%]+\.[^\s@<>"?#&%]+$/;
const phonePattern = /^\+?[\d\p{Zs}()-]+$/u;
const controlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const initialized = new WeakSet<DatabaseSync>();
const tourColumns = "draft, published, revision, published_revision, updated_at";
const photoLimit = 12;

const defaultSettings = {
  name: "Тоо Туры",
  headline: "Откройте Кыргызстан",
  tagline: "Горные маршруты, озёра и ночёвки в юртах.",
  about: "«Тоо Туры» помогает выбрать поездку по Кыргызстану. В каталоге можно сравнить однодневные прогулки, туры к озёрам и маршруты с ночёвкой в горах.\n\nВ каждом туре есть программа и список включённых услуг. Перед отправкой заявки вы увидите стоимость поездки для своей группы.",
  phone: "",
  demo: true,
};

export function ensureCatalog() {
  const db = openBookings();
  if (initialized.has(db)) return db;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS catalog_tours (
        position INTEGER PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        draft TEXT NOT NULL CHECK (json_valid(draft)),
        published TEXT CHECK (published IS NULL OR json_valid(published)),
        revision INTEGER NOT NULL CHECK (revision > 0),
        published_revision INTEGER CHECK (published_revision BETWEEN 1 AND revision),
        updated_at TEXT NOT NULL,
        CHECK ((published IS NULL) = (published_revision IS NULL))
      ) STRICT;
      CREATE TABLE IF NOT EXISTS site_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        content TEXT NOT NULL CHECK (json_valid(content)),
        revision INTEGER NOT NULL CHECK (revision > 0)
      ) STRICT;
    `);
    const configuredEmail = process.env.TOO_TURY_CONTACT_EMAIL?.trim() ?? "";
    const email = configuredEmail.length <= 254
      && emailPattern.test(configuredEmail)
      && !controlCharacters.test(configuredEmail)
      ? configuredEmail : "";
    const added = db.prepare(`
      INSERT INTO site_settings (id, content, revision) VALUES (1, ?, 1) ON CONFLICT(id) DO NOTHING
    `).run(JSON.stringify({ ...defaultSettings, email }));

    if (added.changes) {
      const insert = db.prepare(`
        INSERT INTO catalog_tours (slug, draft, published, revision, published_revision, updated_at)
        VALUES (?, ?, ?, 1, 1, ?) ON CONFLICT(slug) DO NOTHING
      `);
      const now = new Date().toISOString();
      for (const tour of tours) {
        const serialized = JSON.stringify(tour);
        insert.run(tour.slug, serialized, serialized, now);
      }
    }

    db.exec("COMMIT");
  } catch (cause) {
    db.exec("ROLLBACK");
    throw cause;
  }
  initialized.add(db);
  return db;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CatalogError(`Проверьте поле «${label}».`);
  }
  return value as Record<string, unknown>;
}

function text(
  value: unknown,
  label: string,
  limit: number,
  { required = false, multiline = false } = {},
) {
  if (value != null && typeof value !== "string") {
    throw new CatalogError(`Проверьте поле «${label}».`);
  }
  const result = (value ?? "").trim().replace(/\r\n?/g, "\n");
  if (required && !result) throw new CatalogError(`Заполните поле «${label}».`);
  if (result.length > limit) throw new CatalogError(`Поле «${label}» допускает до ${limit} символов.`);
  if (controlCharacters.test(result) || (!multiline && /[\n\t]/.test(result))) {
    throw new CatalogError(`Поле «${label}» содержит недопустимые символы.`);
  }
  return result;
}

function integer(value: unknown, label: string, min: number, max: number) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new CatalogError(`Поле «${label}» должно содержать целое число от ${min} до ${max}.`);
  }
  return parsed;
}

function items(value: unknown, label: string, limit: number): unknown[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > limit) {
    throw new CatalogError(`Поле «${label}» допускает до ${limit} элементов.`);
  }
  return value;
}

function readPhoto(value: unknown, label: string, required = false) {
  const path = text(value, label, 140, { required });
  if (!path) return "";

  if (bundledPhotoPattern.test(path)) {
    if (lstatSync(resolve("public", path.slice(1)), { throwIfNoEntry: false })?.isFile()) return path;
  } else if (isStoredTourMediaPath(path) && storedTourMediaExists(path)) {
    return path;
  }
  throw new CatalogError(`Фотография в поле «${label}» отсутствует. Загрузите её снова.`);
}

function readDate(value: unknown, label: string) {
  const date = text(value, label, 10);
  if (!date) return undefined;
  const utc = new Date(`${date}T00:00:00Z`);
  if (!calendarDatePattern.test(date) || !Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== date) {
    throw new CatalogError(`Проверьте дату в поле «${label}».`);
  }
  return date;
}

function readWeekdays(value: unknown) {
  const days = items(value, "Дни выезда", 7).map((day) => integer(day, "День недели", 0, 6));
  if (days.some((day) => day === null)) throw new CatalogError("Проверьте дни выезда.");
  return [...new Set(days as number[])].sort((left, right) => left - right);
}

function hasAvailableDeparture(days: number[], startDate?: string, endDate?: string) {
  if (!days.length) return false;
  if (!endDate) return true;
  const today = getToday();
  const firstDate = startDate && startDate > today ? startDate : today;
  const current = new Date(`${firstDate}T00:00:00Z`);
  const last = Date.parse(`${endDate}T00:00:00Z`);
  for (let offset = 0; offset < 7 && current.getTime() <= last; offset += 1) {
    if (days.includes(current.getUTCDay())) return true;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return false;
}

function readOption(value: unknown): TourOption {
  const entry = asRecord(value, "Вариант тура");
  const id = text(entry.id, "Код варианта", 64) || randomUUID();
  if (!optionPattern.test(id)) throw new CatalogError("Проверьте варианты тура.");
  return {
    id,
    days: integer(entry.days, "Длительность", 0, 60) ?? 0,
    pricePerPerson: integer(entry.pricePerPerson, "Цена за человека", 0, 10_000_000) ?? 0,
    guidePerGroup: integer(entry.guidePerGroup, "Доплата за гида", 0, 10_000_000),
  };
}

function readProgram(value: unknown, publish: boolean): Tour["program"] {
  const entries = items(value, "Программа тура", 30).map((item) => {
    const entry = asRecord(item, "Этап программы");
    return {
      time: text(entry.time, "Время этапа", 60),
      title: text(entry.title, "Название этапа", 120),
      description: text(entry.description, "Описание этапа", 600, { multiline: true }),
    };
  }).filter((entry) => entry.time || entry.title || entry.description);
  if (publish && (!entries.length || entries.some((entry) => !entry.time || !entry.title || !entry.description))) {
    throw new CatalogError("Добавьте этап программы и укажите время, название и описание для каждого этапа.");
  }
  return entries;
}

function readRoutePoints(value: unknown, publish: boolean, previous?: TourRoutePoint[]) {
  let source: unknown = value == null || (typeof value === "string" && !value.trim()) ? previous : value;
  if (source === undefined) return undefined;

  if (typeof source === "string") {
    try {
      source = JSON.parse(source) as unknown;
    } catch {
      throw new CatalogError("Проверьте точки маршрута.");
    }
  }
  if (!Array.isArray(source)) throw new CatalogError("Проверьте точки маршрута.");

  return items(source, "Точки маршрута", tourRoutePointLimit).map((item, index): TourRoutePoint => {
    const number = index + 1;
    const label = `Точка маршрута №${number}`;
    const entry = asRecord(item, label);
    const title = text(entry.title, `Название точки маршрута №${number}`, 120);
    const note = text(entry.note, `Примечание к точке маршрута №${number}`, 300, { multiline: true });
    const lat = parseRouteCoordinate(entry.lat, tourRouteLatitudeLimit);
    const lng = parseRouteCoordinate(entry.lng, 180);
    if (lat === undefined || lng === undefined) {
      throw new CatalogError(`${label}. Проверьте широту и долготу. Используйте десятичные градусы.`);
    }
    if (publish && (!title || lat === null || lng === null)) {
      throw new CatalogError(`${label}. Для публикации укажите название, широту и долготу.`);
    }
    return { title, note, lat, lng };
  });
}

function readRouteTrack(value: unknown, previous?: TourRouteTrack): TourRouteTrack | undefined {
  if (value == null || value === "") return previous;

  let source: unknown = value;
  if (typeof value === "string") {
    if (value.length > tourRouteTrackPayloadLimit) throw new CatalogError("GPS-трек слишком большой. Упростите его и загрузите заново.");
    try {
      source = JSON.parse(value);
    } catch {
      throw new CatalogError("Не удалось прочитать GPS-трек. Загрузите GPX заново.");
    }
  }
  if (source === null) return undefined;

  const track = normalizeTourRouteTrack(source);
  if (!track) throw new CatalogError("Проверьте координаты GPS-трека и загрузите GPX заново.");
  return track;
}

function readTour(input: Record<string, unknown>, slug: string, publish: boolean, previous?: Tour): Tour {
  const required = { required: publish };
  const startDate = readDate(input.startDate, "Начало выездов");
  const endDate = readDate(input.endDate, "Окончание выездов");
  if (startDate && endDate && startDate > endDate) {
    throw new CatalogError("Дата начала выездов должна быть раньше даты окончания или совпадать с ней.");
  }
  const weekdays = readWeekdays(input.weekdays);
  const groupLimit = integer(input.groupLimit, "Размер группы", 0, 100) ?? 0;
  const options = items(input.options, "Варианты тура", 12).map(readOption);
  if (new Set(options.map((option) => option.id)).size !== options.length) {
    throw new CatalogError("Варианты тура должны иметь разные коды.");
  }
  if (publish) {
    if (!groupLimit) throw new CatalogError("Укажите размер группы от 1 до 100 человек.");
    if (!options.length || options.some((option) => !option.days || !option.pricePerPerson)) {
      throw new CatalogError("Укажите длительность и цену за человека для каждого варианта тура.");
    }
    if (new Set(options.map((option) => option.days)).size !== options.length) {
      throw new CatalogError("Оставьте один вариант для каждой длительности тура.");
    }
    if (!hasAvailableDeparture(weekdays, startDate, endDate)) {
      throw new CatalogError("Выберите хотя бы один доступный день выезда в указанном периоде.");
    }
  }

  return {
    slug,
    title: text(input.title, "Название тура", 120, { required: true }),
    region: text(input.region, "Регион", 100, required),
    category: text(input.category, "Категория", 100),
    summary: text(input.summary, "Краткое описание", 240, required),
    description: text(input.description, "Описание", 4000, { ...required, multiline: true }),
    image: readPhoto(input.image, "Обложка", publish),
    gallery: [...new Set(items(input.gallery, "Галерея", photoLimit).map((item) => readPhoto(item, "Галерея")).filter(Boolean))],
    rating: previous?.rating ?? 0,
    reviewCount: previous?.reviewCount ?? 0,
    departure: text(input.departure, "Место выезда", 100, required),
    groupLimit,
    weekdays,
    options,
    includes: [...new Set(items(input.includes, "Что включено", 24).map((item) => text(item, "Что включено", 200)).filter(Boolean))],
    program: readProgram(input.program, publish),
    routePoints: readRoutePoints(input.routePoints, publish, previous?.routePoints),
    routeTrack: readRouteTrack(input.routeTrack, previous?.routeTrack),
    startDate,
    endDate,
  };
}

function managedTour(row: TourRow): ManagedTour {
  return {
    draft: JSON.parse(row.draft) as Tour,
    published: row.published ? JSON.parse(row.published) as Tour : null,
    revision: row.revision,
    publishedRevision: row.published_revision,
    updatedAt: row.updated_at,
  };
}

function publicTour(row: PublishedRow): Tour {
  const tour = JSON.parse(row.published) as Tour;
  return row.demo ? tour : { ...tour, rating: 0, reviewCount: 0 };
}

export function listManagedTours(): ManagedTour[] {
  const rows = ensureCatalog().prepare(`
    SELECT ${tourColumns} FROM catalog_tours ORDER BY updated_at DESC, position ASC
  `).all() as TourRow[];
  return rows.map(managedTour);
}

export function getManagedTour(slug: string): ManagedTour | null {
  const row = ensureCatalog().prepare(`SELECT ${tourColumns} FROM catalog_tours WHERE slug = ?`).get(slug) as TourRow | undefined;
  return row ? managedTour(row) : null;
}

function selectPublicTours(includeRouteTrack: boolean) {
  const published = includeRouteTrack ? "tour.published" : "json_remove(tour.published, '$.routeTrack')";
  return `
    SELECT ${published} AS published, json_extract(settings.content, '$.demo') AS demo
    FROM catalog_tours AS tour
    CROSS JOIN site_settings AS settings
    WHERE tour.published IS NOT NULL
  `;
}

export function listPublishedTours(): Tour[] {
  const rows = ensureCatalog().prepare(selectPublicTours(false) + " ORDER BY tour.position").all() as PublishedRow[];
  return rows.map(publicTour);
}

export function getPublishedTour(slug: string, { includeRouteTrack = true }: { includeRouteTrack?: boolean } = {}): Tour | null {
  const row = ensureCatalog().prepare(selectPublicTours(includeRouteTrack) + " AND tour.slug = ?").get(slug) as PublishedRow | undefined;
  return row ? publicTour(row) : null;
}

export function isPublishedTourPhoto(path: string) {
  return Boolean(ensureCatalog().prepare(`
    SELECT 1 FROM catalog_tours
    WHERE published IS NOT NULL AND (
      json_extract(published, '$.image') = ? OR
      EXISTS (SELECT 1 FROM json_each(published, '$.gallery') WHERE value = ?)
    )
    LIMIT 1
  `).get(path, path));
}

function requireRevision(expectedRevision: number) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new CatalogError("Обновите страницу и повторите действие.");
}

export function saveManagedTour(input: unknown, expectedRevision: number | null, publish: boolean): ManagedTour {
  const fields = asRecord(input, "Тур");
  const slug = text(fields.slug, "Адрес тура", 64, { required: true });
  if (!slugPattern.test(slug)) throw new CatalogError("Используйте в адресе тура строчные латинские буквы, цифры и дефисы.");
  const db = ensureCatalog();
  const now = new Date().toISOString();

  if (expectedRevision === null) {
    const serialized = JSON.stringify(readTour(fields, slug, publish));
    const inserted = db.prepare(`
      INSERT INTO catalog_tours (slug, draft, published, revision, published_revision, updated_at)
      VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(slug) DO NOTHING RETURNING ${tourColumns}
    `).get(slug, serialized, publish ? serialized : null, publish ? 1 : null, now) as TourRow | undefined;
    if (!inserted) throw new CatalogError("Такой адрес тура уже используется. Выберите другой адрес.");
    return managedTour(inserted);
  }

  requireRevision(expectedRevision);
  const current = db.prepare(`
    SELECT ${tourColumns} FROM catalog_tours WHERE slug = ? AND revision = ?
  `).get(slug, expectedRevision) as TourRow | undefined;
  if (!current) throw new CatalogError("Тур уже изменён. Обновите страницу и повторите действие.");
  const serialized = JSON.stringify(readTour(fields, slug, publish, JSON.parse(current.draft) as Tour));
  const saved = db.prepare(`
    UPDATE catalog_tours SET draft = ?, published = ?, published_revision = ?,
      revision = revision + 1, updated_at = ?
    WHERE slug = ? AND revision = ? RETURNING ${tourColumns}
  `).get(serialized, publish ? serialized : current.published, publish ? expectedRevision + 1 : current.published_revision,
    now, slug, expectedRevision) as TourRow | undefined;
  if (!saved) throw new CatalogError("Тур уже изменён. Обновите страницу и повторите действие.");
  return managedTour(saved);
}

export function unpublishManagedTour(slug: string, expectedRevision: number): ManagedTour {
  requireRevision(expectedRevision);
  const saved = ensureCatalog().prepare(`
    UPDATE catalog_tours SET published = NULL, published_revision = NULL,
      revision = revision + 1, updated_at = ?
    WHERE slug = ? AND revision = ? RETURNING ${tourColumns}
  `).get(new Date().toISOString(), slug, expectedRevision) as TourRow | undefined;
  if (!saved) throw new CatalogError("Тур уже изменён. Обновите страницу и повторите действие.");
  return managedTour(saved);
}

function siteSettings(row: SettingsRow): SiteSettings {
  return { ...(JSON.parse(row.content) as SettingsContent), revision: row.revision };
}

export function getSiteSettings(): SiteSettings {
  const row = ensureCatalog().prepare("SELECT content, revision FROM site_settings WHERE id = 1").get() as SettingsRow;
  return siteSettings(row);
}

export function saveSiteSettings(input: unknown, expectedRevision: number): SiteSettings {
  requireRevision(expectedRevision);
  const data = asRecord(input, "Настройки");
  const required = { required: true };
  const email = text(data.email, "Электронная почта", 254);
  if (email && !emailPattern.test(email)) throw new CatalogError("Укажите корректный адрес электронной почты.");
  const phone = text(data.phone, "Телефон", 48);
  if (phone) {
    const digits = phone.replace(/\D/g, "").length;
    if (!phonePattern.test(phone) || digits < 7 || digits > 15) throw new CatalogError("Укажите корректный номер телефона.");
  }
  if (typeof data.demo !== "boolean") throw new CatalogError("Укажите режим работы каталога.");
  const content: SettingsContent = {
    name: text(data.name, "Название сайта", 70, required),
    headline: text(data.headline, "Заголовок главной", 120, required),
    tagline: text(data.tagline, "Подзаголовок главной", 240, required),
    about: text(data.about, "О нас", 6000, { multiline: true }),
    email,
    phone,
    demo: data.demo,
  };
  const row = ensureCatalog().prepare(`
    UPDATE site_settings SET content = ?, revision = revision + 1
    WHERE id = 1 AND revision = ? RETURNING content, revision
  `).get(JSON.stringify(content), expectedRevision) as SettingsRow | undefined;
  if (!row) throw new CatalogError("Настройки уже изменены. Обновите страницу и повторите действие.");
  return siteSettings(row);
}
