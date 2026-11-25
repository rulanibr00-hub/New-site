"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { reviewLimits } from "../lib/review-types";

const ratingOptions = [
  [5, "5 — отлично"],
  [4, "4 — хорошо"],
  [3, "3 — нормально"],
  [2, "2 — плохо"],
  [1, "1 — очень плохо"],
] as const;

export function ReviewForm({ tourSlug }: { tourSlug: string }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const message = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (sent || error) message.current?.focus();
  }, [sent, error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tourSlug,
          author: String(form.get("author") ?? ""),
          rating: Number(form.get("rating")),
          body: String(form.get("body") ?? ""),
          bookingId: String(form.get("bookingId") ?? ""),
          website: String(form.get("website") ?? ""),
        }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setError(typeof result?.error === "string" ? result.error : "Не удалось отправить отзыв. Попробуйте ещё раз.");
        return;
      }
      setSent(true);
    } catch {
      setError(controller.signal.aborted
        ? "Сервер не ответил вовремя. Попробуйте ещё раз."
        : "Не удалось соединиться с сервером. Попробуйте ещё раз.");
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className="review-success" role="status" tabIndex={-1} ref={message}>
        Спасибо за отзыв! Он появится на странице тура после проверки организатором.
      </p>
    );
  }

  return (
    <form className="review-form" onSubmit={submit} aria-busy={busy}>
      <h3>Оставить отзыв</h3>
      <fieldset disabled={busy}>
        <label className="review-field">
          <span>Ваше имя</span>
          <input name="author" required minLength={reviewLimits.authorMin} maxLength={reviewLimits.authorMax} autoComplete="given-name" />
        </label>
        <label className="review-field">
          <span>Оценка</span>
          <select name="rating" required defaultValue="">
            <option value="" disabled>Выберите оценку</option>
            {ratingOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="review-field">
          <span>Отзыв</span>
          <textarea name="body" required rows={5} minLength={reviewLimits.bodyMin} maxLength={reviewLimits.bodyMax} />
        </label>
        <label className="review-field">
          <span>Номер заявки (необязательно)</span>
          <input name="bookingId" maxLength={20} placeholder="TT-XXXXXXXXXXXX" autoComplete="off" />
          <small>Если поездка подтверждена, рядом с отзывом появится отметка «Участник поездки».</small>
        </label>
        <div className="review-trap" aria-hidden="true">
          <label>Сайт<input name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>
      </fieldset>
      {error && <p className="review-error" role="alert" tabIndex={-1} ref={message}>{error}</p>}
      <button className="button" type="submit" disabled={busy}>{busy ? "Отправляем…" : "Отправить отзыв"}</button>
    </form>
  );
}
