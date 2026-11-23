import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Mountain } from "lucide-react";
import { FavoritesProvider } from "@/components/favorites";
import { SiteHeader } from "@/components/site-header";
import { getSiteSettings } from "@/lib/catalog-store";
import { publicSiteUrl } from "@/lib/site";
import "./globals.css";
import "./catalog.css";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const { name, tagline, demo } = getSiteSettings();
  return {
    title: { default: `${name} — туры по Кыргызстану`, template: `%s | ${name}` },
    description: tagline,
    robots: publicSiteUrl(demo) ? undefined : { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  const { name, demo } = getSiteSettings();
  return (
    <html lang="ru">
      <body>
        <FavoritesProvider>
          <a href="#page-content" className="skip-link">К содержанию</a>
          <SiteHeader siteName={name} />
          {demo && (
            <div className="demo-notice">
              <p className="shell">Демонстрационный каталог. Программы, цены, график выездов и оценки приведены для примера.</p>
            </div>
          )}
          <div id="page-content" className="page-content" tabIndex={-1}>
            {children}
          </div>
          <footer className="site-footer">
            <div className="shell footer-inner">
              <Link href="/" className="wordmark" aria-label={`${name}, главная`}>
                <Mountain aria-hidden="true" />
                <span>{name}</span>
              </Link>
              <nav aria-label="Информация">
                <Link href="/how-it-works">Как это работает</Link>
                <Link href="/about">О нас</Link>
                <Link href="/contacts">Контакты</Link>
              </nav>
            </div>
          </footer>
        </FavoritesProvider>
      </body>
    </html>
  );
}
