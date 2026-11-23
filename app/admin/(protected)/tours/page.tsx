import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAdmin } from "@/lib/admin-auth";
import { listManagedTours } from "@/lib/catalog-store";
import { formatMoney } from "@/lib/tours";
import "../../tours.css";

export const metadata = { title: "Туры" };

const dateTime = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bishkek",
});

export default async function AdminToursPage() {
  await requireAdmin();
  const tours = listManagedTours();

  return (
    <div className="admin-page">
      <div className="admin-tour-page-title">
        <h1 className="admin-heading">Туры</h1>
        <Link className="admin-button" href="/admin/tours/new"><Plus size={18} aria-hidden="true" /> Добавить тур</Link>
      </div>
      <section className="admin-panel" aria-label="Список туров">
        {tours.length ? (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Тур</th>
                  <th scope="col">На сайте</th>
                  <th scope="col">Цена на сайте</th>
                  <th scope="col">Изменён</th>
                </tr>
              </thead>
              <tbody>
                {tours.map(({ draft, published, revision, publishedRevision, updatedAt }) => (
                  <tr key={draft.slug}>
                    <td>
                      <Link className="admin-tour-title-link" href={`/admin/tours/${draft.slug}`}>{draft.title}</Link>
                      {draft.region && <small className="admin-tour-list-region">{draft.region}</small>}
                    </td>
                    <td>
                      <span className={published ? "admin-tour-status is-published" : "admin-tour-status"}>
                        {published ? "Опубликован" : "Черновик"}
                      </span>
                      {published && publishedRevision !== revision && <small className="admin-tour-list-region">Есть изменения в черновике</small>}
                    </td>
                    <td>{published ? `от ${formatMoney(Math.min(...published.options.map((option) => option.pricePerPerson)))}` : "—"}</td>
                    <td><time dateTime={updatedAt}>{dateTime.format(new Date(updatedAt))}</time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p>Добавьте первый тур, чтобы он появился в списке.</p>}
      </section>
    </div>
  );
}
