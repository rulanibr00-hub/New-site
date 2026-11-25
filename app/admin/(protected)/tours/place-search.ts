"use server";

import { requireAdminAction } from "@/lib/admin-auth";
import { parseRouteCoordinate, tourRouteLatitudeLimit } from "@/lib/tours";

export type RoutePlace = { id: string; name: string; address: string; lat: number; lng: number };
export type RoutePlaceSearchResult = { ok: true; places: RoutePlace[] } | { ok: false; message: string };

const defaultSearchUrl = "https://nominatim.openstreetmap.org/search";
const maxResults = 5;
const maxResponseBytes = 128 * 1024;
const requestIntervalMs = 1_000;
const cacheTtlMs = 24 * 60 * 60 * 1_000;
const maxCacheEntries = 128;
const unavailable = "Поиск мест временно недоступен. Попробуйте позже или поставьте точку на карте.";
const busy = "Сервис ограничил частоту поиска. Повторите чуть позже.";

type SearchState = {
  cache: Map<string, { places: RoutePlace[]; expiresAt: number }>;
  nextRequestAt: number;
  inFlight: boolean;
};

const shared = globalThis as typeof globalThis & { tooTuryPlaceSearch?: SearchState };
const state = shared.tooTuryPlaceSearch ??= { cache: new Map(), nextRequestAt: 0, inFlight: false };

function providerUrl() {
  const url = new URL(process.env.TOO_TURY_GEOCODER_URL?.trim() || defaultSearchUrl);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash
    || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
    throw new Error("Invalid geocoding URL");
  }
  return url;
}

function singleLine(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function displayText(value: unknown, limit: number) {
  return typeof value === "string" ? singleLine(value.replace(/[\p{Cc}\p{Cf}]/gu, " ")).slice(0, limit).trim() : "";
}

function record(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function parsePlaces(payload: unknown): RoutePlace[] {
  if (!Array.isArray(payload)) throw new Error("Invalid geocoding response");

  const places: RoutePlace[] = [];
  const seen = new Set<string>();
  for (const value of payload) {
    const place = record(value);
    if (!place) continue;
    const country = record(place.address)?.country_code;
    if (country !== undefined && country !== "kg") continue;

    const rawId = place.place_id;
    const id = typeof rawId === "number" && Number.isSafeInteger(rawId) ? String(rawId) : displayText(rawId, 60);
    const lat = parseRouteCoordinate(place.lat, tourRouteLatitudeLimit);
    const lng = parseRouteCoordinate(place.lon, 180);
    if (!id || seen.has(id) || typeof lat !== "number" || typeof lng !== "number") continue;

    const address = displayText(place.display_name, 300);
    const name = displayText(place.name, 120) || displayText(address.split(",", 1)[0], 120);
    if (!name) continue;
    places.push({ id, name, address, lat, lng });
    seen.add(id);
    if (places.length === maxResults) break;
  }
  return places;
}

async function readProviderResponse(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Empty geocoding response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return JSON.parse(Buffer.concat(chunks, size).toString("utf8")) as unknown;
      size += value.byteLength;
      if (size > maxResponseBytes) {
        void reader.cancel().catch(() => {});
        throw new Error("Geocoding response exceeds the size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

function retryDelay(header: string | null) {
  if (!header) return 60_000;
  const milliseconds = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(milliseconds) ? Math.max(requestIntervalMs, milliseconds) : 60_000;
}

export async function searchRoutePlaces(query: string): Promise<RoutePlaceSearchResult> {
  await requireAdminAction();

  const search = typeof query === "string" ? singleLine(query) : "";
  if (search.length < 3 || search.length > 160 || /[\p{Cc}\p{Cf}]/u.test(search)) {
    return { ok: false, message: "Введите адрес или название места длиной от 3 до 160 символов." };
  }

  let url: URL;
  try {
    url = providerUrl();
  } catch {
    return { ok: false, message: unavailable };
  }

  const key = `${url.href}\n${search.normalize("NFC").toLowerCase()}`;
  const now = performance.now();
  const cached = state.cache.get(key);
  if (cached && cached.expiresAt > now) return { ok: true, places: cached.places };
  if (state.inFlight || now < state.nextRequestAt) return { ok: false, message: busy };

  state.inFlight = true;
  state.nextRequestAt = now + requestIntervalMs;
  try {
    url.search = new URLSearchParams({
      q: search,
      format: "jsonv2",
      addressdetails: "1",
      countrycodes: "kg",
      "accept-language": "ru,ky,en",
      limit: String(maxResults),
    }).toString();
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "Too-Tury/0.1 (+https://github.com/rulanibr00-hub/New-site)",
      },
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      if (response.status === 429) {
        state.nextRequestAt = performance.now() + retryDelay(response.headers.get("Retry-After"));
        return { ok: false, message: busy };
      }
      return { ok: false, message: unavailable };
    }

    const places = parsePlaces(await readProviderResponse(response));
    state.cache.delete(key);
    const oldestKey = state.cache.keys().next().value;
    if (state.cache.size >= maxCacheEntries && oldestKey !== undefined) state.cache.delete(oldestKey);
    state.cache.set(key, { places, expiresAt: performance.now() + cacheTtlMs });
    return { ok: true, places };
  } catch {
    return { ok: false, message: unavailable };
  } finally {
    state.inFlight = false;
  }
}
