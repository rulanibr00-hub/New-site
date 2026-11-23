"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect, RedirectType } from "next/navigation";
import { after } from "next/server";
import { requireAdminAction } from "@/lib/admin-auth";
import { inboxHref, isBookingId, readBookingFilters, transitionBooking } from "@/lib/admin-booking-store";
import { storageErrorCode } from "@/lib/storage.mjs";
import { triggerTelegramDelivery } from "@/lib/telegram-notifications";
import { retryTelegramBooking } from "@/lib/telegram-store";

export async function changeBookingStatus(form: FormData) {
  await requireAdminAction();
  const id = form.get("id");
  const target = form.get("target");
  const filters = readBookingFilters(form.get("status"), form.get("after"));

  if (!isBookingId(id)) notFound();
  if (target !== "confirmed" && target !== "declined") {
    redirect(inboxHref(filters, id, "invalid"), RedirectType.replace);
  }

  let result: ReturnType<typeof transitionBooking> | "storage";
  try {
    result = transitionBooking(id, target);
  } catch (error) {
    console.error("Не удалось обновить статус заявки.", storageErrorCode(error));
    result = "storage";
  }

  if (result === "missing") notFound();
  revalidatePath(inboxHref());
  revalidatePath(inboxHref({}, id));
  redirect(inboxHref(filters, id, result === "saved" ? undefined : result), RedirectType.replace);
}

export async function retryBookingTelegram(form: FormData) {
  await requireAdminAction();
  const id = form.get("id");
  if (!isBookingId(id)) notFound();
  const filters = readBookingFilters(form.get("status"), form.get("after"));

  let error: "telegram_unavailable" | "telegram_storage" | undefined;
  try {
    if (!retryTelegramBooking(id)) error = "telegram_unavailable";
  } catch (cause) {
    console.error("Не удалось вернуть уведомление Telegram в очередь.", storageErrorCode(cause));
    error = "telegram_storage";
  }
  if (!error) {
    after(triggerTelegramDelivery);
    revalidatePath("/admin/settings");
  }
  revalidatePath(inboxHref({}, id));
  redirect(inboxHref(filters, id, error), RedirectType.replace);
}
