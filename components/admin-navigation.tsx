"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck2, Map, Settings } from "lucide-react";

const sections = [
  { href: "/admin/tours", text: "Туры", Icon: Map },
  { href: "/admin/bookings", text: "Заявки", Icon: CalendarCheck2 },
  { href: "/admin/settings", text: "Настройки сайта", Icon: Settings },
];

export function AdminNavigation() {
  const path = usePathname();

  return (
    <nav className="admin-navigation" aria-label="Управление сайтом">
      {sections.map(({ href, text, Icon }) => {
        const current = path === href || path.startsWith(href + "/");
        return (
          <Link key={href} href={href} aria-current={current ? "page" : undefined}>
            <Icon aria-hidden="true" size={19} />
            <span>{text}</span>
          </Link>
        );
      })}
    </nav>
  );
}
