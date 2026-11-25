"use client";

import { useId, useRef, useState, useTransition } from "react";
import { searchRoutePlaces, type RoutePlace } from "@/app/admin/(protected)/tours/place-search";

type Props = {
  disabled: boolean;
  onSelect: (place: RoutePlace) => void;
};

type SearchResult = Awaited<ReturnType<typeof searchRoutePlaces>>;

export function AdminRoutePlaceSearch({ disabled, onSelect }: Props) {
  const inputId = useId();
  const queryVersion = useRef(0);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searching, startSearch] = useTransition();
  const canSearch = !disabled && !searching && query.trim().length >= 3;

  function changeQuery(value: string) {
    queryVersion.current += 1;
    setQuery(value);
    setResult(null);
  }

  function findPlaces() {
    if (!canSearch) return;

    const version = ++queryVersion.current;
    setResult(null);
    startSearch(async () => {
      let response: SearchResult;
      try {
        response = await searchRoutePlaces(query);
      } catch {
        response = { ok: false, message: "Не удалось выполнить поиск. Попробуйте ещё раз или поставьте точку на карте." };
      }
      if (version === queryVersion.current) setResult(response);
    });
  }

  return (
    <div className="admin-route-search">
      <div className="admin-route-search-controls">
        <label className="admin-field" htmlFor={inputId}>
          Адрес или название места
          <input id={inputId} type="search" placeholder="Площадь Ала-Тоо, Бишкек" autoComplete="off"
            maxLength={160} value={query} disabled={disabled}
            onChange={(event) => changeQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              findPlaces();
            }} />
        </label>
        <button type="button" className="admin-secondary" disabled={!canSearch} onClick={findPlaces}>Найти</button>
      </div>
      {searching && <p className="admin-tour-note" role="status">Ищем место…</p>}
      {result && !result.ok && <p className="admin-route-error" role="alert">{result.message}</p>}
      {result?.ok && result.places.length === 0 && (
        <p className="admin-tour-note" role="status">Место не найдено. Уточните название, добавьте населённый пункт или поставьте точку на карте.</p>
      )}
      {result?.ok && result.places.length > 0 && (
        <>
          <p className="admin-tour-note" role="status">Выберите место, чтобы добавить остановку.</p>
          <ul className="admin-route-search-results" aria-label="Найденные места">
            {result.places.map((place) => (
              <li key={place.id}>
                <button type="button" className="admin-secondary admin-route-search-option" disabled={disabled}
                  onClick={() => {
                    onSelect(place);
                    changeQuery("");
                  }}>
                  <span>{place.name}</span>
                  {place.address && place.address !== place.name && <small>{place.address}</small>}
                </button>
              </li>
            ))}
          </ul>
          <p className="admin-tour-note">
            <a className="admin-route-search-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
              © OpenStreetMap contributors
            </a>
          </p>
        </>
      )}
    </div>
  );
}
