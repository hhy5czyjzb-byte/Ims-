"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { optionalDate, optionalText, parseForm, requiredText } from "@/lib/forms";
import { parseSlideData, slideInputSchema, safeSlideData, type ContentData, type SlideLayout } from "@/lib/review-model";
import { SLIDE_PRESETS, defaultReviewSlides } from "@/lib/review-presets";
import { refreshElements } from "@/lib/review-sources";

const MAX_IMAGE = 4 * 1024 * 1024;

function sniffImage(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  return null;
}

async function editableReview(id: string) {
  const r = await prisma.managementReview.findUnique({ where: { id }, select: { id: true, status: true, title: true, year: true } });
  if (!r) throw new UserError("Directiebeoordeling niet gevonden.");
  if (r.status === "APPROVED") throw new UserError("Deze directiebeoordeling is vastgesteld en kan niet meer worden gewijzigd. Maak een nieuwe versie.");
  return r;
}

function revalidate(id?: string) {
  revalidatePath("/directiebeoordeling");
  if (id) revalidatePath(`/directiebeoordeling/${id}`, "layout");
}

const metaSchema = z.object({
  title: requiredText(200),
  year: z.coerce.number().int().min(2000).max(2100),
  meetingDate: optionalDate,
  footerText: optionalText,
  notes: optionalText,
});

/** Nieuwe directiebeoordeling: leeg (standaardopbouw met IMS-dia's) of als kopie van een eerdere. */
export async function createReview(formData: FormData): Promise<ActionResult> {
  let newId = "";
  const result = await safeAction(async () => {
    const user = await requirePermission("review.edit");
    const { basedOnId, ...meta } = parseForm(metaSchema.extend({ basedOnId: optionalText }), formData);
    const base = basedOnId ? await prisma.managementReview.findUnique({ where: { id: basedOnId }, include: { slides: { orderBy: { order: "asc" } } } }) : null;
    // Zonder basis: logo en fotostrook van de laatste review hergebruiken (huisstijl blijft gelijk).
    const look = base ?? (await prisma.managementReview.findFirst({ orderBy: { createdAt: "desc" }, select: { logoImageId: true, stripImageId: true } }));
    const review = await prisma.managementReview.create({
      data: {
        ...meta,
        footerText: meta.footerText ?? base?.footerText ?? `${meta.title}`,
        logoImageId: look?.logoImageId,
        stripImageId: look?.stripImageId,
        basedOnId: base?.id,
        createdById: user.id,
        slides: {
          create: base
            ? base.slides.map((s, i) => ({
                order: i,
                layout: s.layout,
                kicker: s.kicker,
                title: s.title,
                data: s.data as Prisma.InputJsonValue,
                imageId: s.imageId,
                hidden: s.hidden,
              }))
            : defaultReviewSlides(meta.year).map((s, i) => ({
                order: i,
                layout: s.layout,
                kicker: s.kicker,
                title: s.title,
                data: s.data as Prisma.InputJsonValue,
              })),
        },
      },
    });
    if (!base) await refreshReviewData(review.id, meta.year);
    await logAudit({
      user,
      action: "CREATE",
      entityType: "ManagementReview",
      entityId: review.id,
      summary: `Directiebeoordeling "${meta.title}" aangemaakt${base ? ` (kopie van "${base.title}")` : ""}`,
    });
    newId = review.id;
    revalidate();
  });
  if (newId) redirect(`/directiebeoordeling/${newId}`);
  return result;
}

export async function updateReviewMeta(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("review.edit");
    await editableReview(id);
    const meta = parseForm(metaSchema, formData);
    await prisma.managementReview.update({ where: { id }, data: meta });
    await logAudit({ user, action: "UPDATE", entityType: "ManagementReview", entityId: id, summary: `Gegevens directiebeoordeling "${meta.title}" gewijzigd` });
    revalidate(id);
  });
}

export async function deleteReview(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("review.edit");
    const r = await editableReview(id);
    await prisma.managementReview.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "ManagementReview", entityId: id, summary: `Directiebeoordeling "${r.title}" verwijderd` });
    revalidate();
    redirect("/directiebeoordeling");
  });
}

/** Vaststellen door de directie (of QHSE): daarna alleen-lezen, als bewijs. */
export async function approveReview(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("review.approve");
    const r = await editableReview(id);
    const { meetingDate } = parseForm(z.object({ meetingDate: optionalDate }), formData);
    await prisma.managementReview.update({
      where: { id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedById: user.id, ...(meetingDate ? { meetingDate } : {}) },
    });
    await logAudit({ user, action: "UPDATE", entityType: "ManagementReview", entityId: id, summary: `Directiebeoordeling "${r.title}" vastgesteld` });
    revalidate(id);
  });
}

/** Vaststelling intrekken (alleen QHSE), bijv. bij een fout direct na vaststellen. */
export async function reopenReview(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("review.edit");
    const r = await prisma.managementReview.findUnique({ where: { id } });
    if (!r) throw new UserError("Directiebeoordeling niet gevonden.");
    await prisma.managementReview.update({ where: { id }, data: { status: "CONCEPT", approvedAt: null, approvedById: null } });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "ManagementReview",
      entityId: id,
      summary: `Vaststelling directiebeoordeling "${r.title}" ingetrokken`,
    });
    revalidate(id);
  });
}

// ── Dia's ────────────────────────────────────────────────────

const slideSaveSchema = z.object({
  kicker: z.string().max(200).nullish(),
  title: z.string().max(300),
  imageId: z.string().max(60).nullish(),
  hidden: z.boolean().optional(),
  data: z.unknown(),
});

/** Dia opslaan vanuit de editor (JSON). */
export async function saveSlide(slideId: string, input: unknown): Promise<{ error?: string; updatedAt?: string }> {
  try {
    const user = await requirePermission("review.edit");
    const slide = await prisma.reviewSlide.findUnique({ where: { id: slideId } });
    if (!slide) throw new UserError("Dia niet gevonden.");
    await editableReview(slide.reviewId);
    const p = slideSaveSchema.safeParse(input);
    if (!p.success) throw new UserError("Ongeldige invoer.");
    let data;
    try {
      data = parseSlideData(slide.layout as SlideLayout, p.data.data);
    } catch (e) {
      console.error("[review] ongeldige dia", e);
      throw new UserError("De dia bevat ongeldige gegevens (controleer getallen in tabellen en grafieken).");
    }
    const updated = await prisma.reviewSlide.update({
      where: { id: slideId },
      data: {
        kicker: p.data.kicker ?? null,
        title: p.data.title,
        imageId: p.data.imageId ?? null,
        hidden: p.data.hidden ?? false,
        data: data as Prisma.InputJsonValue,
      },
    });
    await logAudit({ user, action: "UPDATE", entityType: "ReviewSlide", entityId: slideId, summary: `Dia "${p.data.title}" gewijzigd` });
    revalidate(slide.reviewId);
    return { updatedAt: updated.updatedAt.toISOString() };
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    console.error("[review] dia opslaan mislukt", err);
    return { error: "Opslaan mislukt. Probeer het opnieuw." };
  }
}

export async function addSlide(reviewId: string, formData: FormData): Promise<ActionResult> {
  let target = "";
  const result = await safeAction(async () => {
    const user = await requirePermission("review.edit");
    const r = await editableReview(reviewId);
    const { preset, after } = parseForm(z.object({ preset: requiredText(40), after: z.coerce.number().int().min(-1).default(-1) }), formData);
    const p = SLIDE_PRESETS.find((x) => x.key === preset);
    if (!p) throw new UserError("Kies een soort dia.");
    const count = await prisma.reviewSlide.count({ where: { reviewId } });
    const order = after < 0 || after >= count ? count : after + 1;
    let data = p.data();
    if (p.layout === "CONTENT" && p.ims) data = { elements: (await refreshElements((data as ContentData).elements, r.year)).elements };
    await prisma.$transaction([
      prisma.reviewSlide.updateMany({ where: { reviewId, order: { gte: order } }, data: { order: { increment: 1 } } }),
      prisma.reviewSlide.create({ data: { reviewId, order, layout: p.layout, title: p.title, data: data as Prisma.InputJsonValue } }),
    ]);
    const created = await prisma.reviewSlide.findFirst({ where: { reviewId, order } });
    await logAudit({ user, action: "CREATE", entityType: "ReviewSlide", entityId: created?.id, summary: `Dia "${p.label}" toegevoegd aan "${r.title}"` });
    target = created ? `/directiebeoordeling/${reviewId}/dia/${created.id}` : "";
    revalidate(reviewId);
  });
  if (target) redirect(target);
  return result;
}

async function renumber(reviewId: string) {
  const slides = await prisma.reviewSlide.findMany({ where: { reviewId }, orderBy: { order: "asc" }, select: { id: true } });
  await prisma.$transaction(slides.map((s, i) => prisma.reviewSlide.update({ where: { id: s.id }, data: { order: i } })));
}

export async function moveSlide(slideId: string, direction: "up" | "down"): Promise<ActionResult> {
  return safeAction(async () => {
    await requirePermission("review.edit");
    const s = await prisma.reviewSlide.findUnique({ where: { id: slideId } });
    if (!s) throw new UserError("Dia niet gevonden.");
    await editableReview(s.reviewId);
    await renumber(s.reviewId);
    const fresh = await prisma.reviewSlide.findUniqueOrThrow({ where: { id: slideId } });
    const other = await prisma.reviewSlide.findFirst({ where: { reviewId: s.reviewId, order: direction === "up" ? fresh.order - 1 : fresh.order + 1 } });
    if (!other) return;
    await prisma.$transaction([
      prisma.reviewSlide.update({ where: { id: fresh.id }, data: { order: other.order } }),
      prisma.reviewSlide.update({ where: { id: other.id }, data: { order: fresh.order } }),
    ]);
    revalidate(s.reviewId);
  });
}

export async function duplicateSlide(slideId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("review.edit");
    const s = await prisma.reviewSlide.findUnique({ where: { id: slideId } });
    if (!s) throw new UserError("Dia niet gevonden.");
    await editableReview(s.reviewId);
    await prisma.$transaction([
      prisma.reviewSlide.updateMany({ where: { reviewId: s.reviewId, order: { gt: s.order } }, data: { order: { increment: 1 } } }),
      prisma.reviewSlide.create({
        data: {
          reviewId: s.reviewId,
          order: s.order + 1,
          layout: s.layout,
          kicker: s.kicker,
          title: `${s.title} (kopie)`,
          data: s.data as Prisma.InputJsonValue,
          imageId: s.imageId,
          hidden: s.hidden,
        },
      }),
    ]);
    await logAudit({ user, action: "CREATE", entityType: "ReviewSlide", entityId: s.id, summary: `Dia "${s.title}" gekopieerd` });
    revalidate(s.reviewId);
  });
}

export async function toggleSlideHidden(slideId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("review.edit");
    const s = await prisma.reviewSlide.findUnique({ where: { id: slideId } });
    if (!s) throw new UserError("Dia niet gevonden.");
    await editableReview(s.reviewId);
    await prisma.reviewSlide.update({ where: { id: slideId }, data: { hidden: !s.hidden } });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "ReviewSlide",
      entityId: s.id,
      summary: `Dia "${s.title}" ${s.hidden ? "weer getoond" : "verborgen"}`,
    });
    revalidate(s.reviewId);
  });
}

export async function deleteSlide(slideId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("review.edit");
    const s = await prisma.reviewSlide.findUnique({ where: { id: slideId } });
    if (!s) throw new UserError("Dia niet gevonden.");
    await editableReview(s.reviewId);
    await prisma.reviewSlide.delete({ where: { id: slideId } });
    await renumber(s.reviewId);
    await logAudit({ user, action: "DELETE", entityType: "ReviewSlide", entityId: s.id, summary: `Dia "${s.title}" verwijderd` });
    revalidate(s.reviewId);
    redirect(`/directiebeoordeling/${s.reviewId}`);
  });
}

async function refreshReviewData(reviewId: string, year: number): Promise<number> {
  const slides = await prisma.reviewSlide.findMany({ where: { reviewId, layout: "CONTENT" } });
  const cache = new Map<string, unknown>();
  let total = 0;
  for (const s of slides) {
    const d = safeSlideData("CONTENT", s.data) as ContentData;
    const { elements, changed } = await refreshElements(d.elements, year, cache);
    if (changed) {
      total += changed;
      await prisma.reviewSlide.update({ where: { id: s.id }, data: { data: { elements } as Prisma.InputJsonValue } });
    }
  }
  return total;
}

/** Alle elementen met een IMS-bron opnieuw vullen (CO2, acties, risico's, meldingen, audits, compliance). */
export async function refreshFromIms(reviewId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("review.edit");
    const r = await editableReview(reviewId);
    const n = await refreshReviewData(reviewId, r.year);
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "ManagementReview",
      entityId: reviewId,
      summary: `Cijfers uit het IMS bijgewerkt in "${r.title}" (${n} element(en))`,
    });
    revalidate(reviewId);
  });
}

// ── Afbeeldingen en import van het PowerPoint-template ───────

/** Afbeelding opslaan (foto, logo, fotostrook, icoon); bestaande gelijke afbeelding wordt hergebruikt. */
export async function uploadReviewImage(formData: FormData): Promise<{ error?: string; id?: string }> {
  try {
    await requirePermission("review.edit");
    const file = formData.get("image");
    const role = String(formData.get("role") ?? "photo");
    if (!["photo", "logo", "strip", "icon"].includes(role)) return { error: "Onbekende soort afbeelding." };
    if (!(file instanceof File) || file.size === 0) return { error: "Lege afbeelding." };
    if (file.size > MAX_IMAGE) return { error: "Afbeelding groter dan 4 MB." };
    const data = new Uint8Array(await file.arrayBuffer());
    const mime = sniffImage(data);
    if (!mime) return { error: "Geen PNG-, JPEG-, GIF- of WebP-afbeelding." };
    const hash = createHash("sha256").update(data).digest("hex");
    const width = Number(formData.get("width")) || null;
    const height = Number(formData.get("height")) || null;
    const name = String(formData.get("name") ?? "").slice(0, 200) || null;
    const img = await prisma.reviewImage.upsert({ where: { hash }, create: { hash, role, mime, data, width, height, name }, update: {}, select: { id: true } });
    return { id: img.id };
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    console.error("[review] afbeelding opslaan mislukt", err);
    return { error: "Afbeelding opslaan mislukt." };
  }
}

const importSchema = z.object({
  title: z.string().trim().min(1).max(200),
  year: z.number().int().min(2000).max(2100),
  footerText: z.string().max(300).nullish(),
  logoImageId: z.string().max(60).nullish(),
  stripImageId: z.string().max(60).nullish(),
  slides: z.array(slideInputSchema).min(1).max(150),
});

/** Ingelezen template opslaan als nieuwe directiebeoordeling (concept). */
export async function importReview(input: unknown): Promise<{ error?: string; id?: string; skipped?: number }> {
  try {
    const user = await requirePermission("review.edit");
    const p = importSchema.safeParse(input);
    if (!p.success) return { error: "De ingelezen presentatie is ongeldig of te groot." };
    let skipped = 0;
    const slides = p.data.slides.flatMap((s) => {
      try {
        return [{ ...s, data: parseSlideData(s.layout, s.data) }];
      } catch (e) {
        console.error("[review] dia overgeslagen", e);
        skipped++;
        return [];
      }
    });
    const review = await prisma.managementReview.create({
      data: {
        title: p.data.title,
        year: p.data.year,
        footerText: p.data.footerText ?? null,
        logoImageId: p.data.logoImageId ?? null,
        stripImageId: p.data.stripImageId ?? null,
        createdById: user.id,
        slides: {
          create: slides.map((s, i) => ({
            order: i,
            layout: s.layout,
            kicker: s.kicker ?? null,
            title: s.title,
            imageId: s.imageId ?? null,
            data: s.data as Prisma.InputJsonValue,
          })),
        },
      },
    });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "ManagementReview",
      entityId: review.id,
      summary: `Directiebeoordeling "${p.data.title}" ingelezen uit PowerPoint (${slides.length} dia's)`,
    });
    revalidate();
    return { id: review.id, skipped };
  } catch (err) {
    console.error("[review] import mislukt", err);
    return { error: "Opslaan van de ingelezen presentatie mislukt." };
  }
}

/** Gegevens voor de PowerPoint-export in de browser (zonder afbeeldingen; die komen via de afbeeldingsroute). */
export async function getReviewExport(id: string) {
  await requireUser();
  const r = await prisma.managementReview.findUnique({ where: { id }, include: { slides: { orderBy: { order: "asc" } } } });
  if (!r) return null;
  return {
    title: r.title,
    logoImageId: r.logoImageId,
    stripImageId: r.stripImageId,
    footerText: r.footerText,
    slides: r.slides.map((s) => ({ layout: s.layout, kicker: s.kicker, title: s.title, imageId: s.imageId, hidden: s.hidden, data: s.data })),
  };
}

const reviewActionSchema = z.object({
  title: requiredText(300),
  ownerId: optionalText,
  ownerText: optionalText,
  deadline: optionalDate,
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});

/** Actie (besluit) vanuit de directiebeoordeling; komt in de actielijst met bron Directiebeoordeling. */
export async function createReviewAction(reviewId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("review.edit");
    const r = await prisma.managementReview.findUnique({ where: { id: reviewId }, select: { id: true, title: true } });
    if (!r) throw new UserError("Directiebeoordeling niet gevonden.");
    const data = parseForm(reviewActionSchema, formData);
    const exists = await prisma.action.findFirst({ where: { managementReviewId: reviewId, title: data.title, status: { not: "CANCELLED" } } });
    if (exists) throw new UserError(`Er is al een actie "${data.title}" (#${exists.number}).`);
    const action = await prisma.action.create({
      data: { ...data, source: "MANAGEMENT_REVIEW", kind: "IMPROVEMENT", managementReviewId: reviewId, createdById: user.id },
    });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Action",
      entityId: action.id,
      summary: `Actie #${action.number} "${action.title}" aangemaakt vanuit "${r.title}"`,
    });
    revalidatePath("/acties");
    revalidate(reviewId);
  });
}
