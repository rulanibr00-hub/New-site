"use client";

import { ExternalLink, Navigation } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { routeTrackDistanceKm, type LocatedTourRoutePoint, type TourRouteTrack } from "@/lib/tours";
import { navigationLink, RouteLeaflet } from "./route-leaflet";

type TourRouteMapProps = {
  points: LocatedTourRoutePoint[];
  isExample: boolean;
  track?: TourRouteTrack;
};

const kilometers = new Intl.NumberFormat("ru-RU", { style: "unit", unit: "kilometer", maximumFractionDigits: 1 });
const meters = new Intl.NumberFormat("ru-RU", { style: "unit", unit: "meter", maximumFractionDigits: 0 });

export function TourRouteMap({ points, isExample, track }: TourRouteMapProps) {
  const titleId = useId();
  const stopDetailsId = useId();
  const indexedPoints = useMemo(() => points.map((point, index) => ({ ...point, index })), [points]);
  const distance = useMemo(() => track && routeTrackDistanceKm(track), [track]);
  const [selected, setSelected] = useState<number>();
  const meeting = indexedPoints[0];
  const selectedPoint = selected === undefined ? undefined : indexedPoints[selected];
  const selectedStop = selectedPoint?.index === 0 ? undefined : selectedPoint;
  if (!meeting && !track?.length) return null;

  const distanceLabel = distance === undefined ? undefined
    : distance >= 1 ? kilometers.format(distance)
    : meters.format(distance * 1000);
  const mapLabel = isExample ? "Пример маршрута"
    : distanceLabel ? `GPS-трек · ${distanceLabel}`
    : "Схема маршрута";

  function selectStop(index: number) {
    setSelected((current) => current === index ? undefined : index);
  }

  return (
    <section className="tour-route-map" aria-labelledby={titleId}>
      <div className="tour-route-map__heading">
        <h2 id={titleId}>Карта маршрута</h2>
        <span>{mapLabel}</span>
      </div>
      <RouteLeaflet points={indexedPoints} track={track} meetingIndex={meeting?.index} selectedIndex={selectedPoint?.index}
        showReset allowPageScroll onSelect={selectStop} />
      {meeting && (
        <div className="tour-route-map__meeting">
          <div className="tour-route-map__meeting-place">
            <button type="button" className="tour-route-map__select tour-route-map__meeting-select"
              aria-pressed={selectedPoint?.index === 0} onClick={() => selectStop(0)}>
              <span className="tour-route-map__number" aria-hidden="true">1</span>
              <span>
                <span className="tour-route-map__meeting-label">Место встречи</span>
                <strong>{meeting.title}</strong>
              </span>
            </button>
            {meeting.note && <p className="tour-route-map__note">{meeting.note}</p>}
          </div>
          <a className="button tour-route-map__meeting-directions" href={navigationLink(meeting)}
            target="_blank" rel="noopener noreferrer">
            <Navigation size={16} aria-hidden="true" /> Как добраться до места встречи
          </a>
        </div>
      )}
      {indexedPoints.length > 1 && (
        <>
          <div id={stopDetailsId} aria-live="polite">
            {selectedStop && (
              <div className="tour-route-map__details">
                <div>
                  <strong>{selectedStop.title}</strong>
                  {selectedStop.note && <p className="tour-route-map__note">{selectedStop.note}</p>}
                </div>
                <a className="tour-route-map__directions" href={navigationLink(selectedStop)} target="_blank" rel="noopener noreferrer"
                  aria-label={`Открыть в навигаторе — ${selectedStop.title}`}>
                  <ExternalLink size={16} aria-hidden="true" /> Открыть в навигаторе
                </a>
              </div>
            )}
          </div>
          <ol className="tour-route-map__stops" start={2} aria-label="Остановки после места встречи">
            {indexedPoints.slice(1).map((point) => (
              <li key={point.index}>
                <button type="button" className="tour-route-map__select" aria-pressed={point.index === selectedPoint?.index}
                  aria-controls={stopDetailsId} onClick={() => selectStop(point.index)}>
                  <span className="tour-route-map__number" aria-hidden="true">{point.index + 1}</span>
                  <span>{point.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
