import { ArrowRight, Calculator, ListChecks, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { getPublishedTour, getSiteSettings } from "@/lib/catalog-store";
import { defaultAboutImage } from "@/lib/site";
import "./about.css";

export const metadata = { title: "О нас" };

const tripDetails = [
  {
    icon: MapPin,
    title: "Место встречи",
    description: "Место выезда указано в карточке тура. Если к туру добавлена карта, на ней можно открыть точку сбора в навигаторе.",
  },
  {
    icon: ListChecks,
    title: "Программа поездки",
    description: "Посмотрите этапы маршрута, длительность и список услуг, которые входят в стоимость.",
  },
  {
    icon: Calculator,
    title: "Цена за группу",
    description: "При оформлении сумма пересчитывается с учётом программы, числа участников и выбранного сопровождения.",
  },
];

export default async function About() {
  await connection();
  const { name, about, aboutImage, aboutImageCaption } = getSiteSettings();
  const cover = aboutImage || defaultAboutImage;
  const caption = aboutImageCaption || (aboutImage ? "" : "Сон-Куль, Нарынская область");
  const example = getPublishedTour("ala-archa", { includeRouteTrack: false });
  const paragraphs = about.trim().split(/\n\s*\n/).filter(Boolean);

  return (
    <main className="shell about-page">
      <section className="about-hero" aria-labelledby="about-heading">
        <div className="about-hero__copy">
          <h1 id="about-heading"><span>О проекте</span> «{name}»</h1>
          <p>Помогаем подобрать поездку по Кыргызстану, узнать детали маршрута и отправить заявку организатору.</p>
        </div>
        <figure className="about-hero__figure">
          <div className="about-hero__image">
            <Image
              src={cover}
              alt={aboutImage ? "" : "Юрты и лошади на берегу озера на закате"}
              fill
              sizes="(max-width: 780px) calc(100vw - 32px), (max-width: 1368px) 55vw, 735px"
              fetchPriority="high"
              unoptimized={cover.startsWith("/media/")}
            />
          </div>
          {caption && <figcaption>{caption}</figcaption>}
        </figure>
      </section>

      {paragraphs.length > 0 && (
        <section className="about-story" aria-labelledby="about-story-heading">
          <div className="about-story__copy">
            <h2 id="about-story-heading">Что мы делаем</h2>
            {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
          <div className="about-story__image">
            <Image
              src="/tours/ala-archa-trail.webp"
              alt="Каменистая тропа между елями на фоне заснеженных вершин"
              fill
              sizes="(max-width: 780px) calc(100vw - 32px), (max-width: 1368px) 40vw, 550px"
            />
          </div>
        </section>
      )}

      <section className="about-details" aria-labelledby="about-details-heading">
        <h2 id="about-details-heading">Что вы узнаете до заявки</h2>
        <ul className="about-details__list">
          {tripDetails.map(({ icon: Icon, title, description }) => (
            <li key={title} className="about-details__item">
              <span className="about-details__icon"><Icon aria-hidden="true" size={23} /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ul>
        {example && (
          <Link className="about-link" href={"/tours/" + example.slug}>
            Посмотреть на примере тура «{example.title}» <ArrowRight aria-hidden="true" size={18} />
          </Link>
        )}
      </section>

      <div className="about-actions">
        <p>После заявки организатор свяжется с вами, чтобы уточнить детали поездки.</p>
        <div className="about-actions__links">
          <Link className="button" href="/#tours">Выбрать тур <ArrowRight aria-hidden="true" size={18} /></Link>
          <Link className="about-link" href="/contacts">Связаться с нами</Link>
        </div>
      </div>
    </main>
  );
}
