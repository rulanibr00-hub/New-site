"use client";

import { Heart } from "lucide-react";
import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

const storageKey = "too-tury:favorites";
const emptySnapshot = "[]";
let localSnapshot = emptySnapshot;
let preferMemory = false;
const FavoritesContext = createContext<string[]>([]);

function getStoredFavorites() {
  if (preferMemory) return localSnapshot;
  try {
    return window.localStorage.getItem(storageKey) ?? emptySnapshot;
  } catch {
    return localSnapshot;
  }
}

function getInitialFavorites() {
  return emptySnapshot;
}

function subscribe(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === storageKey || event.key === null) onChange();
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(storageKey, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(storageKey, onChange);
  };
}

function readIds(snapshot: string): string[] {
  try {
    const value: unknown = JSON.parse(snapshot);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getStoredFavorites, getInitialFavorites);
  const favorites = useMemo(() => readIds(snapshot), [snapshot]);

  return <FavoritesContext.Provider value={favorites}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  return useContext(FavoritesContext);
}

export function FavoriteButton({ slug, className = "", describedBy, onRemove }: { slug: string; className?: string; describedBy?: string; onRemove?: () => void }) {
  const selected = useFavorites().includes(slug);
  const label = selected ? "Убрать из избранного" : "Добавить в избранное";

  function toggleFavorite() {
    const favorites = readIds(getStoredFavorites());
    const removing = favorites.includes(slug);
    const nextFavorites = removing ? favorites.filter((id) => id !== slug) : [...favorites, slug];
    localSnapshot = JSON.stringify(nextFavorites);

    try {
      window.localStorage.setItem(storageKey, localSnapshot);
    } catch {
      preferMemory = true;
    }
    if (removing) onRemove?.();
    window.dispatchEvent(new Event(storageKey));
  }

  return (
    <button type="button" className={`favorite-button ${className}`} aria-pressed={selected} aria-label={label} aria-describedby={describedBy} title={label} onClick={toggleFavorite}>
      <Heart size={23} strokeWidth={1.9} fill={selected ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}
