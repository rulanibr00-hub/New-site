"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, Clock, MapPin, Minus, Plus, Users } from "lucide-react";
import { canDepart, formatMoney, getUpcomingDepartures, priceTour, type Tour } from "../lib/tours";

type BookingFormProps = {
  tour: Tour;
  demo: boolean;
  today: string;
  initialPeople: number;
  initialDate: string;
  tourHref: string;
};

type BookingField = "date" | "name" | "contact" | "parameters";
type BookingError = { message: string; field?: BookingField; refreshPrice?: boolean };

const weekdayNames = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const dateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "UTC" });
const shortDateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const dayPlural = new Intl.PluralRules("ru-RU");
const weekdaysInOrder = [1, 2, 3, 4, 5, 6, 0];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[\d\p{Zs}()-]+$/u;
const controlCharacters = /\p{Cc}/u;

function durationLabel(days: number) {
  const form = dayPlural.select(days);
  return `${days} ${form === "one" ? "день" : form === "few" ? "дня" : "дней"}`;
}

export function BookingForm({ tour, demo, today, initialPeople, initialDate, tourHref }: BookingFormProps) {
  const router = useRouter();
  const [optionId, setOptionId] = useState(tour.options[0].id);
  const [people, setPeople] = useState(initialPeople);
  const [date, setDate] = useState(initialDate);
  const [withGuide, setWithGuide] = useState(false);
  const [ready, setReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<BookingError | null>(null);
  const [receipt, setReceipt] = useState<{ id: string; total: number; date: string } | null>(null);
  const [isRefreshing, startPriceRefresh] = useTransition();
  const [reviewPrice, setReviewPrice] = useState(false);
  const requestIds = useRef(new Map<string, string | undefined>());
  const inFlight = useRef(false);
  const successHeading = useRef<HTMLHeadingElement>(null);
  const submissionError = useRef<HTMLDivElement>(null);
  const totalPrice = useRef<HTMLElement>(null);

  const option = tour.options.find((item) => item.id === optionId);
  const quote = option ? priceTour(tour, option.id, people, withGuide) : null;
  const hasValidDate = date !== "" && canDepart(tour, date, today);
  const hasInvalidDate = date !== "" && !hasValidDate;
  const departures = getUpcomingDepartures(tour, today);
  const hasDates = departures.length > 0;
  const availableDays = weekdaysInOrder.filter((day) => tour.weekdays.includes(day)).map((day) => weekdayNames[day]);
  const daysLabel = availableDays.length === 7 ? "Выезды каждый день" : `Выезды в ${availableDays.join(", ")}`;
  const period = [
    tour.startDate && `с ${dateFormat.format(new Date(tour.startDate))}`,
    tour.endDate && `по ${dateFormat.format(new Date(tour.endDate))}`,
  ].filter(Boolean).join(" ");
  const dateNote = period ? `${daysLabel} · ${period}` : daysLabel;
  const dateError = error?.field === "date" ? error.message : undefined;
  const nameError = error?.field === "name" ? error.message : undefined;
  const contactError = error?.field === "contact" ? error.message : undefined;
  const parameterError = error?.field === "parameters" ? error.message : undefined;
  const changedParameters = !option ? "Выберите доступную длительность."
    : people > tour.groupLimit ? `Уменьшите группу до ${tour.groupLimit} чел.`
    : withGuide && option.guidePerGroup === null ? "Для этого варианта доступна поездка без гида." : undefined;
  const summaryError = error && !error.field ? error : null;
  const busy = isSubmitting || isRefreshing;

  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (receipt) successHeading.current?.focus();
  }, [receipt]);

  useEffect(() => {
    if (!error) return;
    if (error.field) {
      document.getElementById(`booking-${error.field}`)?.focus();
    } else {
      submissionError.current?.focus();
    }
  }, [error]);

  useEffect(() => {
    if (reviewPrice) (totalPrice.current ?? document.getElementById("booking-parameters"))?.focus();
  }, [reviewPrice]);

  function clearFieldError(field: BookingField) {
    if (error?.field === field) setError(null);
  }

  function selectDate(value: string) {
    setDate(value);
    clearFieldError("date");
  }

  function refreshPrice() {
    startPriceRefresh(() => {
      router.refresh();
      setError(null);
      setReviewPrice(true);
    });
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || inFlight.current || isRefreshing || error?.refreshPrice || !hasDates) return;
    setReviewPrice(false);

    if (!hasValidDate) {
      setError({ field: "date", message: date ? `Выберите другую дату. ${dateNote}.` : "Укажите дату выезда." });
      return;
    }
    if (!option || !quote) {
      setError({ field: "parameters", message: changedParameters ?? "Проверьте параметры поездки." });
      return;
    }

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const contact = String(form.get("contact") ?? "").trim();
    const digitCount = contact.replace(/\D/g, "").length;
    if (name.length < 2 || controlCharacters.test(name)) {
      setError({ field: "name", message: "Укажите имя, хотя бы два символа." });
      return;
    }
    const validPhone = phonePattern.test(contact) && digitCount >= 7 && digitCount <= 15;
    if (controlCharacters.test(contact) || (!emailPattern.test(contact) && !validPhone)) {
      setError({ field: "contact", message: "Укажите номер телефона или электронную почту, например name@example.com." });
      return;
    }

    const data = {
      tourSlug: tour.slug,
      optionId: option.id,
      date,
      people,
      withGuide,
      name,
      contact,
      quotedTotal: quote.total,
    };
    const serialized = JSON.stringify(data);
    if (!requestIds.current.has(serialized)) {
      requestIds.current.set(serialized, globalThis.crypto?.randomUUID?.());
    }

    inFlight.current = true;
    setError(null);
    setIsSubmitting(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, requestId: requestIds.current.get(serialized) }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || typeof result?.id !== "string" || typeof result?.total !== "number") {
        const priceChanged = response.status === 409 && result?.code === "price_changed";
        const availabilityChanged = response.status === 409 && result?.code === "availability_changed";
        setError({
          message: priceChanged
            ? "Стоимость тура изменилась. Обновите расчёт и проверьте итоговую сумму."
            : typeof result?.error === "string" ? result.error : "Не удалось отправить заявку. Попробуйте ещё раз.",
          refreshPrice: priceChanged || availabilityChanged,
        });
        return;
      }

      setReceipt({ id: result.id, total: result.total, date: data.date });
    } catch {
      setError({ message: controller.signal.aborted
        ? "Сервер не ответил вовремя. Попробуйте отправить ту же заявку ещё раз."
        : "Не удалось соединиться с сервером. Попробуйте ещё раз." });
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      setIsSubmitting(false);
    }
  }

  if (receipt) {
    return (
      <div className="shell booking-shell">
        <div className="booking-success">
          <span className="booking-success-icon"><Check aria-hidden="true" size={28} /></span>
          <h1 ref={successHeading} tabIndex={-1}>Заявка отправлена</h1>
          <p>{demo ? "Заявка сохранена в демонстрационном режиме." : "Организатор свяжется с вами, чтобы подтвердить дату и наличие мест."}</p>
          <dl className="booking-receipt">
            <div><dt>Тур</dt><dd>{tour.title}</dd></div>
            <div><dt>Дата выезда</dt><dd>{dateFormat.format(new Date(receipt.date))}</dd></div>
            <div><dt>Стоимость за группу</dt><dd>{formatMoney(receipt.total)}</dd></div>
            <div><dt>Номер заявки</dt><dd>{receipt.id}</dd></div>
          </dl>
          <Link className="button booking-submit" href="/#tours">К каталогу <ArrowRight aria-hidden="true" size={18} /></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="shell booking-shell">
      <Link className="booking-back" href={tourHref}><ArrowLeft aria-hidden="true" size={18} /> К туру</Link>
      <h1 className="booking-heading">Оформление тура</h1>
      <div className="booking-grid">
        <form id="booking-form" method="post" noValidate aria-busy={busy} onSubmit={submitBooking} className="booking-fields">
          <noscript><p className="booking-error">Включите JavaScript, чтобы рассчитать стоимость и отправить заявку.</p></noscript>
          <fieldset className="booking-card booking-section" aria-labelledby="booking-parameters" disabled={busy}>
            <h2 id="booking-parameters" tabIndex={-1} className="booking-section-heading">Параметры поездки</h2>
            {(parameterError || changedParameters) && <p className="booking-error" role="alert">{parameterError ?? changedParameters}</p>}
            {hasDates && (
              <fieldset className="booking-departures">
                <legend>Ближайшие выезды</legend>
                <div className="booking-departure-grid">
                  {departures.map((departure) => {
                    const calendarDate = new Date(departure);
                    return (
                      <label className="booking-departure-option" key={departure}>
                        <input type="radio" name="departure-date-choice" value={departure}
                          aria-label={dateFormat.format(calendarDate)} checked={date === departure}
                          onChange={() => selectDate(departure)} />
                        <span>
                          <time dateTime={departure}>{shortDateFormat.format(calendarDate)}</time>
                          <small>{weekdayNames[calendarDate.getUTCDay()]}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
            <div className="booking-field-grid">
              <div className="booking-field">
                <label htmlFor="booking-date">Дата выезда</label>
                <input id="booking-date" name="date" type="date" min={departures[0]} max={tour.endDate} value={date} required disabled={!hasDates}
                  aria-invalid={Boolean(dateError) || hasInvalidDate || undefined} aria-describedby="booking-date-note"
                  onChange={(event) => selectDate(event.target.value)} />
                <small id="booking-date-note" className={dateError || hasInvalidDate ? "booking-field-error" : undefined} aria-live="polite">
                  {!hasDates ? "Сейчас нет доступных дат выезда." : dateError ?? (hasInvalidDate ? `Выберите другую дату. ${dateNote}.` : dateNote)}
                </small>
              </div>
              <label className="booking-field" htmlFor="booking-duration">
                Длительность
                <span className="booking-select-wrap">
                  <select id="booking-duration" name="optionId" value={option?.id ?? ""} onChange={(event) => {
                    const selection = tour.options.find((item) => item.id === event.target.value);
                    if (!selection) return;
                    setOptionId(selection.id);
                    if (selection.guidePerGroup === null) setWithGuide(false);
                    clearFieldError("parameters");
                  }}>
                    {!option && <option value="" disabled>Выберите длительность</option>}
                    {tour.options.map((item) => <option key={item.id} value={item.id}>{durationLabel(item.days)}</option>)}
                  </select>
                  <ChevronDown aria-hidden="true" size={18} />
                </span>
              </label>
            </div>
            <div className="booking-group">
              <span className="booking-field">Участники <small>До {tour.groupLimit} человек в группе</small></span>
              <div className="booking-stepper">
                <button type="button" aria-label="Убрать участника" disabled={people <= 1} onClick={() => {
                  setPeople((count) => Math.max(1, Math.min(tour.groupLimit, count - 1)));
                  clearFieldError("parameters");
                }}><Minus aria-hidden="true" size={16} /></button>
                <output aria-live="polite" aria-label="Число участников">{people}</output>
                <button type="button" aria-label="Добавить участника" disabled={people >= tour.groupLimit} onClick={() => {
                  setPeople((count) => Math.min(tour.groupLimit, count + 1));
                  clearFieldError("parameters");
                }}><Plus aria-hidden="true" size={16} /></button>
              </div>
            </div>
            <fieldset className="booking-guide">
              <legend>Сопровождение</legend>
              <div className="booking-guide-grid">
                <label className="booking-guide-option">
                  <input type="radio" name="withGuide" value="false" checked={!withGuide} onChange={() => {
                    setWithGuide(false);
                    clearFieldError("parameters");
                  }} />
                  <span>Без гида <small>Самостоятельная прогулка</small></span>
                </label>
                {option && option.guidePerGroup !== null && (
                  <label className="booking-guide-option">
                    <input type="radio" name="withGuide" value="true" checked={withGuide} onChange={() => {
                      setWithGuide(true);
                      clearFieldError("parameters");
                    }} />
                    <span>С гидом <small>+ {formatMoney(option.guidePerGroup)} за группу</small></span>
                  </label>
                )}
              </div>
            </fieldset>
            {quote && (
              <p className="booking-compact-total" aria-live="polite">
                Итого за группу <strong>{formatMoney(quote.total)}</strong>
              </p>
            )}
          </fieldset>

          <fieldset className="booking-card booking-section" aria-labelledby="booking-contact-heading" disabled={busy}>
            <h2 id="booking-contact-heading" className="booking-section-heading">Контактные данные</h2>
            <div className="booking-field-grid">
              <div className="booking-field">
                <label htmlFor="booking-name">Имя</label>
                <input id="booking-name" name="name" type="text" autoComplete="name" minLength={2} maxLength={100} required
                  aria-invalid={Boolean(nameError) || undefined} aria-describedby={nameError ? "booking-name-error" : undefined}
                  onChange={() => clearFieldError("name")} />
                {nameError && <small id="booking-name-error" className="booking-field-error" aria-live="polite">{nameError}</small>}
              </div>
              <div className="booking-field">
                <label htmlFor="booking-contact">Телефон или электронная почта</label>
                <input id="booking-contact" name="contact" type="text" placeholder="+996 555 123 456" maxLength={160} required
                  aria-invalid={Boolean(contactError) || undefined} aria-describedby={contactError ? "booking-contact-error" : "booking-contact-note"}
                  onChange={() => clearFieldError("contact")} />
                {contactError && <small id="booking-contact-error" className="booking-field-error" aria-live="polite">{contactError}</small>}
              </div>
            </div>
            <p id="booking-contact-note" className="booking-help">{demo
              ? "Для проверки формы используйте тестовое имя и контакт."
              : "Контакт нужен организатору, чтобы подтвердить дату и места."}</p>
          </fieldset>
        </form>

        <aside className="booking-card booking-summary" aria-label="Стоимость тура">
          <Image className="booking-summary-image" src={tour.image} alt="" width={680} height={280} unoptimized={tour.image.startsWith("/media/")} sizes="(max-width: 800px) 94vw, 430px" />
          <div className="booking-summary-body">
            <h2>{tour.title}</h2>
            <p className="booking-summary-region"><MapPin size={16} aria-hidden="true" /> {tour.region}</p>
            <ul className="booking-summary-meta">
              {option && <li><Clock size={16} aria-hidden="true" /> {durationLabel(option.days)}</li>}
              <li><Users size={16} aria-hidden="true" /> {people} чел.</li>
              {hasValidDate && <li><CalendarDays size={16} aria-hidden="true" /> {dateFormat.format(new Date(date))}</li>}
            </ul>
            {option && quote && (
              <dl className="booking-totals">
                <div><dt>{formatMoney(option.pricePerPerson)} × {people} чел.</dt><dd>{formatMoney(quote.base)}</dd></div>
                {withGuide && <div><dt>Гид на группу</dt><dd>{formatMoney(quote.guide)}</dd></div>}
                <div className="booking-total" aria-live="polite"><dt>Итого за группу</dt><dd id="booking-total" ref={totalPrice} tabIndex={-1}>{formatMoney(quote.total)}</dd></div>
              </dl>
            )}
            {summaryError && (
              <div ref={submissionError} className="booking-error" tabIndex={-1}>
                <p role="alert">{summaryError.message}</p>
                {summaryError.refreshPrice && <button className="booking-refresh" type="button" onClick={refreshPrice} disabled={isRefreshing}>
                  {isRefreshing ? "Обновляем расчёт…" : "Обновить расчёт"}
                </button>}
              </div>
            )}
            {reviewPrice && <p className="booking-review-price" role="status">Проверьте параметры и итоговую сумму перед отправкой заявки.</p>}
            <button className="button booking-submit" type="submit" form="booking-form" disabled={!ready || busy || !hasDates || Boolean(summaryError?.refreshPrice)}>
              {isSubmitting ? "Отправляем…" : "Отправить заявку"} <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
