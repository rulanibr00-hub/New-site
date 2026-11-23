import "server-only";
import type { SQLInputValue } from "node:sqlite";
import { openBookings } from "@/lib/storage.mjs";

export const bookingStatusLabels = {
  pending: "Новая",
  confirmed: "Подтверждена",
  declined: "Отклонена",
} as const;

export type BookingStatus = keyof typeof bookingStatusLabels;

type BookingSummary = {
  id: string;
  tour_title: string;
  departure_date: string;
  people: number;
  total: number;
  status: BookingStatus;
  created_at: string;
};

type BookingDetail = BookingSummary & {
  days: number;
  with_guide: 0 | 1;
  name: string;
  contact: string;
  base: number;
  guide: number;
  updated_at: string;
};

type BookingFilters = { status?: BookingStatus; after?: string };

const pageSize = 25;
const validId = /^TT-[0-9A-F]{12}$/;
const dateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "Asia/Bishkek" });
const timeFormat = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bishkek",
});

export function isBookingId(value: unknown): value is string {
  return typeof value === "string" && validId.test(value);
}

export function readBookingFilters(status: unknown, after: unknown): BookingFilters {
  return {
    status: status === "pending" || status === "confirmed" || status === "declined" ? status : undefined,
    after: isBookingId(after) ? after : undefined,
  };
}

export function inboxHref({ status, after }: BookingFilters = {}, id?: string, error?: string) {
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (after) query.set("after", after);
  if (error) query.set("error", error);
  return `/admin/bookings${id ? `/${id}` : ""}${query.size ? `?${query}` : ""}`;
}

export function formatDepartureDate(value: string) {
  return dateFormat.format(new Date(`${value}T00:00:00Z`));
}

export function formatBookingTime(value: string) {
  return timeFormat.format(new Date(value));
}

export function listBookings({ status, after }: BookingFilters) {
  const db = openBookings();
  const conditions: string[] = [];
  const values: SQLInputValue[] = [];

  if (status) {
    conditions.push("status = ?");
    values.push(status);
  }
  if (after) {
    const cursor = db.prepare("SELECT created_at FROM bookings WHERE id = ?").get(after);
    if (typeof cursor?.created_at === "string") {
      conditions.push("(created_at, id) < (?, ?)");
      values.push(cursor.created_at, after);
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT id, tour_title, departure_date, people, total, status, created_at
    FROM bookings ${where}
    ORDER BY created_at DESC, id DESC LIMIT ?
  `).all(...values, pageSize + 1) as BookingSummary[];

  return {
    rows: rows.slice(0, pageSize),
    next: rows.length > pageSize ? rows[pageSize - 1].id : undefined,
  };
}

export function getBooking(id: string) {
  return openBookings().prepare(`
    SELECT id, tour_title, departure_date, days, people, with_guide, name, contact, base, guide,
      total, status, created_at, updated_at
    FROM bookings WHERE id = ?
  `).get(id) as BookingDetail | undefined;
}

export function transitionBooking(id: string, status: Exclude<BookingStatus, "pending">) {
  const db = openBookings();
  const result = db.prepare(`
    UPDATE bookings SET status = ?, updated_at = ? WHERE id = ? AND status = 'pending'
  `).run(status, new Date().toISOString(), id);

  if (result.changes) return "saved";

  const current = db.prepare("SELECT status FROM bookings WHERE id = ?").get(id);
  if (!current) return "missing";
  return current.status === status ? "saved" : "conflict";
}
