"use server";

import { redirect } from "next/navigation";
import { adminActionOrigin, endAdminSession, startAdminSession } from "@/lib/admin-auth";
import { storageErrorCode } from "@/lib/storage.mjs";

export async function loginAction(_previous: string | null, form: FormData): Promise<string | null> {
  const origin = await adminActionOrigin();
  if (!origin) return "Откройте админку по HTTPS или через localhost и повторите вход.";

  const password = form.get("password");
  if (typeof password !== "string") return "Введите пароль администратора.";

  let result: Awaited<ReturnType<typeof startAdminSession>>;
  try {
    result = await startAdminSession(password, origin);
  } catch (error) {
    console.error("Не удалось выполнить вход в админку.", storageErrorCode(error));
    return "Вход временно недоступен. Повторите попытку позже.";
  }

  if (result === "ok") redirect("/admin/tours");
  if (result === "limited") return "Слишком много попыток. Повторите вход через 10 минут.";
  if (result === "unconfigured") return "Пароль администратора ещё не установлен. Задайте его на сервере.";
  return "Неверный пароль.";
}

export async function logoutAction() {
  const origin = await adminActionOrigin();
  if (!origin) throw new Error("Запрос отклонён.");

  await endAdminSession(origin);
  redirect("/admin/login");
}
