export type TourOption = {
  id: string;
  days: number;
  pricePerPerson: number;
  guidePerGroup: number | null;
};

export type TourRoutePoint = {
  title: string;
  note: string;
  lat: number | null;
  lng: number | null;
};

export type LocatedTourRoutePoint = TourRoutePoint & { lat: number; lng: number };

export const tourRoutePointLimit = 30;
// The Web Mercator projection used by the map tiles stops short of the poles.
export const tourRouteLatitudeLimit = 85.05112878;

export type Tour = {
  slug: string;
  title: string;
  region: string;
  category: string;
  summary: string;
  description: string;
  image: string;
  gallery: string[];
  rating: number;
  reviewCount: number;
  departure: string;
  groupLimit: number;
  weekdays: number[];
  startDate?: string;
  endDate?: string;
  options: TourOption[];
  includes: string[];
  program: { time: string; title: string; description: string }[];
  routePoints?: TourRoutePoint[];
};

const alaArchaExampleRoute: LocatedTourRoutePoint[] = [
  { title: "Сбор в Бишкеке", note: "Пример точки сбора. Место встречи уточнит организатор.", lat: 42.8750, lng: 74.6000 },
  { title: "Вход в парк", note: "Пример остановки у входа в национальный парк.", lat: 42.6703, lng: 74.5029 },
  { title: "Смотровая площадка", note: "Пример конечной точки прогулки в ущелье.", lat: 42.5590, lng: 74.4830 },
];

export function parseRouteCoordinate(value: unknown, limit: number) {
  if (value == null || (typeof value === "string" && !value.trim())) return null;

  let coordinate = value;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(raw)) return undefined;
    coordinate = Number(raw.replace(",", "."));
  }
  return typeof coordinate === "number" && Number.isFinite(coordinate) && Math.abs(coordinate) <= limit
    ? coordinate
    : undefined;
}

export function isLocatedRoutePoint(point: TourRoutePoint): point is LocatedTourRoutePoint {
  return typeof point.lat === "number" && Number.isFinite(point.lat) && Math.abs(point.lat) <= tourRouteLatitudeLimit
    && typeof point.lng === "number" && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
}

export function getPublicTourRoute(tour: Tour, demo: boolean): { points: LocatedTourRoutePoint[]; isExample: boolean } {
  if (tour.routePoints) return { points: tour.routePoints.filter(isLocatedRoutePoint), isExample: false };
  if (demo && tour.slug === "ala-archa") return { points: alaArchaExampleRoute, isExample: true };
  return { points: [], isExample: false };
}

export const tours: Tour[] = [
  {
    slug: "ala-archa",
    title: "Поход в Ала-Арчу",
    region: "Чуйская область",
    category: "Пешие туры",
    summary: "Горная река, еловый лес и смотровая площадка с видом на Тянь-Шань.",
    description: "Утром выедем из Бишкека в ущелье Ала-Арча. Пройдём вдоль горной реки через еловый лес к смотровой площадке с видом на вершины Тянь-Шаня. Там сделаем остановку для отдыха и фотографий.",
    image: "/tours/ala-archa.webp",
    gallery: ["/tours/ala-archa.webp", "/tours/ala-archa-trail.webp", "/tours/ala-archa-peaks.webp"],
    rating: 4.9,
    reviewCount: 24,
    departure: "Бишкек",
    groupLimit: 12,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    options: [{ id: "1-day", days: 1, pricePerPerson: 3500, guidePerGroup: 4500 }],
    includes: ["Трансфер из Бишкека и обратно", "Вход в национальный парк"],
    program: [
      { time: "09:00", title: "Выезд из Бишкека", description: "Встречаемся в Бишкеке и едем к началу маршрута в национальном парке." },
      { time: "10:00", title: "Прогулка по парку", description: "Идём по тропе вдоль реки через еловый лес. На смотровой площадке остановимся на отдых и фотографии." },
      { time: "16:00", title: "Возвращение", description: "Спускаемся к месту встречи с водителем и отправляемся обратно в Бишкек." },
    ],
  },
  {
    slug: "issyk-kul",
    title: "Выходные на Иссык-Куле",
    region: "Иссык-Куль",
    category: "Озёра и каньоны",
    summary: "Южный берег озера, красные скалы каньона Сказка и ночёвка в гостевом доме.",
    description: "Отправимся на южный берег Иссык-Куля, где красные скалы каньона Сказка подступают к озеру. Прогуляемся по грунтовым тропам между скалами и проведём вечер у воды. В трёхдневной программе будет ещё один день на берегу.",
    image: "/tours/issyk-kul.webp",
    gallery: ["/tours/issyk-kul.webp"],
    rating: 4.8,
    reviewCount: 18,
    departure: "Бишкек",
    groupLimit: 10,
    weekdays: [0, 4, 5, 6],
    options: [
      { id: "2-days", days: 2, pricePerPerson: 7500, guidePerGroup: 7000 },
      { id: "3-days", days: 3, pricePerPerson: 10500, guidePerGroup: 9500 },
    ],
    includes: ["Трансфер по маршруту", "Проживание в гостевом доме по выбранной программе", "Вход в каньон Сказка"],
    program: [
      { time: "День 1", title: "Южный берег и каньон Сказка", description: "Выезжаем из Бишкека, гуляем по каньону и заселяемся в гостевой дом у озера." },
      { time: "День 2", title: "Прогулка вдоль озера", description: "Утро посвящаем побережью. В двухдневном туре после прогулки возвращаемся в Бишкек." },
      { time: "День 3", title: "День у воды и возвращение", description: "В трёхдневном туре проводим ещё одно утро на берегу и возвращаемся в Бишкек после обеда." },
    ],
  },
  {
    slug: "son-kul",
    title: "Сон-Куль и ночь в юрте",
    region: "Нарынская область",
    category: "Юрточные лагеря",
    summary: "Высокогорное озеро, прогулки по пастбищам и ночёвка в юрточном лагере.",
    description: "Через горные перевалы доберёмся до Сон-Куля и остановимся в юрточном лагере. Оттуда можно выйти к озеру, прогуляться по пастбищам и встретить закат у воды. В четырёхдневной программе проведём на озере дополнительный день.",
    image: "/tours/son-kul.webp",
    gallery: ["/tours/son-kul.webp"],
    rating: 5.0,
    reviewCount: 12,
    departure: "Бишкек",
    groupLimit: 8,
    weekdays: [1, 3, 5],
    options: [
      { id: "3-days", days: 3, pricePerPerson: 12000, guidePerGroup: 10000 },
      { id: "4-days", days: 4, pricePerPerson: 15500, guidePerGroup: 12500 },
    ],
    includes: ["Трансфер по маршруту", "Проживание по выбранной программе", "Завтраки в юрточном лагере"],
    program: [
      { time: "День 1", title: "Дорога к Сон-Кулю", description: "Выезжаем из Бишкека, останавливаемся на перевале и заселяемся в юрточный лагерь." },
      { time: "День 2", title: "Озеро и пастбища", description: "Гуляем по берегу и смотрим, как меняется цвет воды на закате." },
      { time: "День 3", title: "Утро на озере", description: "Завтракаем в лагере. В трёхдневном туре после завтрака выезжаем в Бишкек." },
      { time: "День 4", title: "Возвращение в Бишкек", description: "В четырёхдневной программе отправляемся в город после дополнительного дня на озере." },
    ],
  },
];

const somAmount = new Intl.NumberFormat("ru-RU");
const bishkekDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Bishkek",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatMoney(amount: number) {
  return `${somAmount.format(amount)} сом`;
}

export function getToday() {
  return bishkekDate.format(new Date());
}

export function canDepart(tour: Tour, date: string) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < getToday()) {
    return false;
  }
  if ((tour.startDate && date < tour.startDate) || (tour.endDate && date > tour.endDate)) return false;

  const calendarDate = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(calendarDate.getTime())
    && calendarDate.toISOString().slice(0, 10) === date
    && tour.weekdays.includes(calendarDate.getUTCDay());
}

export function priceTour(tour: Tour, optionId: string, people: number, withGuide: boolean) {
  if (!Number.isInteger(people) || people < 1 || people > tour.groupLimit || typeof withGuide !== "boolean") {
    return null;
  }

  const option = tour.options.find((candidate) => candidate.id === optionId);
  if (!option || (withGuide && option.guidePerGroup === null)) {
    return null;
  }

  const base = option.pricePerPerson * people;
  const guide = withGuide ? (option.guidePerGroup ?? 0) : 0;
  return { base, guide, total: base + guide };
}
