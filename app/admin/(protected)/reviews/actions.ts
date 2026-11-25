"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect, RedirectType } from "next/navigation";
import { requireAdminAction } from "@/lib/admin-auth";
import { deleteReview, isReviewId, readReviewStatus, setReviewStatus } from "@/lib/review-store";
import { storageErrorCode } from "@/lib/storage.mjs";

export async function moderateReview(form: FormData) {
  await requireAdminAction();
  const id = form.get("id");
  const intent = form.get("intent");
  const status = readReviewStatus(form.get("status")) ?? "pending";

  if (!isReviewId(id)) notFound();

  let slug: string | null = null;
  let failed = false;
  try {
    if (intent === "approve") slug = setReviewStatus(id, "approved");
    else if (intent === "reject") slug = setReviewStatus(id, "rejected");
    else if (intent === "delete") slug = deleteReview(id);
  } catch (error) {
    console.error("Не удалось обновить отзыв.", storageErrorCode(error));
    failed = true;
  }

  if (slug) {
    revalidatePath("/admin/reviews");
    revalidatePath("/");
    revalidatePath("/favorites");
    revalidatePath(`/tours/${slug}`);
  }
  redirect(`/admin/reviews?status=${status}${failed ? "&error=storage" : ""}`, RedirectType.replace);
}
