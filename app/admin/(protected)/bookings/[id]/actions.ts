"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect, RedirectType } from "next/navigation";
import { requireAdminAction } from "@/lib/admin-auth";
import { inboxHref, isBookingId, readBookingFilters, transitionBooking } from "@/lib/admin-booking-store";
import { storageErrorCode } from "@/lib/storage.mjs";

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
