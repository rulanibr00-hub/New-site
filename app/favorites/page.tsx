import type { Metadata } from "next";
import { FavoritesCatalog } from "../../components/catalog";
import { connection } from "next/server";
import { getSiteSettings, listPublishedTours } from "../../lib/catalog-store";
import { getToday } from "../../lib/tours";

export const metadata: Metadata = { title: "Избранные туры" };

export default async function FavoritesPage() {
  await connection();
  return <main><FavoritesCatalog tours={listPublishedTours()} today={getToday()} demo={getSiteSettings().demo} /></main>;
}
