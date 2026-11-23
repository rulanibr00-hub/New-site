import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell info-page">
      <article>
        <h1>Страница не найдена</h1>
        <p>Посмотрите доступные маршруты в каталоге.</p>
        <Link className="button" href="/#tours">К списку туров</Link>
      </article>
    </main>
  );
}
