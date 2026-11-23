"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAction } from "@/lib/admin-auth";
import { CatalogError, saveManagedTour, unpublishManagedTour } from "@/lib/catalog-store";
import { storageErrorCode } from "@/lib/storage.mjs";
import type { AdminTourState } from "@/components/admin-tour-form";

function readTourFields(data: FormData, existingSlug: string | null) {
  const optionDays = data.getAll("optionDays");
  const optionPrices = data.getAll("optionPrices");
  const optionGuides = data.getAll("optionGuides");
  const stepTitles = data.getAll("stepTitles");
  const stepDescriptions = data.getAll("stepDescriptions");
  const includes = data.get("includes");

  return {
    slug: existingSlug ?? data.get("slug"),
    title: data.get("title"),
    region: data.get("region"),
    category: data.get("category"),
    summary: data.get("summary"),
    description: data.get("description"),
    departure: data.get("departure"),
    groupLimit: data.get("groupLimit"),
    weekdays: data.getAll("weekdays"),
    startDate: data.get("startDate"),
    endDate: data.get("endDate"),
    image: data.get("image"),
    gallery: data.getAll("gallery"),
    routePoints: data.get("routePoints"),
    includes: typeof includes === "string" ? includes.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [],
    options: data.getAll("optionIds").map((id, index) => ({
      id, days: optionDays[index], pricePerPerson: optionPrices[index], guidePerGroup: optionGuides[index],
    })),
    program: data.getAll("stepTimes").map((time, index) => ({
      time, title: stepTitles[index], description: stepDescriptions[index],
    })),
  };
}

export async function saveTourAction(
  existingSlug: string | null,
  previous: AdminTourState,
  data: FormData,
): Promise<AdminTourState> {
  await requireAdminAction();

  const intent = data.get("intent");
  if (intent !== "draft" && intent !== "publish" && intent !== "unpublish") {
    return { ...previous, notice: null, error: "Выберите действие с туром." };
  }

  const rawRevision = data.get("revision");
  const revision = typeof rawRevision === "string" && /^[1-9]\d*$/.test(rawRevision) ? Number(rawRevision) : null;
  let saved;
  try {
    const slug = data.get("slug");
    if (!existingSlug && typeof slug === "string" && slug.trim() === "new") {
      throw new CatalogError("Адрес «new» используется страницей создания тура. Выберите другой адрес.");
    }
    if (existingSlug && !Number.isSafeInteger(revision)) {
      throw new CatalogError("Обновите страницу и повторите действие.");
    }
    if (intent === "unpublish") {
      if (!existingSlug || revision === null) throw new CatalogError("Сначала сохраните тур.");
      saved = unpublishManagedTour(existingSlug, revision);
    } else {
      saved = saveManagedTour(readTourFields(data, existingSlug), existingSlug ? revision : null, intent === "publish");
    }
  } catch (cause) {
    if (!(cause instanceof CatalogError)) console.error("Не удалось сохранить тур.", storageErrorCode(cause));
    return {
      ...previous,
      notice: null,
      error: cause instanceof CatalogError ? cause.message : "Не удалось сохранить изменения. Попробуйте ещё раз.",
    };
  }

  const slug = saved.draft.slug;
  revalidatePath("/admin/tours");
  revalidatePath(`/admin/tours/${slug}`);
  if (intent !== "draft") {
    revalidatePath("/");
    revalidatePath("/favorites");
    revalidatePath(`/tours/${slug}`);
    revalidatePath(`/tours/${slug}/book`);
    revalidatePath("/sitemap.xml");
  }

  if (!existingSlug) redirect(`/admin/tours/${slug}`);

  return {
    revision: saved.revision,
    publishedRevision: saved.publishedRevision,
    notice: intent === "publish" ? "Тур опубликован."
      : intent === "unpublish" ? "Тур снят с публикации. Черновик сохранён."
        : "Черновик сохранён.",
    error: null,
  };
}
