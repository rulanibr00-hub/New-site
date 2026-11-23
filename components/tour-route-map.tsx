"use client";

import { ExternalLink } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { LocatedTourRoutePoint } from "@/lib/tours";
import { navigationLink, RouteLeaflet } from "./route-leaflet";

export function TourRouteMap({ points, isExample }: { points: LocatedTourRoutePoint[]; isExample: boolean }) {
  const titleId = useId();
  const indexedPoints = useMemo(() => points.map((point, index) => ({ ...point, index })), [points]);
  const [selected, setSelected] = useState<number | undefined>(0);
  if (!points.length) return null;

  return (
    <section className="tour-route-map" aria-labelledby={titleId}>
      <div className="tour-route-map__heading">
        <h2 id={titleId}>Карта маршрута</h2>
        <span>{isExample ? "Пример маршрута" : "Схема маршрута"}</span>
      </div>
      <RouteLeaflet points={indexedPoints} selectedIndex={selected} onSelect={setSelected}
        onPopupClose={(index) => setSelected((current) => current === index ? undefined : current)} />
      <ol className="tour-route-map__stops" aria-label="Остановки маршрута">
        {indexedPoints.map((point) => (
          <li key={point.index} className="tour-route-map__stop">
            <button
              type="button"
              className="tour-route-map__select"
              aria-pressed={point.index === selected}
              onClick={() => setSelected(point.index)}
            >
              <span className="tour-route-map__number" aria-hidden="true">{point.index + 1}</span>
              <span>{point.title}</span>
            </button>
            <a
              className="tour-route-map__directions"
              aria-label={`Открыть в навигаторе: ${point.title}`}
              href={navigationLink(point)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={16} aria-hidden="true" />
            </a>
            {point.note && <p className="tour-route-map__note">{point.note}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
