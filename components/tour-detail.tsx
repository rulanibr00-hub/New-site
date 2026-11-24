'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Clock3,
  Images, MapPin, Star, UsersRound, X,
} from 'lucide-react';
import { formatMoney, type getPublicTourRoute, type Tour } from '../lib/tours';
import { FavoriteButton } from './favorites';
import { TourRouteMap } from './tour-route-map';

type PublicTourRoute = ReturnType<typeof getPublicTourRoute>;

const tabs = [
  { id: 'route', label: 'Маршрут' },
  { id: 'included', label: 'Что включено' },
] as const;

const ratingFormat = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function plural(count: number, forms: [string, string, string]) {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return forms[2];
  if (lastDigit === 1) return forms[0];
  return lastDigit >= 2 && lastDigit <= 4 ? forms[1] : forms[2];
}

function durationLabel(tour: Tour) {
  const durations = tour.options.map(({ days }) => days);
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const unit = plural(max, ['день', 'дня', 'дней']);

  return min === max ? `${min} ${unit}` : `${min}–${max} ${unit}`;
}

function TourGallery({ tour }: { tour: Tour }) {
  const photos = [...new Set([tour.image, ...tour.gallery])];
  const [current, setCurrent] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  function open(index: number, button: HTMLButtonElement) {
    setCurrent(index);
    opener.current = button;
    if (dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      closeButton.current?.focus({ preventScroll: true });
    }
  }

  function step(direction: number) {
    setCurrent((index) => (index + direction + photos.length) % photos.length);
  }

  function handleKeys(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'Tab') {
      const controls = event.currentTarget.querySelectorAll('button');
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.target === (event.shiftKey ? first : last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
      return;
    }
    if (photos.length > 1 && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      step(event.key === 'ArrowLeft' ? -1 : 1);
    }
  }

  return (
    <>
      <div className="tour-gallery" data-count={Math.min(photos.length, 3)}>
        {photos.slice(0, 3).map((photo, index) => (
          <button
            aria-haspopup="dialog"
            aria-label={`Открыть фото ${index + 1} из ${photos.length}`}
            className="tour-gallery-tile"
            key={photo}
            onClick={(event) => open(index, event.currentTarget)}
            type="button"
          >
            <Image
              src={photo}
              alt=""
              fill
              unoptimized
              sizes={index === 0 ? '(max-width: 680px) 100vw, 65vw' : '32vw'}
              loading={index === 0 ? 'eager' : 'lazy'}
            />
          </button>
        ))}
        {photos.length > 1 && (
          <button aria-haspopup="dialog" className="tour-gallery-all" type="button" onClick={(event) => open(0, event.currentTarget)}>
            <Images aria-hidden="true" size={19} /> Все фото
          </button>
        )}
      </div>

      <dialog
        aria-labelledby="tour-gallery-title"
        className="tour-lightbox"
        ref={dialog}
        onKeyDown={handleKeys}
        onClose={() => {
          opener.current?.focus({ preventScroll: true });
          opener.current = null;
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="tour-lightbox-content">
          <div className="tour-lightbox-header">
            <h2 id="tour-gallery-title">{tour.title}</h2>
            <button ref={closeButton} type="button" onClick={() => dialog.current?.close()} aria-label="Закрыть галерею">
              <X aria-hidden="true" size={23} />
            </button>
          </div>
          <div className="tour-lightbox-photo">
            <Image src={photos[current]} alt={`${tour.title} · фото ${current + 1}`} fill unoptimized sizes="90vw" />
          </div>
          <div className="tour-lightbox-nav">
            {photos.length > 1 && (
              <button type="button" aria-label="Предыдущее фото" onClick={() => step(-1)}>
                <ChevronLeft aria-hidden="true" />
              </button>
            )}
            <span aria-live="polite">{current + 1} из {photos.length}</span>
            {photos.length > 1 && (
              <button type="button" aria-label="Следующее фото" onClick={() => step(1)}>
                <ChevronRight aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}

function TourSections({ tour, route }: { tour: Tour; route: PublicTourRoute }) {
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': next = (active - 1 + tabs.length) % tabs.length; break;
      case 'ArrowRight': next = (active + 1) % tabs.length; break;
      case 'Home': next = 0; break;
      case 'End': next = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    setActive(next);
    buttons.current[next]?.focus();
  }

  return (
    <div className="tour-sections">
      <div aria-label="Информация о туре" className="tour-tabs" onKeyDown={handleKeys} role="tablist">
        {tabs.map(({ id, label }, index) => (
          <button
            aria-controls="tour-section-panel"
            aria-selected={index === active}
            id={`tour-tab-${id}`}
            key={id}
            onClick={() => setActive(index)}
            ref={(button) => { buttons.current[index] = button; }}
            role="tab"
            tabIndex={index === active ? 0 : -1}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div aria-labelledby={`tour-tab-${tabs[active].id}`} id="tour-section-panel" role="tabpanel" tabIndex={0}>
        {tabs[active].id === 'route' && (
          <>
            <p className="tour-description" style={{ whiteSpace: 'pre-line' }}>{tour.description}</p>
            {(route.points.length > 0 || Boolean(route.track?.length)) && <TourRouteMap {...route} />}
            <h2>{tour.options.every(({ days }) => days === 1) ? 'Программа дня' : 'Программа поездки'}</h2>
            <ol className="tour-program">
              {tour.program.map(({ time, title, description }, index) => (
                <li key={`${time}-${title}-${index}`}>
                  <div className="tour-program-title"><strong>{time}</strong> <span>{title}</span></div>
                  {description && <p>{description}</p>}
                </li>
              ))}
            </ol>
          </>
        )}
        {tabs[active].id === 'included' && (
          <>
            <h2>В стоимости тура</h2>
            {tour.includes.length > 0 ? <ul className="tour-includes">
              {tour.includes.map((include) => <li key={include}><Check aria-hidden="true" size={20} /> {include}</li>)}
            </ul> : <p>Состав услуг уточнит организатор.</p>}
            <p>При оформлении можно выбрать доступный вариант поездки и увидеть его стоимость для всей группы.</p>
          </>
        )}
      </div>
    </div>
  );
}

export function TourDetail({ tour, demo, route, catalogHref, bookingHref }: {
  tour: Tour; demo: boolean; route: PublicTourRoute; catalogHref: string; bookingHref: string | null;
}) {
  const minPrice = Math.min(...tour.options.map(({ pricePerPerson }) => pricePerPerson));
  const hasGuide = tour.options.some(({ guidePerGroup }) => guidePerGroup !== null);

  return (
    <main className="shell tour-detail">
      <Link className="tour-back-link" href={catalogHref}><ArrowLeft aria-hidden="true" size={20} /> К каталогу</Link>
      <TourGallery tour={tour} />

      <div className="tour-detail-grid">
        <div className="tour-detail-heading">
          <p className="tour-region"><MapPin aria-hidden="true" size={21} /> {tour.region}</p>
          <h1>{tour.title}</h1>
          <div className="tour-meta">
            {tour.reviewCount > 0 && (
                <span title={demo ? 'Демонстрационная оценка' : undefined}>
                <Star aria-hidden="true" size={22} className="tour-rating-star" />
                {ratingFormat.format(tour.rating)} · {tour.reviewCount} {plural(tour.reviewCount, ['отзыв', 'отзыва', 'отзывов'])}
              </span>
            )}
            <span><Clock3 aria-hidden="true" size={21} /> {durationLabel(tour)}</span>
            <span>Выезд · {tour.departure}</span>
          </div>
        </div>

        <aside aria-label="Оформление тура" className="tour-booking-card">
          <div className="tour-price-row">
            <div>
              <p className="tour-price">от {formatMoney(minPrice)}</p>
              <p className="tour-price-unit">за человека</p>
            </div>
            <FavoriteButton slug={tour.slug} />
          </div>
          <div className="tour-booking-facts">
            <p><UsersRound aria-hidden="true" size={24} /> {hasGuide ? 'С гидом или без' : `Группа до ${tour.groupLimit} человек`}</p>
          </div>
          {bookingHref ? (
            <>
              <Link className="button tour-booking-link" href={bookingHref}>Оформить тур <ArrowRight aria-hidden="true" size={22} /></Link>
              <p className="tour-booking-note">Дата и состав группы при оформлении</p>
            </>
          ) : <p className="tour-booking-note">Сейчас нет доступных дат выезда.</p>}
        </aside>

        <TourSections tour={tour} route={route} />
      </div>
    </main>
  );
}
