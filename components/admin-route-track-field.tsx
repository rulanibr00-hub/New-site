"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  normalizeTourRouteTrack,
  parseRouteCoordinate,
  routeTrackDistanceKm,
  tourRouteLatitudeLimit,
  tourRouteTrackPointLimit,
  type TourRouteTrack,
} from "@/lib/tours";

type Props = {
  track?: TourRouteTrack;
  onChange: (track: TourRouteTrack | undefined) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled: boolean;
};

const gpxFileByteLimit = 5 * 1024 * 1024;
const gpxNamespaces = new Set([null, "http://www.topografix.com/GPX/1/0", "http://www.topografix.com/GPX/1/1"]);
const distanceFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

function gpxChildren(parent: Element, name: string) {
  return Array.from(parent.children).filter((element) => element.localName === name && element.namespaceURI === parent.namespaceURI);
}

function readGpxTrack(source: string) {
  const formatError = "Проверьте файл GPX и выберите его заново.";
  if (source.includes("<!DOCTYPE")) throw new Error(formatError);
  const document = new DOMParser().parseFromString(source, "application/xml");
  const root = document.documentElement;
  if (root.localName !== "gpx" || !gpxNamespaces.has(root.namespaceURI)
    || document.getElementsByTagNameNS("*", "parsererror").length) {
    throw new Error(formatError);
  }

  const segments = gpxChildren(root, "trk").flatMap((track) => gpxChildren(track, "trkseg"));
  const track: TourRouteTrack = [];
  let pointCount = 0;
  for (const segment of segments) {
    const points = gpxChildren(segment, "trkpt");
    pointCount += points.length;
    if (pointCount > tourRouteTrackPointLimit) {
      throw new Error("В GPX больше 20 000 точек. Упростите трек и выберите файл заново.");
    }
    if (points.length < 2) continue;

    track.push(points.map((point) => {
      const lat = parseRouteCoordinate(point.getAttribute("lat"), tourRouteLatitudeLimit);
      const lng = parseRouteCoordinate(point.getAttribute("lon"), 180);
      if (typeof lat !== "number" || typeof lng !== "number") {
        throw new Error("В GPX есть точка с неверными координатами.");
      }
      return [lat, lng];
    }));
  }

  const normalized = normalizeTourRouteTrack(track);
  if (!normalized) throw new Error("В файле нет GPS-трека с двумя разными точками на одном участке.");
  return normalized;
}

export function AdminRouteTrackField({ track, onChange, onBusyChange, disabled }: Props) {
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const payload = useMemo(() => JSON.stringify(track ?? null), [track]);
  const distance = useMemo(() => track ? routeTrackDistanceKm(track) : null, [track]);

  async function importFile(field: HTMLInputElement) {
    const file = field.files?.[0];
    field.value = "";
    if (!file || disabled || inFlight.current) return;

    inFlight.current = true;
    setImporting(true);
    onBusyChange?.(true);
    setError("");
    try {
      if (!file.size || file.size > gpxFileByteLimit) throw new Error("Выберите файл GPX размером до 5 МБ.");
      onChange(readGpxTrack(await file.text()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось прочитать файл. Выберите GPX заново.");
    } finally {
      inFlight.current = false;
      setImporting(false);
      onBusyChange?.(false);
    }
  }

  return (
    <fieldset className="admin-tour-repeater" disabled={disabled || importing} aria-busy={importing}>
      <legend>GPS-трек</legend>
      <input type="hidden" name="routeTrack" value={payload} />
      <input ref={input} type="file" accept=".gpx,application/gpx+xml" hidden onChange={(event) => void importFile(event.currentTarget)} />
      <p className="admin-tour-note" id={hintId}>Загрузите GPX-файл от организатора, чтобы показать фактический путь на карте тура.</p>
      <div className="admin-actions">
        <button type="button" className="admin-secondary" aria-describedby={hintId} onClick={() => input.current?.click()}>
          {importing ? "Читаем GPX…" : track ? "Заменить GPX" : "Загрузить GPX"}
        </button>
        {track && <button type="button" className="admin-secondary" onClick={() => {
          setError("");
          onChange(undefined);
        }}>Убрать GPS-трек</button>}
      </div>
      {distance !== null && (
        <p className="admin-tour-note" role="status">
          GPS-трек загружен · {distance < 0.1 ? "менее 100 м" : `${distanceFormat.format(distance)} км`}
        </p>
      )}
      {error && <p className="admin-route-error" role="alert">{error}</p>}
    </fieldset>
  );
}
