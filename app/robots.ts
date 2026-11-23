import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getSiteSettings } from "@/lib/catalog-store";
import { publicSiteUrl } from "@/lib/site";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const site = publicSiteUrl(getSiteSettings().demo);

  if (!site) return { rules: { userAgent: "*", disallow: "/" } };

  return {
    rules: { userAgent: "*", disallow: ["/admin", "/api/", "/favorites", "/tours/*/book"] },
    sitemap: new URL("/sitemap.xml", site).href,
  };
}
