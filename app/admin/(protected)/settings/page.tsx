import { requireAdmin } from "@/lib/admin-auth";
import { getSiteSettings } from "@/lib/catalog-store";
import { telegramDeliveryPaused } from "@/lib/telegram-notifications";
import { getTelegramSettings } from "@/lib/telegram-store";
import { SiteSettingsForm } from "@/components/site-settings-form";
import { TelegramSettingsForm } from "@/components/telegram-settings-form";
import "./telegram.css";

export const metadata = { title: "Настройки сайта" };

export default async function SiteSettingsPage() {
  await requireAdmin();

  return (
    <main className="admin-page">
      <header className="admin-heading">
        <div>
          <h1>Настройки сайта</h1>
          <p>Изменения появятся на публичных страницах после сохранения.</p>
        </div>
      </header>
      <SiteSettingsForm settings={getSiteSettings()} />
      <TelegramSettingsForm settings={getTelegramSettings()} deliveryPaused={telegramDeliveryPaused} />
    </main>
  );
}
