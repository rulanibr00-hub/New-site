import { notFound } from "next/navigation";
import { BookingForm } from "../../../../components/booking-form";
import { getPublishedTour, getSiteSettings } from "../../../../lib/catalog-store";
import { canDepart, getToday } from "../../../../lib/tours";
import "../../../booking.css";

type BookingPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string | string[]; people?: string | string[]; region?: string | string[]; category?: string | string[] }>;
};

export const metadata = { title: "Оформление тура" };

export default async function BookingPage({ params, searchParams }: BookingPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const tour = getPublishedTour(slug, { includeRouteTrack: false });

  if (!tour) notFound();

  const today = getToday();
  const requestedPeople = typeof query.people === "string" && /^\d{1,3}$/.test(query.people) ? Number(query.people) : 0;
  const validPeople = requestedPeople > 0 && requestedPeople <= tour.groupLimit;
  const initialPeople = validPeople ? requestedPeople : Math.min(2, tour.groupLimit);
  const initialDate = typeof query.date === "string" && canDepart(tour, query.date, today) ? query.date : "";
  const tourQuery = new URLSearchParams();
  if (typeof query.region === "string" && query.region === tour.region) tourQuery.set("region", query.region);
  if (typeof query.category === "string" && query.category && query.category === tour.category) {
    tourQuery.set("category", query.category);
  }
  if (initialDate) tourQuery.set("date", initialDate);
  if (validPeople) tourQuery.set("people", String(requestedPeople));
  const tourHref = `/tours/${tour.slug}${tourQuery.size ? `?${tourQuery}` : ""}`;

  const { demo, whatsapp, telegram, instagram } = getSiteSettings();

  return (
    <main>
      <BookingForm tour={tour} demo={demo} today={today} initialPeople={initialPeople} initialDate={initialDate} tourHref={tourHref}
        messengers={{ whatsapp, telegram, instagram }} />
    </main>
  );
}
