import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminTourForm } from "@/components/admin-tour-form";
import { requireAdmin } from "@/lib/admin-auth";
import { getManagedTour } from "@/lib/catalog-store";
import { saveTourAction } from "../actions";

export const metadata = { title: "Редактирование тура" };

export default async function EditTourPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  const record = getManagedTour(slug);
  if (!record) notFound();

  return (
    <div className="admin-page">
      <Link href="/admin/tours" className="admin-back-link">← К списку туров</Link>
      <h1 className="admin-heading">{record.draft.title}</h1>
      <AdminTourForm key={slug} action={saveTourAction.bind(null, slug)} record={record} />
    </div>
  );
}
