import { connection } from "next/server";
import { Catalog } from "../components/catalog";
import { getSiteSettings, listPublishedTours } from "../lib/catalog-store";
import { getToday } from "../lib/tours";

export default async function HomePage() {
  await connection();
  const { headline, tagline, demo } = getSiteSettings();
  return <main><Catalog tours={listPublishedTours()} today={getToday()} headline={headline} tagline={tagline} demo={demo} /></main>;
}
