import Link from "next/link";
import { AdminTourForm } from "@/components/admin-tour-form";
import { requireAdmin } from "@/lib/admin-auth";
import { saveTourAction } from "../actions";

export const metadata = { title: "Новый тур" };

export default async function NewTourPage() {
  await requireAdmin();

  return (
    <div className="admin-page">
      <Link href="/admin/tours" className="admin-back-link">← К списку туров</Link>
      <h1 className="admin-heading">Новый тур</h1>
      <AdminTourForm action={saveTourAction.bind(null, null)} />
    </div>
  );
}
