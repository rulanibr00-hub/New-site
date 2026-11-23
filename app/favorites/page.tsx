import type { Metadata } from "next";
import { FavoritesCatalog } from "../../components/catalog";
import { connection } from "next/server";
import { getSiteSettings, listPublishedTours } from "../../lib/catalog-store";

export const metadata: Metadata = { title: "Избранные туры" };

export default async function FavoritesPage() {
  await connection();
  return <main><FavoritesCatalog tours={listPublishedTours()} demo={getSiteSettings().demo} /></main>;
}
