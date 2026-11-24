"use client";

import { ArrowRight, CalendarDays, ChevronDown, Clock3, Heart, MapPin, Search, Star, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { canDepart, formatMoney, getUpcomingDepartures } from "../lib/tours";
import type { Tour } from "../lib/tours";
import { FavoriteButton, useFavorites } from "./favorites";

type Filters = { region: string; date: string; people?: number };

const initialFilters: Filters = { region: "", date: "" };
const ratingFormat = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1 });
const categoryOrder = new Intl.Collator("ru-RU");
const peoplePlural = new Intl.PluralRules("ru-RU");

function dayLabel(days: number) {
  if (days % 100 >= 11 && days % 100 <= 14) return "дней";
  if (days % 10 === 1) return "день";
  if (days % 10 >= 2 && days % 10 <= 4) return "дня";
  return "дней";
}

function formatPeople(people: number) {
  return `${people} ${peoplePlural.select(people) === "few" ? "человека" : "человек"}`;
}

function readFilters(params: Pick<URLSearchParams, "get">, regions: string[], today: string, groupSizes: number[]): Filters {
  const rawRegion = params.get("region") ?? "";
  const region = regions.includes(rawRegion) ? rawRegion : "";
  const rawDate = params.get("date") ?? "";
  const calendarDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate >= today ? new Date(`${rawDate}T00:00:00Z`) : null;
  const date = calendarDate && Number.isFinite(calendarDate.getTime()) && calendarDate.toISOString().slice(0, 10) === rawDate ? rawDate : "";
  const rawPeople = params.get("people");
  const people = Number(rawPeople);
  const hasGroupSize = rawPeople === String(people) && groupSizes.includes(people);

  return { region, date, people: hasGroupSize ? people : undefined };
}

function filterQuery(filters: Filters, category = "") {
  const query = new URLSearchParams();
  if (category) query.set("category", category);
  if (filters.region) query.set("region", filters.region);
  if (filters.date) query.set("date", filters.date);
  if (filters.people) query.set("people", String(filters.people));
  return query.size ? `?${query}` : "";
}

function TourCard({ tour, search, eager, demo, hasDepartures, onRemove }: {
  tour: Tour; search: string; eager: boolean; demo: boolean; hasDepartures: boolean; onRemove?: () => void;
}) {
  const titleId = useId();
  const durations = [...new Set(tour.options.map((option) => option.days))].sort((a, b) => a - b);
  const longest = durations[durations.length - 1];
  const consecutive = durations.length > 1 && durations.every((days, index) => days === durations[0] + index);
  const durationLabel = consecutive ? `${durations[0]}–${longest}` : durations.join(", ");
  const lowestPrice = Math.min(...tour.options.map((option) => option.pricePerPerson));
  const ratingLabel = demo ? "Пример оценки" : "Оценка";

  return (
    <article className="tour-card">
      <Link href={`/tours/${tour.slug}${search}`} className="tour-card__link">
        <div className="tour-card__image">
          <Image src={tour.image} alt="" fill sizes="(max-width: 599px) 94vw, (max-width: 960px) 48vw, 32vw" unoptimized={tour.image.startsWith("/media/")} loading={eager ? "eager" : "lazy"} />
        </div>
        <div className="tour-card__body">
          <div className="tour-card__meta">
            <span>{tour.region}</span>
            {tour.reviewCount > 0 && (
              <span className="tour-card__rating" role="img" title={ratingLabel} aria-label={`${ratingLabel} ${ratingFormat.format(tour.rating)} из 5. Отзывов ${tour.reviewCount}`}>
                <Star size={17} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
                <span>{ratingFormat.format(tour.rating)} ({tour.reviewCount})</span>
              </span>
            )}
          </div>
          <h3 id={titleId}>{tour.title}</h3>
          {!hasDepartures && <p className="tour-card__availability">Ближайших выездов пока нет</p>}
          <div className="tour-card__footer">
            <span className="tour-card__duration">
              <Clock3 size={16} aria-hidden="true" />{durationLabel} {dayLabel(longest)}
            </span>
            <span className="tour-card__price">
              <strong>от {formatMoney(lowestPrice)}</strong>
              <small>за человека</small>
            </span>
          </div>
        </div>
      </Link>
      <FavoriteButton slug={tour.slug} className="tour-card__favorite" describedBy={titleId} onRemove={onRemove} />
    </article>
  );
}

function Cards({ tours, today, demo, search = "", onRemove }: {
  tours: Tour[]; today: string; demo: boolean; search?: string; onRemove?: () => void;
}) {
  return (
    <div className="tour-grid">
      {tours.map((tour, index) => (
        <TourCard key={tour.slug} tour={tour} search={search} eager={index === 0} demo={demo}
          hasDepartures={getUpcomingDepartures(tour, today).length > 0} onRemove={onRemove} />
      ))}
    </div>
  );
}

function CatalogSearch({ initial, regions, today, groupSizes, category, onSearch }: {
  initial: Filters; regions: string[]; today: string; groupSizes: number[]; category: string; onSearch: (filters: Filters) => void;
}) {
  const [filters, setFilters] = useState(initial);

  function findTours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(filters);
  }

  return (
    <form className="catalog-search" aria-label="Поиск туров" action="/#tours" method="get" onSubmit={findTours}>
      <label className="catalog-search__field">
        <MapPin size={30} strokeWidth={1.85} aria-hidden="true" />
        <span className="catalog-search__text">
          <span className="catalog-search__label">Куда</span>
          <span className="catalog-search__select">
            <select name="region" value={filters.region} onChange={(event) => setFilters({ ...filters, region: event.target.value })}>
              <option value="">Все направления</option>
              {regions.map((region) => <option key={region} value={region}>{region}</option>)}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </span>
        </span>
      </label>
      <label className="catalog-search__field">
        <CalendarDays size={30} strokeWidth={1.85} aria-hidden="true" />
        <span className="catalog-search__text">
          <span className="catalog-search__label">Даты</span>
          <span className="catalog-search__date">
            {!filters.date && <span aria-hidden="true" className="catalog-search__placeholder">Любые даты</span>}
            <input className={filters.date ? "" : "is-empty"} type="date" name="date" min={today} value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} />
          </span>
        </span>
      </label>
      <label className="catalog-search__field">
        <UsersRound size={31} strokeWidth={1.85} aria-hidden="true" />
        <span className="catalog-search__text">
          <span className="catalog-search__label">Участники</span>
          <span className="catalog-search__select">
            <select name="people" value={filters.people ?? ""} onChange={(event) => {
              setFilters({ ...filters, people: Number(event.target.value) || undefined });
            }}>
              <option value="">Любое число</option>
              {groupSizes.map((people) => <option key={people} value={people}>{formatPeople(people)}</option>)}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </span>
        </span>
      </label>
      <button className="button catalog-search__submit" type="submit"><Search size={24} aria-hidden="true" />Найти тур</button>
      {category && <input type="hidden" name="category" value={category} />}
    </form>
  );
}

export function Catalog({ tours, today, headline, tagline, demo }: {
  tours: Tour[]; today: string; headline: string; tagline: string; demo: boolean;
}) {
  const params = useSearchParams();
  const heading = useRef<HTMLHeadingElement>(null);
  const regions = [...new Set(tours.map((tour) => tour.region))];
  const categories = [...new Set(tours.map((tour) => tour.category).filter(Boolean))].sort(categoryOrder.compare);
  const requestedCategory = params.get("category") ?? "";
  const category = categories.includes(requestedCategory) ? requestedCategory : "";
  const maxGroup = tours.reduce((max, tour) => Math.max(max, tour.groupLimit), 0);
  const groupSizes = Array.from({ length: maxGroup }, (_, index) => index + 1);
  const applied = readFilters(params, regions, today, groupSizes);
  const search = filterQuery(applied);
  const displayed = tours.filter((tour) => (
    (!category || tour.category === category) &&
    (!applied.region || tour.region === applied.region) &&
    (!applied.people || applied.people <= tour.groupLimit) &&
    (!applied.date || canDepart(tour, applied.date, today))
  ));

  function showResults(query: string) {
    const target = `/${query}#tours`;
    if (window.location.search + window.location.hash !== `${query}#tours`) {
      window.history.pushState(null, "", target);
    }
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start" });
  }

  return (
    <>
      <section className="catalog-hero" aria-labelledby="home-heading">
        <Image src="/tours/hero.webp" alt="" fill sizes="100vw" preload />
        <div className="catalog-hero__shade" />
        <div className="shell catalog-hero__content">
          <h1 id="home-heading">{headline === "Откройте Кыргызстан" ? <>Откройте<br />Кыргызстан</> : headline}</h1>
          <p>{tagline}</p>
        </div>
      </section>

      {tours.length > 0 && (
        <CatalogSearch key={search} initial={applied} regions={regions} today={today} groupSizes={groupSizes}
          category={category} onSearch={(filters) => showResults(filterQuery(filters, category))} />
      )}

      <section className="shell catalog-section" id="tours" aria-labelledby="catalog-title">
        <div className="catalog-section__header">
          <h2 id="catalog-title" tabIndex={-1} ref={heading}>Каталог туров</h2>
          {search && (
            <button className="catalog-section__reset" type="button" onClick={() => showResults(filterQuery(initialFilters, category))}>
              Сбросить поиск
            </button>
          )}
        </div>
        {categories.length > 1 && (
          <nav className="catalog-categories" aria-label="Категории туров">
            {["", ...categories].map((name) => (
              <Link key={name} href={`/${filterQuery(applied, name)}#tours`} prefetch={false}
                aria-current={category === name ? "true" : undefined}>
                {name || "Все категории"}
              </Link>
            ))}
          </nav>
        )}
        {(search || category) && <p className="catalog-section__result" role="status">Туров найдено — {displayed.length}</p>}
        {displayed.length ? <Cards tours={displayed} today={today} demo={demo} search={filterQuery(applied, category)} /> : (
          <div className="catalog-empty">
            <Search size={32} aria-hidden="true" />
            <h3>{tours.length ? "Туры не найдены" : "Туры скоро появятся"}</h3>
            {tours.length > 0 && <p>Попробуйте другую категорию или измените параметры поиска.</p>}
          </div>
        )}
      </section>
    </>
  );
}

export function FavoritesCatalog({ tours, today, demo }: { tours: Tour[]; today: string; demo: boolean }) {
  const favorites = useFavorites();
  const heading = useRef<HTMLHeadingElement>(null);
  const selected = tours.filter((tour) => favorites.includes(tour.slug));

  return (
    <section className="shell catalog-section catalog-section--favorites" aria-labelledby="favorites-title">
      <div className="catalog-section__header">
        <h1 id="favorites-title" ref={heading} tabIndex={-1}>Избранные туры</h1>
      </div>
      {selected.length ? <Cards tours={selected} today={today} demo={demo} onRemove={() => heading.current?.focus()} /> : (
        <div className="catalog-empty">
          <Heart size={34} aria-hidden="true" />
          <h2>У вас пока нет избранных туров</h2>
          <p>Нажмите на сердечко рядом с понравившимся туром, чтобы сохранить его здесь.</p>
          <Link href="/#tours" className="button">Посмотреть туры<ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
      )}
    </section>
  );
}
