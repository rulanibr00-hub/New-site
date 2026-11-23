"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { RouteLeaflet } from "@/components/route-leaflet";
import { parseRouteCoordinate, tourRouteLatitudeLimit, tourRoutePointLimit, type TourRoutePoint } from "@/lib/tours";
import "../app/admin/admin-route.css";

type EditablePoint = {
  key: number;
  title: string;
  note: string;
  lat: string;
  lng: string;
};

type Props = {
  initialPoints?: TourRoutePoint[];
  disabled: boolean;
};

export function AdminRouteEditor({ initialPoints, disabled }: Props) {
  const formId = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const nextKey = useRef(initialPoints?.length ?? 0);
  const [mapOpened, setMapOpened] = useState(false);
  const [edited, setEdited] = useState(false);
  const [selectedKey, setSelectedKey] = useState<number>();
  const [points, setPoints] = useState<EditablePoint[]>(() =>
    (initialPoints ?? []).map(({ title, note, lat, lng }, key) => ({
      key, title, note, lat: lat == null ? "" : String(lat), lng: lng == null ? "" : String(lng),
    })),
  );
  const mapPoints = useMemo(() => points.flatMap(({ title, note, lat, lng }, index) => {
    const latitude = parseRouteCoordinate(lat, tourRouteLatitudeLimit);
    const longitude = parseRouteCoordinate(lng, 180);
    if (typeof latitude !== "number" || typeof longitude !== "number") return [];
    return [{ index, title: title.trim() || `Точка ${index + 1}`, note, lat: latitude, lng: longitude }];
  }), [points]);
  const selectedIndex = points.findIndex((point) => point.key === selectedKey);
  const canAdd = !disabled && points.length < tourRoutePointLimit;
  const payload = initialPoints !== undefined || edited
    ? JSON.stringify(points.map(({ title, note, lat, lng }) => ({ title, note, lat, lng })))
    : "";

  function addPoint(lat = "", lng = "", focusTitle = false) {
    if (!canAdd) return;

    const key = nextKey.current++;
    setPoints((current) => current.length >= tourRoutePointLimit ? current : [...current, { key, title: "", note: "", lat, lng }]);
    setSelectedKey(key);
    setEdited(true);
    if (focusTitle) {
      requestAnimationFrame(() => document.getElementById(`${formId}-point-${key}`)?.focus());
    }
  }

  function updatePoint(key: number, field: Exclude<keyof EditablePoint, "key">, value: string) {
    setPoints((current) => current.map((point) => point.key === key ? { ...point, [field]: value } : point));
    setEdited(true);
  }

  function movePoint(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (disabled || destination < 0 || destination >= points.length) return;
    setPoints((current) => {
      const moved = [...current];
      [moved[index], moved[destination]] = [moved[destination], moved[index]];
      return moved;
    });
    setSelectedKey(points[index].key);
    setEdited(true);
  }

  function removePoint(key: number) {
    const index = points.findIndex((point) => point.key === key);
    const neighbor = points[index + 1] ?? points[index - 1];
    setPoints((current) => current.filter((point) => point.key !== key));
    setSelectedKey(neighbor?.key);
    setEdited(true);
    requestAnimationFrame(() => {
      if (neighbor) document.getElementById(`${formId}-point-${neighbor.key}`)?.focus();
      else addButton.current?.focus();
    });
  }

  return (
    <details className="admin-panel admin-route-editor" onToggle={(event) => {
      if (event.currentTarget.open) setMapOpened(true);
    }}>
      <summary>Карта маршрута</summary>
      <input type="hidden" name="routePoints" value={payload} />
      <div className="admin-route-content">
        <p className="admin-tour-note">Нажмите на карту, чтобы поставить отметку, или введите координаты вручную. Порядок точек определяет схему маршрута на сайте.</p>
        {mapOpened && (
          <div className="admin-route-map">
            <RouteLeaflet
              points={mapPoints}
              showPopups={false}
              selectedIndex={selectedIndex < 0 ? undefined : selectedIndex}
              onSelect={disabled ? undefined : (index) => setSelectedKey(points[index]?.key)}
              onPick={canAdd ? (lat, lng) => {
                const rounded = Number(lat.toFixed(6));
                const latitude = Math.max(-tourRouteLatitudeLimit, Math.min(tourRouteLatitudeLimit, rounded));
                addPoint(String(latitude), lng.toFixed(6));
              } : undefined}
            />
          </div>
        )}
        <div className="admin-route-actions">
          <button ref={addButton} type="button" className="admin-secondary" onClick={() => addPoint("", "", true)} disabled={!canAdd}>
            <Plus size={16} aria-hidden="true" /> Добавить точку вручную
          </button>
          <span className="admin-tour-note" role="status">Точек на карте {mapPoints.length} из {points.length}</span>
        </div>
        {points.map((point, index) => {
          const number = index + 1;
          const invalidLat = parseRouteCoordinate(point.lat, tourRouteLatitudeLimit) === undefined;
          const invalidLng = parseRouteCoordinate(point.lng, 180) === undefined;
          const coordinateHelp = `${formId}-coordinates-${point.key}`;

          return (
            <fieldset key={point.key} className="admin-tour-repeater admin-route-point" data-selected={selectedKey === point.key} disabled={disabled}>
              <legend>Точка {number}</legend>
              <div className="admin-grid">
                <label className="admin-field admin-tour-wide">
                  <span>Название</span>
                  <input id={`${formId}-point-${point.key}`} aria-label={`Название точки ${number}`} maxLength={120}
                    value={point.title} onChange={(event) => updatePoint(point.key, "title", event.target.value)} />
                </label>
                <label className="admin-field">
                  <span>Широта</span>
                  <input inputMode="decimal" aria-label={`Широта точки ${number}`} placeholder="42.875"
                    value={point.lat} maxLength={32} aria-invalid={invalidLat || undefined} aria-describedby={invalidLat ? coordinateHelp : undefined}
                    onChange={(event) => updatePoint(point.key, "lat", event.target.value)} />
                </label>
                <label className="admin-field">
                  <span>Долгота</span>
                  <input inputMode="decimal" aria-label={`Долгота точки ${number}`} placeholder="74.600"
                    value={point.lng} maxLength={32} aria-invalid={invalidLng || undefined} aria-describedby={invalidLng ? coordinateHelp : undefined}
                    onChange={(event) => updatePoint(point.key, "lng", event.target.value)} />
                </label>
                {(invalidLat || invalidLng) && (
                  <p className="admin-route-error admin-tour-wide" id={coordinateHelp}>Проверьте координаты. Дробную часть можно отделить точкой или запятой.</p>
                )}
                <label className="admin-field admin-tour-wide">
                  <span>Пояснение</span>
                  <textarea aria-label={`Пояснение точки ${number}`} value={point.note} rows={2} maxLength={300}
                    onChange={(event) => updatePoint(point.key, "note", event.target.value)} />
                </label>
              </div>
              <div className="admin-route-point-actions">
                <button type="button" className="admin-secondary" aria-label={`Поднять точку ${number}`}
                  onClick={() => movePoint(index, -1)} disabled={index === 0}>
                  <ArrowUp size={16} aria-hidden="true" /> Выше
                </button>
                <button type="button" className="admin-secondary" aria-label={`Опустить точку ${number}`}
                  onClick={() => movePoint(index, 1)} disabled={index === points.length - 1}>
                  <ArrowDown size={16} aria-hidden="true" /> Ниже
                </button>
                <button type="button" className="admin-secondary" aria-label={`Удалить точку ${number}`} onClick={() => removePoint(point.key)}>
                  <Trash2 size={16} aria-hidden="true" /> Удалить точку
                </button>
              </div>
            </fieldset>
          );
        })}
      </div>
    </details>
  );
}
