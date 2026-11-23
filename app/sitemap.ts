import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getSiteSettings, listPublishedTours } from "@/lib/catalog-store";
import { publicSiteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const site = publicSiteUrl(getSiteSettings().demo);
  if (!site) return [];

  const routes = ["/", "/how-it-works", "/about", "/contacts", ...listPublishedTours().map((tour) => `/tours/${tour.slug}`)];
  return routes.map((route) => ({ url: new URL(route, site).href }));
}
