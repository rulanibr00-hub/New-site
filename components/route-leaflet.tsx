"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LayerGroup, LeafletMouseEvent, Map as LeafletMap, Marker } from "leaflet";
import type { LocatedTourRoutePoint, TourRouteTrack } from "@/lib/tours";
import "leaflet/dist/leaflet.css";
import "../app/route-map.css";

type RouteMapPoint = LocatedTourRoutePoint & { index: number };

type RouteLeafletProps = {
  points: readonly RouteMapPoint[];
  track?: TourRouteTrack;
  selectedIndex?: number;
  meetingIndex?: number;
  onSelect?: (index: number) => void;
  onPick?: (lat: number, lng: number) => void;
  showReset?: boolean;
  allowPageScroll?: boolean;
};

type MapRuntime = {
  leaflet: typeof import("leaflet");
  map: LeafletMap;
  lines: LayerGroup;
  pins: LayerGroup;
  markers: Map<number, Marker>;
};

const tilesUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const tilesCredit = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const bishkek = { lat: 42.8746, lng: 74.5698 };
const routePane = "tour-route";
const routePadding = { paddingTopLeft: [44, 68] as [number, number], paddingBottomRight: [44, 48] as [number, number] };

export function navigationLink({ lat, lng }: Pick<LocatedTourRoutePoint, "lat" | "lng">) {
  const params = new URLSearchParams({ api: "1", destination: `${lat},${lng}` });
  return `https://www.google.com/maps/dir/?${params}`;
}

function fitRoute(
  map: LeafletMap,
  leaflet: MapRuntime["leaflet"],
  { points, track }: Pick<RouteLeafletProps, "points" | "track">,
) {
  const bounds = leaflet.latLngBounds(points.map(({ lat, lng }) => leaflet.latLng(lat, lng)));
  for (const segment of track ?? []) {
    for (const position of segment) bounds.extend(position);
  }
  if (!bounds.isValid()) {
    map.setView(bishkek, 10, { animate: false });
  } else if (bounds.getNorthWest().equals(bounds.getSouthEast())) {
    map.setView(bounds.getCenter(), 14, { animate: false });
  } else {
    map.fitBounds(bounds, { ...routePadding, maxZoom: 15, animate: false });
  }
}

export function RouteLeaflet({
  points, track, selectedIndex, meetingIndex, onSelect, onPick, showReset = false, allowPageScroll = false,
}: RouteLeafletProps) {
  const canvas = useRef<HTMLDivElement>(null);
  const geometry = useRef({ points, track });
  const handlers = useRef({ onSelect, onPick });
  const lastFitTrack = useRef(track);
  const [runtime, setRuntime] = useState<MapRuntime | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "tiles-failed" | "unavailable">("loading");
  const coordinates = useMemo<TourRouteTrack | undefined>(() => (
    track ?? (points.length > 1 ? [points.map(({ lat, lng }) => [lat, lng])] : undefined)
  ), [points, track]);

  useEffect(() => {
    geometry.current = { points, track };
    handlers.current = { onSelect, onPick };
  }, [points, track, onSelect, onPick]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;

    let map: LeafletMap | undefined;
    let observer: ResizeObserver | undefined;
    let cancelled = false;
    let tileTimeout: ReturnType<typeof setTimeout> | undefined;
    let loaded = 0;

    void import("leaflet").then((leaflet) => {
      if (cancelled) return;

      const touchScrolling = allowPageScroll && window.matchMedia("(pointer: coarse)").matches;
      const instance = leaflet.map(element, {
        zoomControl: false,
        zoomAnimation: false,
        scrollWheelZoom: false,
        dragging: !touchScrolling,
        maxZoom: 19,
      });
      map = instance;
      fitRoute(instance, leaflet, geometry.current);
      lastFitTrack.current = geometry.current.track;
      instance.createPane(routePane).style.zIndex = "410";
      instance.attributionControl.setPrefix(false);
      leaflet.control.zoom({
        position: "topright",
        zoomInTitle: "Приблизить карту",
        zoomOutTitle: "Отдалить карту",
      }).addTo(instance);

      const tiles = leaflet.tileLayer(tilesUrl, { attribution: tilesCredit, maxZoom: 19, noWrap: true });
      tiles.on("loading", () => {
        loaded = 0;
        clearTimeout(tileTimeout);
        tileTimeout = setTimeout(() => {
          if (!cancelled && !loaded) setStatus("tiles-failed");
        }, 6000);
      });
      tiles.on("tileload", () => {
        loaded += 1;
        if (!cancelled) setStatus("ready");
      });
      tiles.on("load", () => {
        clearTimeout(tileTimeout);
        if (!cancelled && !loaded) setStatus("tiles-failed");
      });
      tiles.addTo(instance);

      instance.on("click", (event: LeafletMouseEvent) => {
        const { lat, lng } = event.latlng.wrap();
        handlers.current.onPick?.(lat, lng);
      });

      observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
      observer.observe(element);
      setRuntime({
        leaflet, map: instance, markers: new Map(),
        lines: leaflet.layerGroup().addTo(instance), pins: leaflet.layerGroup().addTo(instance),
      });
    }).catch(() => {
      clearTimeout(tileTimeout);
      observer?.disconnect();
      map?.remove();
      map = undefined;
      if (!cancelled) setStatus("unavailable");
    });

    return () => {
      cancelled = true;
      clearTimeout(tileTimeout);
      observer?.disconnect();
      map?.remove();
    };
  }, [allowPageScroll]);

  useEffect(() => {
    if (!runtime || track === lastFitTrack.current) return;
    lastFitTrack.current = track;
    fitRoute(runtime.map, runtime.leaflet, geometry.current);
  }, [runtime, track]);

  useEffect(() => {
    if (!runtime) return;
    const { leaflet, lines } = runtime;
    lines.clearLayers();
    if (!coordinates) return;

    leaflet.polyline(coordinates, {
      className: "route-leaflet__line-outline",
      color: "#fffefa",
      weight: 7,
      interactive: false,
      pane: routePane,
    }).addTo(lines);
    leaflet.polyline(coordinates, {
      className: `route-leaflet__line route-leaflet__line--${track ? "track" : "schematic"}`,
      color: "#0b4e37",
      weight: 3,
      dashArray: track ? undefined : "7 7",
      interactive: false,
      pane: routePane,
    }).addTo(lines);
  }, [coordinates, runtime, track]);

  useEffect(() => {
    if (!runtime) return;
    const { leaflet, pins, markers } = runtime;
    pins.clearLayers();
    markers.clear();

    for (const point of points) {
      const number = document.createElement("span");
      number.textContent = String(point.index + 1);
      number.setAttribute("aria-hidden", "true");

      const marker = leaflet.marker(point, {
        title: point.title,
        bubblingMouseEvents: false,
        icon: leaflet.divIcon({
          className: point.index === meetingIndex ? "route-leaflet__pin is-meeting" : "route-leaflet__pin",
          html: number,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
      }).addTo(pins);

      const element = marker.getElement();
      const label = point.index === meetingIndex ? `Место встречи. ${point.title}` : point.title;
      element?.setAttribute("aria-label", `${point.index + 1}. ${label}`);
      element?.addEventListener("keydown", (event) => {
        if (event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        handlers.current.onSelect?.(point.index);
      });
      marker.on("click", () => handlers.current.onSelect?.(point.index));
      markers.set(point.index, marker);
    }
  }, [meetingIndex, points, runtime]);

  useEffect(() => {
    if (!runtime) return;
    for (const [index, marker] of runtime.markers) {
      const selected = index === selectedIndex;
      const element = marker.getElement();
      element?.classList.toggle("is-selected", selected);
      element?.setAttribute("aria-pressed", String(selected));
      marker.setZIndexOffset(selected ? 100 : 0);
      if (selected) runtime.map.panInside(marker.getLatLng(), { ...routePadding, animate: false });
    }
  }, [meetingIndex, points, runtime, selectedIndex, track]);

  return (
    <div className="route-leaflet" data-map-status={status} data-picking={onPick ? "true" : undefined}>
      <div className="route-leaflet__canvas" ref={canvas} role="region" aria-label="Интерактивная карта маршрута" />
      {runtime && showReset && (points.length > 0 || track) && (
        <button type="button" className="route-leaflet__reset" onClick={() => fitRoute(runtime.map, runtime.leaflet, geometry.current)}>
          Весь маршрут
        </button>
      )}
      {status !== "ready" && (
        <p className="route-leaflet__status" role="status">
          {status === "loading" ? "Загружаем карту…" : status === "tiles-failed" ? "Подложка карты недоступна." : "Карта недоступна."}
        </p>
      )}
    </div>
  );
}
