"use client";

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, LeafletMouseEvent, Map as LeafletMap, Marker } from "leaflet";
import type { LocatedTourRoutePoint } from "@/lib/tours";
import "leaflet/dist/leaflet.css";
import "../app/route-map.css";

type RouteMapPoint = LocatedTourRoutePoint & { index: number };

type RouteLeafletProps = {
  points: readonly RouteMapPoint[];
  selectedIndex?: number;
  onSelect?: (index: number) => void;
  onPopupClose?: (index: number) => void;
  onPick?: (lat: number, lng: number) => void;
  showPopups?: boolean;
};

type MapRuntime = {
  leaflet: typeof import("leaflet");
  layers: LayerGroup;
  markers: Map<number, Marker>;
};

const tilesUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const tilesCredit = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const bishkek = { lat: 42.8746, lng: 74.5698 };
const routePane = "tour-route";

export function navigationLink({ lat, lng }: Pick<LocatedTourRoutePoint, "lat" | "lng">) {
  const params = new URLSearchParams({ api: "1", destination: `${lat},${lng}` });
  return `https://www.google.com/maps/dir/?${params}`;
}

function popupContent(point: RouteMapPoint) {
  const content = document.createElement("div");
  content.className = "route-leaflet__popup";

  const heading = document.createElement("strong");
  heading.textContent = point.title;
  content.append(heading);

  if (point.note) {
    const note = document.createElement("p");
    note.textContent = point.note;
    content.append(note);
  }

  const link = document.createElement("a");
  link.href = navigationLink(point);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Открыть в навигаторе";
  content.append(link);

  return content;
}

export function RouteLeaflet({ points, selectedIndex, onSelect, onPopupClose, onPick, showPopups = true }: RouteLeafletProps) {
  const canvas = useRef<HTMLDivElement>(null);
  const latestPoints = useRef(points);
  const handlers = useRef({ onSelect, onPopupClose, onPick });
  const [runtime, setRuntime] = useState<MapRuntime | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "tiles-failed" | "unavailable">("loading");

  useEffect(() => {
    latestPoints.current = points;
    handlers.current = { onSelect, onPopupClose, onPick };
  }, [points, onSelect, onPopupClose, onPick]);

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

      const instance = leaflet.map(element, { zoomControl: false, scrollWheelZoom: false, maxZoom: 19 });
      map = instance;
      const initialPoints = latestPoints.current;
      if (initialPoints.length === 1) {
        instance.setView(initialPoints[0], 14);
      } else if (initialPoints.length > 1) {
        const bounds = leaflet.latLngBounds(initialPoints.map(({ lat, lng }) => leaflet.latLng(lat, lng)));
        instance.fitBounds(bounds, { padding: [46, 49], maxZoom: 15 });
      } else {
        instance.setView(bishkek, 10);
      }
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
      setRuntime({ leaflet, layers: leaflet.layerGroup().addTo(instance), markers: new Map() });
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
  }, []);

  useEffect(() => {
    if (!runtime) return;
    const { leaflet, layers, markers } = runtime;
    layers.clearLayers();
    markers.clear();

    if (points.length > 1) {
      const coordinates = points.map(({ lat, lng }) => leaflet.latLng(lat, lng));
      leaflet.polyline(coordinates, {
        className: "route-leaflet__line-outline",
        color: "#fffefa",
        weight: 7,
        interactive: false,
        pane: routePane,
      }).addTo(layers);
      leaflet.polyline(coordinates, {
        className: "route-leaflet__line",
        color: "#0b4e37",
        weight: 3,
        dashArray: "7 7",
        interactive: false,
        pane: routePane,
      }).addTo(layers);
    }

    for (const point of points) {
      const number = document.createElement("span");
      number.textContent = String(point.index + 1);
      number.setAttribute("aria-hidden", "true");

      const marker = leaflet.marker(point, {
        title: point.title,
        bubblingMouseEvents: false,
        icon: leaflet.divIcon({
          className: "route-leaflet__pin",
          html: number,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
          popupAnchor: [0, -15],
        }),
      }).addTo(layers);

      marker.getElement()?.setAttribute("aria-label", `${point.index + 1}. ${point.title}`);
      marker.on("click", () => handlers.current.onSelect?.(point.index));
      if (showPopups) {
        marker.bindPopup(popupContent(point), {
          maxWidth: 244,
          minWidth: 144,
          autoPanPadding: [18, 18],
          keepInView: true,
        });
        marker.on("popupclose", () => handlers.current.onPopupClose?.(point.index));
      }
      markers.set(point.index, marker);
    }
  }, [points, runtime, showPopups]);

  useEffect(() => {
    if (!runtime) return;
    for (const [index, marker] of runtime.markers) {
      const selected = index === selectedIndex;
      marker.getElement()?.classList.toggle("is-selected", selected);
      marker.setZIndexOffset(selected ? 100 : 0);
      if (selected && marker.getPopup() && !marker.isPopupOpen()) marker.openPopup();
    }
  }, [points, runtime, selectedIndex]);

  return (
    <div className="route-leaflet" data-map-status={status} data-picking={onPick ? "true" : undefined}>
      <div className="route-leaflet__canvas" ref={canvas} role="region" aria-label="Интерактивная карта маршрута" />
      {status !== "ready" && (
        <p className="route-leaflet__status" role="status">
          {status === "loading" ? "Загружаем карту…" : status === "tiles-failed" ? "Подложка карты недоступна." : "Карта недоступна."}
        </p>
      )}
    </div>
  );
}
