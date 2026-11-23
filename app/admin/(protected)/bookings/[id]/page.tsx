import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import {
  bookingStatusLabels, formatBookingTime, formatDepartureDate, getBooking, inboxHref, isBookingId, readBookingFilters,
} from "@/lib/admin-booking-store";
import { storageErrorCode } from "@/lib/storage.mjs";
import { describeTelegramDeliveryError } from "@/lib/telegram-notifications";
import { getTelegramBookingDelivery } from "@/lib/telegram-store";
import { formatMoney } from "@/lib/tours";
import { changeBookingStatus, retryBookingTelegram } from "./actions";

export const metadata = { title: "Заявка" };

const telegramStatusLabels = {
  pending: "В очереди",
  sent: "Отправлено",
  failed: "Не удалось отправить",
  canceled: "Отменено после изменения настроек",
};

type BookingPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string | string[]; after?: string | string[]; error?: string | string[] }>;
};

function messageForError(code: unknown) {
  if (code === "conflict") return "Заявка уже обработана. Ниже указан её текущий статус.";
  if (code === "invalid") return "Выберите подтверждение или отклонение заявки.";
  if (code === "storage") return "Не удалось обновить заявку. Попробуйте ещё раз.";
  if (code === "telegram_unavailable") return "Повторная отправка сейчас недоступна. Проверьте статус и настройки Telegram.";
  if (code === "telegram_storage") return "Не удалось вернуть уведомление Telegram в очередь. Попробуйте ещё раз.";
}

export default async function BookingDetailPage({ params, searchParams }: BookingPageProps) {
  await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isBookingId(id)) notFound();
  const filters = readBookingFilters(query.status, query.after);
  const message = messageForError(query.error);
  let booking: ReturnType<typeof getBooking>;

  try {
    booking = getBooking(id);
  } catch (error) {
    console.error("Не удалось прочитать заявку.", storageErrorCode(error));
    return (
      <main className="admin-page">
        <Link className="admin-back-link" href={inboxHref(filters)}>К заявкам</Link>
        <header className="admin-heading"><h1>Заявка {id}</h1></header>
        <p className="admin-error" role="alert">Не удалось загрузить заявку. Обновите страницу и попробуйте ещё раз.</p>
      </main>
    );
  }

  if (!booking) notFound();

  let delivery: ReturnType<typeof getTelegramBookingDelivery> | undefined;
  try {
    delivery = getTelegramBookingDelivery(id);
  } catch (error) {
    console.error("Не удалось прочитать статус уведомления Telegram.", storageErrorCode(error));
  }
  const retryable = delivery?.status === "failed" || delivery?.status === "canceled";
  const sending = (delivery?.lease_until ?? 0) > Date.now();
  const deliveryError = delivery?.error_code ? describeTelegramDeliveryError(delivery.error_code) : null;

  return (
    <main className="admin-page">
      <Link className="admin-back-link" href={inboxHref(filters)}>К заявкам</Link>
      <header className="admin-heading"><h1>Заявка {booking.id}</h1></header>
      {message && <p className="admin-error" role="alert">{message}</p>}

      <section className="admin-panel admin-booking-status" aria-labelledby="booking-status">
        <h2 id="booking-status">{bookingStatusLabels[booking.status]}</h2>
        <p>Поступила <time dateTime={booking.created_at}>{formatBookingTime(booking.created_at)}</time> по Бишкеку.</p>
        {booking.status === "pending" ? (
          <form action={changeBookingStatus} className="admin-actions">
            <input type="hidden" name="id" value={booking.id} />
            {filters.status && <input type="hidden" name="status" value={filters.status} />}
            {filters.after && <input type="hidden" name="after" value={filters.after} />}
            <button type="submit" name="target" value="confirmed" className="admin-button">Подтвердить заявку</button>
            <button type="submit" name="target" value="declined" className="admin-secondary">Отклонить заявку</button>
          </form>
        ) : (
          <p>Статус обновлён <time dateTime={booking.updated_at}>{formatBookingTime(booking.updated_at)}</time> по Бишкеку.</p>
        )}
      </section>

      <section className="admin-panel" aria-labelledby="booking-details">
        <h2 id="booking-details">Детали поездки</h2>
        <dl className="admin-grid">
          <div><dt>Тур</dt><dd>{booking.tour_title}</dd></div>
          <div><dt>Дата выезда</dt><dd><time dateTime={booking.departure_date}>{formatDepartureDate(booking.departure_date)}</time></dd></div>
          <div><dt>Длительность, дней</dt><dd>{booking.days}</dd></div>
          <div><dt>Участники</dt><dd>{booking.people}</dd></div>
          <div><dt>Вариант</dt><dd>{booking.with_guide ? "С гидом" : "Без гида"}</dd></div>
          <div><dt>Стоимость тура</dt><dd>{formatMoney(booking.base)}</dd></div>
          <div><dt>Услуги гида</dt><dd>{formatMoney(booking.guide)}</dd></div>
          <div><dt>Итого</dt><dd><strong>{formatMoney(booking.total)}</strong></dd></div>
        </dl>
      </section>

      <section className="admin-panel" aria-labelledby="booking-contact">
        <h2 id="booking-contact">Контакт клиента</h2>
        <dl className="admin-grid">
          <div><dt>Имя</dt><dd>{booking.name}</dd></div>
          <div><dt>Телефон или почта</dt><dd>{booking.contact}</dd></div>
        </dl>
        <p>Свяжитесь с клиентом, чтобы сообщить решение по заявке.</p>
      </section>

      <section className="admin-panel admin-booking-status" aria-labelledby="booking-telegram">
        <h2 id="booking-telegram">Уведомление в Telegram</h2>
        {delivery ? (
          <>
            <p><strong>{delivery.status ? telegramStatusLabels[delivery.status] : "Уведомление не ставилось в очередь"}</strong></p>
            {deliveryError && <p className="admin-muted">{deliveryError}</p>}
            {delivery.status === "pending" && deliveryError && !sending && (
              <p className="admin-muted">Следующая попытка пройдёт автоматически.</p>
            )}
            {delivery.status === "canceled" && sending && (
              <p className="admin-muted">Дождитесь результата предыдущей попытки.</p>
            )}
            {retryable && delivery.enabled === 1 && !sending && (
              <form action={retryBookingTelegram} className="admin-actions">
                <input type="hidden" name="id" value={booking.id} />
                {filters.status && <input type="hidden" name="status" value={filters.status} />}
                {filters.after && <input type="hidden" name="after" value={filters.after} />}
                <button type="submit" className="admin-secondary" aria-describedby="telegram-retry-note">Повторить отправку</button>
                <p id="telegram-retry-note" className="admin-muted">Сообщение уйдёт в текущий чат из настроек Telegram.</p>
              </form>
            )}
            {retryable && delivery.enabled === 0 && (
              <div className="admin-actions">
                <Link className="admin-secondary" href="/admin/settings">К настройкам Telegram</Link>
                <p className="admin-muted">Включите уведомления, чтобы повторить отправку.</p>
              </div>
            )}
            {(delivery.status === "pending" || sending) && (
              <div className="admin-actions">
                <a className="admin-secondary" href={inboxHref(filters, id)}>Обновить статус</a>
              </div>
            )}
          </>
        ) : <p className="admin-error" role="alert">Не удалось загрузить статус доставки. Обновите страницу.</p>}
      </section>
    </main>
  );
}
