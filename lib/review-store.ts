import "server-only";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { openBookings } from "./storage.mjs";
import type { PublicReview } from "./review-types";

export const reviewStatusLabels = {
  pending: "На проверке",
  approved: "Опубликован",
  rejected: "Отклонён",
} as const;

export type ReviewStatus = keyof typeof reviewStatusLabels;

export type StoredReview = {
  id: string;
  tour_slug: string;
  author: string;
  rating: number;
  body: string;
  verified: 0 | 1;
  status: ReviewStatus;
  created_at: string;
};

const initialized = new WeakSet<DatabaseSync>();
const validId = /^RV-[0-9A-F]{12}$/;
const maxReviewsPerHour = 20;
const adminPageSize = 50;
const publicPageSize = 50;

export function isReviewId(value: unknown): value is string {
  return typeof value === "string" && validId.test(value);
}

export function readReviewStatus(value: unknown): ReviewStatus | undefined {
  return value === "pending" || value === "approved" || value === "rejected" ? value : undefined;
}

export function ensureReviews(db: DatabaseSync = openBookings()) {
  if (initialized.has(db)) return db;

  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      tour_slug TEXT NOT NULL,
      author TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      body TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tour_slug, author, body)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS reviews_by_tour ON reviews (tour_slug, status, created_at);
  `);
  initialized.add(db);
  return db;
}

export function reviewStats(slug: string) {
  const row = ensureReviews().prepare(`
    SELECT COUNT(*) AS count, AVG(rating) AS average
    FROM reviews WHERE tour_slug = ? AND status = 'approved'
  `).get(slug) as { count: number; average: number | null };
  return { count: row.count, average: row.average === null ? null : Math.round(row.average * 10) / 10 };
}

export function listApprovedReviews(slug: string): PublicReview[] {
  const rows = ensureReviews().prepare(`
    SELECT id, author, rating, body, verified, created_at
    FROM reviews WHERE tour_slug = ? AND status = 'approved'
    ORDER BY created_at DESC, id DESC LIMIT ?
  `).all(slug, publicPageSize) as Pick<StoredReview, "id" | "author" | "rating" | "body" | "verified" | "created_at">[];

  return rows.map((row) => ({
    id: row.id,
    author: row.author,
    rating: row.rating,
    body: row.body,
    verified: row.verified === 1,
    createdAt: row.created_at,
  }));
}

export type NewReview = {
  tourSlug: string;
  author: string;
  rating: number;
  body: string;
  bookingId: string | null;
};

export function saveReview(review: NewReview): "saved" | "duplicate" | "limit" {
  const db = ensureReviews();
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const recent = db.prepare("SELECT COUNT(*) AS count FROM reviews WHERE created_at > ?").get(hourAgo) as { count: number };
  if (recent.count >= maxReviewsPerHour) return "limit";

  // A confirmed booking for the same tour marks the author as a real participant.
  const verified = review.bookingId && db.prepare(`
    SELECT 1 FROM bookings WHERE id = ? AND tour_slug = ? AND status = 'confirmed'
  `).get(review.bookingId, review.tourSlug) ? 1 : 0;

  const id = "RV-" + randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const timestamp = now.toISOString();
  const inserted = db.prepare(`
    INSERT INTO reviews (id, tour_slug, author, rating, body, verified, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    ON CONFLICT(tour_slug, author, body) DO NOTHING
  `).run(id, review.tourSlug, review.author, review.rating, review.body, verified, timestamp, timestamp);
  return inserted.changes ? "saved" : "duplicate";
}

export function listReviewsForAdmin(status: ReviewStatus) {
  return ensureReviews().prepare(`
    SELECT id, tour_slug, author, rating, body, verified, status, created_at
    FROM reviews WHERE status = ?
    ORDER BY created_at DESC, id DESC LIMIT ?
  `).all(status, adminPageSize) as StoredReview[];
}

export function countReviewsByStatus() {
  const rows = ensureReviews().prepare("SELECT status, COUNT(*) AS count FROM reviews GROUP BY status")
    .all() as { status: ReviewStatus; count: number }[];
  return { pending: 0, approved: 0, rejected: 0, ...Object.fromEntries(rows.map((row) => [row.status, row.count])) } as Record<ReviewStatus, number>;
}

export function setReviewStatus(id: string, status: Exclude<ReviewStatus, "pending">) {
  const row = ensureReviews().prepare(`
    UPDATE reviews SET status = ?, updated_at = ? WHERE id = ? RETURNING tour_slug
  `).get(status, new Date().toISOString(), id) as { tour_slug: string } | undefined;
  return row?.tour_slug ?? null;
}

export function deleteReview(id: string) {
  const row = ensureReviews().prepare("DELETE FROM reviews WHERE id = ? RETURNING tour_slug")
    .get(id) as { tour_slug: string } | undefined;
  return row?.tour_slug ?? null;
}
