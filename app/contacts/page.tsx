import Link from "next/link";
import { getSiteSettings } from "@/lib/catalog-store";
import { instagramUrl, telegramUrl, whatsappUrl } from "@/lib/messengers";

export const metadata = { title: "Контакты" };
export const dynamic = "force-dynamic";

export default function Contacts() {
  const { email, phone, whatsapp, telegram, instagram } = getSiteSettings();

  return (
    <main className="shell info-page">
      <article>
        <h1>Контакты</h1>
        {email && <p>Напишите нам на <a href={"mailto:" + email}>{email}</a>.</p>}
        {phone && <p>Позвоните по номеру <a href={"tel:" + phone.replace(/[^+\d]/g, "")}>{phone}</a>.</p>}
        {(whatsapp || telegram || instagram) && (
          <p className="contact-messengers">
            Мы на связи в мессенджерах:{" "}
            {whatsapp && <a href={whatsappUrl(whatsapp)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
            {whatsapp && (telegram || instagram) && ", "}
            {telegram && <a href={telegramUrl(telegram)} target="_blank" rel="noopener noreferrer">Telegram</a>}
            {telegram && instagram && ", "}
            {instagram && <a href={instagramUrl(instagram)} target="_blank" rel="noopener noreferrer">Instagram</a>}
            .
          </p>
        )}
        <h2>Связаться с организатором</h2>
        <p>Выберите поездку и оставьте телефон или почту в заявке. Организатор использует эти контакты, чтобы согласовать детали поездки.</p>
        <Link className="button" href="/#tours">Перейти к турам</Link>
      </article>
    </main>
  );
}
