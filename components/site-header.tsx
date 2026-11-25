"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Menu, Mountain, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const links = [
  { href: "/#tours", title: "Каталог туров" },
  { href: "/about", title: "О нас" },
  { href: "/faq", title: "Вопросы и ответы" },
  { href: "/contacts", title: "Контакты" },
];

export function SiteHeader({ siteName }: { siteName: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) nav.current?.querySelector("a")?.focus();
  }, [open]);

  return (
    <header className="site-header" onKeyDown={(event) => {
      if (open && event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    }}>
      <div className="shell header-inner">
        <Link href="/" className="wordmark" aria-label={`${siteName}, главная`} onClick={() => setOpen(false)}>
          <Mountain aria-hidden="true" />
          <span>{siteName}</span>
        </Link>
        <nav ref={nav} id="site-nav" className={open ? "site-nav is-open" : "site-nav"} aria-label="Основное меню">
          {links.map(({ href, title }) => (
            <Link href={href} key={href} aria-current={path === href ? "page" : undefined} onClick={() => setOpen(false)}>
              {title}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <Link href="/favorites" className="favorites-nav" aria-label="Избранное"
            aria-current={path === "/favorites" ? "page" : undefined} onClick={() => setOpen(false)}>
            <Heart aria-hidden="true" />
            <span>Избранное</span>
          </Link>
          <button ref={toggle} type="button" className="menu-toggle" aria-expanded={open} aria-controls="site-nav"
            aria-label={open ? "Закрыть меню" : "Открыть меню"} onClick={() => setOpen(!open)}>
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  );
}
