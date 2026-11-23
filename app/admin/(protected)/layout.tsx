import Link from "next/link";
import { ExternalLink, LogOut, Mountain } from "lucide-react";
import { logoutAction } from "../login/actions";
import { AdminNavigation } from "@/components/admin-navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getSiteSettings } from "@/lib/catalog-store";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const { name } = getSiteSettings();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/admin/tours" className="admin-brand">
          <Mountain aria-hidden="true" size={26} />
          <span>{name}</span>
        </Link>
        <AdminNavigation />
        <div className="admin-sidebar-actions">
          <Link href="/"><ExternalLink aria-hidden="true" size={16} /> <span>На сайт</span></Link>
          <form action={logoutAction}>
            <button type="submit"><LogOut aria-hidden="true" size={16} /> <span>Выйти</span></button>
          </form>
        </div>
      </aside>
      <div className="admin-content">{children}</div>
    </div>
  );
}
