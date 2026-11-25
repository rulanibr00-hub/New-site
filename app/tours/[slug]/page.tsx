import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { TourDetail } from '../../../components/tour-detail';
import { getPublishedTour, getSiteSettings } from '../../../lib/catalog-store';
import { listApprovedReviews } from '../../../lib/review-store';
import { canDepart, getPublicTourRoute, getToday, getUpcomingDepartures } from '../../../lib/tours';
import '../../detail.css';

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    region?: string | string[];
    category?: string | string[];
    date?: string | string[];
    people?: string | string[];
  }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const tour = getPublishedTour(slug, { includeRouteTrack: false });

  return tour ? { title: tour.title, description: tour.summary } : {};
}

export default async function TourPage({ params, searchParams }: PageProps) {
  const [{ slug }, { region, category, date, people }] = await Promise.all([params, searchParams]);
  const tour = getPublishedTour(slug);

  if (!tour) notFound();

  const today = getToday();
  const filters = new URLSearchParams();
  if (typeof region === 'string' && region === tour.region) {
    filters.set('region', region);
  }
  if (typeof category === 'string' && category && category === tour.category) {
    filters.set('category', category);
  }
  if (typeof date === 'string' && canDepart(tour, date, today)) {
    filters.set('date', date);
  }
  if (typeof people === 'string' && /^[1-9]\d*$/.test(people) && Number(people) <= tour.groupLimit) {
    filters.set('people', people);
  }

  const query = filters.size > 0 ? `?${filters}` : '';
  const demo = getSiteSettings().demo;
  const bookingHref = getUpcomingDepartures(tour, today).length > 0 ? `/tours/${tour.slug}/book${query}` : null;
  return (
    <TourDetail
      tour={{ ...tour, routeTrack: undefined }}
      demo={demo}
      route={getPublicTourRoute(tour, demo)}
      reviews={listApprovedReviews(tour.slug)}
      catalogHref={`/${query}#tours`}
      bookingHref={bookingHref}
    />
  );
}
