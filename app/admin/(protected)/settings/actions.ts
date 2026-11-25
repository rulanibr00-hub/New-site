"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/admin-auth";
import { CatalogError, saveSiteSettings } from "@/lib/catalog-store";
import { storageErrorCode } from "@/lib/storage.mjs";

export type SettingsState = {
  revision: number;
  error?: string;
  saved?: boolean;
};

export async function updateSiteSettings(previous: SettingsState, form: FormData): Promise<SettingsState> {
  await requireAdminAction();
  const revision = Number(form.get("revision"));
  if (!Number.isSafeInteger(revision) || revision < 1) {
    return { revision: previous.revision, error: "Обновите страницу и попробуйте ещё раз." };
  }

  try {
    const settings = saveSiteSettings({
      name: form.get("name"),
      headline: form.get("headline"),
      tagline: form.get("tagline"),
      about: form.get("about"),
      email: form.get("email"),
      phone: form.get("phone"),
      whatsapp: form.get("whatsapp"),
      telegram: form.get("telegram"),
      instagram: form.get("instagram"),
      demo: form.get("demo") === "on",
    }, revision);

    revalidatePath("/", "layout");
    revalidatePath("/robots.txt");
    revalidatePath("/sitemap.xml");

    return { revision: settings.revision, saved: true };
  } catch (error) {
    if (error instanceof CatalogError) return { revision, error: error.message };

    console.error("Не удалось сохранить настройки сайта.", storageErrorCode(error));
    return { revision, error: "Не удалось сохранить настройки. Попробуйте ещё раз." };
  }
}
