import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { formatBookingTime } from "@/lib/admin-booking-store";
import {
  countReviewsByStatus, listReviewsForAdmin, readReviewStatus, reviewStatusLabels, type ReviewStatus,
} from "@/lib/review-store";
import { storageErrorCode } from "@/lib/storage.mjs";
import { moderateReview } from "./actions";

export const metadata = { title: "Отзывы" };

const statuses = Object.keys(reviewStatusLabels) as ReviewStatus[];

type ReviewsProps = {
  searchParams: Promise<{ status?: string | string[]; error?: string | string[] }>;
};

export default async function ReviewModeration({ searchParams }: ReviewsProps) {
  await requireAdmin();
  const query = await searchParams;
  const status = readReviewStatus(query.status) ?? "pending";
  let reviews: ReturnType<typeof listReviewsForAdmin> | undefined;
  let counts: ReturnType<typeof countReviewsByStatus> | undefined;

  try {
    reviews = listReviewsForAdmin(status);
    counts = countReviewsByStatus();
  } catch (error) {
    console.error("Не удалось прочитать отзывы.", storageErrorCode(error));
  }

  return (
    <main className="admin-page">
      <header className="admin-heading"><h1>Отзывы</h1></header>
      {query.error === "storage" && (
        <p className="admin-error" role="alert">Не удалось сохранить изменение. Попробуйте ещё раз.</p>
      )}
      <nav className="admin-actions admin-booking-filters" aria-label="Фильтр по статусу">
        {statuses.map((item) => (
          <Link
            aria-current={item === status ? "page" : undefined}
            className={item === status ? "admin-button" : "admin-secondary"}
            href={`/admin/reviews?status=${item}`}
            key={item}
          >
            {reviewStatusLabels[item]}{counts ? ` (${counts[item]})` : ""}
          </Link>
        ))}
      </nav>
      <section aria-label="Список отзывов">
        {!reviews ? (
          <p className="admin-error" role="alert">Не удалось загрузить отзывы. Обновите страницу и попробуйте ещё раз.</p>
        ) : reviews.length ? reviews.map((review) => (
          <article className="admin-panel" key={review.id}>
            <h2>{review.author} · {review.rating} из 5</h2>
            <p className="admin-muted">
              Тур: <Link href={`/tours/${review.tour_slug}`}>{review.tour_slug}</Link>
              {" · "}
              <time dateTime={review.created_at}>{formatBookingTime(review.created_at)}</time>
              {review.verified === 1 && " · Подтверждённый участник поездки"}
            </p>
            <p style={{ whiteSpace: "pre-line" }}>{review.body}</p>
            <form action={moderateReview} className="admin-actions">
              <input type="hidden" name="id" value={review.id} />
              <input type="hidden" name="status" value={status} />
              {review.status !== "approved" && <button className="admin-button" name="intent" value="approve">Опубликовать</button>}
              {review.status !== "rejected" && <button className="admin-secondary" name="intent" value="reject">Отклонить</button>}
              <button className="admin-secondary" name="intent" value="delete">Удалить</button>
            </form>
          </article>
        )) : <p className="admin-panel">В этом разделе отзывов нет.</p>}
      </section>
    </main>
  );
}
