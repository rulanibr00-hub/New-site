import Link from "next/link";
import { connection } from "next/server";
import { getSiteSettings } from "@/lib/catalog-store";

export const metadata = { title: "О нас" };

export default async function About() {
  await connection();
  const { about } = getSiteSettings();
  return (
    <main className="shell info-page">
      <article>
        <h1>О нас</h1>
        {about.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => (
          <p className="about-text" key={index}>{paragraph}</p>
        ))}
        <Link className="button" href="/#tours">Посмотреть туры</Link>
      </article>
    </main>
  );
}
