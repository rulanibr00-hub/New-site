"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/admin-auth";
import { sendTelegramTest } from "@/lib/telegram-notifications";
import { TelegramSettingsError, saveTelegramSettings } from "@/lib/telegram-store";

type TestResult = { ok: boolean; message: string };
type SavedFields = Pick<ReturnType<typeof saveTelegramSettings>, "chatId" | "enabled" | "hasToken" | "revision">;
type SaveResult =
  | { ok: true; message: string; settings: SavedFields }
  | { ok: false; message: string };

export async function updateTelegramSettings(_previous: SaveResult | null, form: FormData): Promise<SaveResult> {
  await requireAdminAction();

  const rawRevision = form.get("revision");
  const chatId = form.get("chatId");
  const token = form.get("token");
  const clearToken = form.get("clearToken") === "on";
  const enabled = form.get("enabled") === "on";
  const revision = typeof rawRevision === "string" && /^\d+$/.test(rawRevision) ? Number(rawRevision) : NaN;

  if (!Number.isSafeInteger(revision) || typeof chatId !== "string" || (token !== null && typeof token !== "string")) {
    return { ok: false, message: "Не удалось прочитать настройки. Обновите страницу и попробуйте ещё раз." };
  }

  try {
    const settings = saveTelegramSettings({ enabled, chatId, token: token ?? "", clearToken }, revision);
    revalidatePath("/admin/settings");
    return {
      ok: true,
      message: "Настройки Telegram сохранены.",
      settings: { chatId: settings.chatId, enabled: settings.enabled, hasToken: settings.hasToken, revision: settings.revision },
    };
  } catch (error) {
    if (error instanceof TelegramSettingsError) return { ok: false, message: error.message };
    console.error("Не удалось сохранить настройки Telegram.");
    return { ok: false, message: "Не удалось сохранить настройки. Попробуйте ещё раз." };
  }
}

export async function testTelegramSettings(): Promise<TestResult> {
  await requireAdminAction();

  try {
    return await sendTelegramTest();
  } catch {
    console.error("Не удалось отправить тестовое уведомление Telegram.");
    return { ok: false, message: "Не удалось отправить тестовое сообщение. Попробуйте ещё раз." };
  }
}
