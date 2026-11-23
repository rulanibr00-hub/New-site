import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import {
  bookingStatusLabels, formatBookingTime, formatDepartureDate, inboxHref, listBookings, readBookingFilters,
  type BookingStatus,
} from "@/lib/admin-booking-store";
import { storageErrorCode } from "@/lib/storage.mjs";
import { formatMoney } from "@/lib/tours";

export const metadata = { title: "Заявки" };

const statusOptions: { status?: BookingStatus; label: string }[] = [
  { label: "Все заявки" },
  { status: "pending", label: "Новые" },
  { status: "confirmed", label: "Подтверждённые" },
  { status: "declined", label: "Отклонённые" },
];

type InboxProps = {
  searchParams: Promise<{ status?: string | string[]; after?: string | string[] }>;
};

export default async function BookingInbox({ searchParams }: InboxProps) {
  await requireAdmin();
  const query = await searchParams;
  const filters = readBookingFilters(query.status, query.after);
  let bookings: ReturnType<typeof listBookings> | undefined;

  try {
    bookings = listBookings(filters);
  } catch (error) {
    console.error("Не удалось прочитать список заявок.", storageErrorCode(error));
  }

  return (
    <main className="admin-page">
      <header className="admin-heading"><h1>Заявки</h1></header>
      <nav className="admin-actions admin-booking-filters" aria-label="Фильтр по статусу">
        {statusOptions.map(({ status, label }) => (
          <Link
            aria-current={filters.status === status ? "page" : undefined}
            className={filters.status === status ? "admin-button" : "admin-secondary"}
            href={inboxHref({ status })}
            key={label}
          >
            {label}
          </Link>
        ))}
      </nav>
      <section className="admin-panel" aria-label="Список заявок">
        {!bookings ? (
          <p className="admin-error" role="alert">Не удалось загрузить заявки. Обновите страницу и попробуйте ещё раз.</p>
        ) : bookings.rows.length ? (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Номер</th>
                  <th scope="col">Тур</th>
                  <th scope="col">Выезд</th>
                  <th scope="col">Участники</th>
                  <th scope="col">Сумма</th>
                  <th scope="col">Статус</th>
                  <th scope="col">Поступила</th>
                </tr>
              </thead>
              <tbody>
                {bookings.rows.map((booking) => (
                  <tr key={booking.id}>
                    <td><Link prefetch={false} href={inboxHref(filters, booking.id)}>{booking.id}</Link></td>
                    <td>{booking.tour_title}</td>
                    <td><time dateTime={booking.departure_date}>{formatDepartureDate(booking.departure_date)}</time></td>
                    <td>{booking.people}</td>
                    <td>{formatMoney(booking.total)}</td>
                    <td>{bookingStatusLabels[booking.status]}</td>
                    <td><time dateTime={booking.created_at}>{formatBookingTime(booking.created_at)}</time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>{filters.status || filters.after ? "Заявок на этой странице нет." : "Заявок пока нет."}</p>
        )}
        {bookings && (filters.after || bookings.next) && (
          <nav className="admin-actions" aria-label="Страницы заявок">
            {filters.after && <Link className="admin-secondary" href={inboxHref({ status: filters.status })}>Первая страница</Link>}
            {bookings.next && <Link className="admin-secondary" href={inboxHref({ status: filters.status, after: bookings.next })}>Следующая страница</Link>}
          </nav>
        )}
      </section>
    </main>
  );
}
