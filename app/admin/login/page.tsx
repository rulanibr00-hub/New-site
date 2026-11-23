import type { Metadata } from "next";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import { LoginForm } from "./login-form";
import "./login.css";

export const metadata: Metadata = { title: "Вход в админку", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin/tours");

  return (
    <main className="admin-login">
      <section className="admin-panel admin-login-card">
        <span className="admin-login-icon"><LockKeyhole aria-hidden="true" size={26} /></span>
        <h1>Вход в админку</h1>
        <LoginForm />
        <Link className="admin-login-back" href="/">Вернуться на сайт</Link>
      </section>
    </main>
  );
}
