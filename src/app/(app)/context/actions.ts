"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ContextFactorKind, ObligationCharacter, type Prisma } from "@prisma/client";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { addMonths } from "@/lib/compliance";
import { optionalDate, optionalText, optionalUrl, parseForm, requiredText } from "@/lib/forms";
import { matchObligationStakeholders, parseContextHtml, sanitizeContextHtml } from "@/lib/context-import";

function revalidateContext() {
  revalidatePath("/context", "layout");
  revalidatePath("/");
}

// ── Inlezen van een nieuwe versie (Word) ──────────────────────
// Het Word-bestand wordt in de browser omgezet (mammoth); daarna gaan de afbeeldingen één voor één en de tekst apart naar de
// server. Zo blijft elk verzoek klein (Vercel: max. 4,5 MB). De server vertrouwt de browser niet: afbeeldingen worden op
// inhoud gecontroleerd en de HTML wordt opgeschoond.

const MAX_IMAGE_UPLOAD = 4 * 1024 * 1024;

/** Bestandstype op basis van de inhoud (niet van wat de browser zegt). */
function sniffImage(b: Uint8Array): string | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 6 && String.fromCharCode(...b.subarray(0, 4)) === "GIF8") return "image/gif";
  if (b.length > 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

async function loadUpload(analysisId: string, userId: string) {
  const a = await prisma.contextAnalysis.findUnique({ where: { id: analysisId }, include: { _count: { select: { sections: true } } } });
  if (!a || a.status !== "CONCEPT" || a.uploadedById !== userId || a._count.sections > 0)
    throw new UserError("Deze upload is niet (meer) open. Begin opnieuw.");
  return a;
}

/** Stap 1: lege conceptversie aanmaken. */
export async function beginContextUpload(fileName: string): Promise<{ error?: string; id?: string }> {
  try {
    const user = await requirePermission("context.edit");
    const name = String(fileName ?? "").slice(0, 300);
    if (!/\.docx$/i.test(name)) return { error: "Alleen Word-bestanden (.docx) kunnen worden ingelezen." };
    const a = await prisma.contextAnalysis.create({ data: { title: name.replace(/\.docx$/i, ""), fileName: name, status: "CONCEPT", uploadedById: user.id } });
    return { id: a.id };
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    console.error("[context] upload starten mislukt", err);
    return { error: "Inlezen kon niet worden gestart." };
  }
}

/** Stap 2: één afbeelding opslaan; geeft het adres terug. */
export async function addUploadImage(analysisId: string, formData: FormData): Promise<{ error?: string; src?: string }> {
  try {
    const user = await requirePermission("context.edit");
    await loadUpload(analysisId, user.id);
    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) return { error: "Lege afbeelding." };
    if (file.size > MAX_IMAGE_UPLOAD) return { error: "Afbeelding groter dan 4 MB." };
    const data = new Uint8Array(await file.arrayBuffer());
    const contentType = sniffImage(data);
    if (!contentType) return { error: "Geen PNG-, JPEG-, GIF- of WebP-afbeelding." };
    const id = randomUUID();
    const alt = String(formData.get("alt") ?? "").slice(0, 300) || null;
    await prisma.contextImage.create({ data: { id, analysisId, contentType, data, size: data.length, alt } });
    return { src: `/context/afbeelding/${id}` };
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    console.error("[context] afbeelding opslaan mislukt", err);
    return { error: "Afbeelding opslaan mislukt." };
  }
}

const finishSchema = z.object({
  html: z.string().min(1, "Het document is leeg.").max(4_000_000, "Het document is te groot."),
  approvedAt: optionalDate,
  sharepointUrl: optionalUrl,
  skippedImages: z.coerce.number().int().min(0).max(10_000).default(0),
});

/**
 * Stap 3: tekst verwerken. Opdelen in delen en paragrafen, opschonen, en contextfactoren, stakeholders en verplichtingen
 * bijwerken op naam (bestaande koppelingen blijven staan; niets wordt verwijderd).
 */
export async function finishContextUpload(analysisId: string, formData: FormData): Promise<ActionResult> {
  const result = await safeAction(async () => {
    const user = await requirePermission("context.edit");
    const upload = await loadUpload(analysisId, user.id);
    const { html, approvedAt, sharepointUrl, skippedImages } = parseForm(finishSchema, formData);
    if (approvedAt && approvedAt.getTime() > Date.now()) throw new UserError("De datum van vaststelling kan niet in de toekomst liggen.");
    const parsed = parseContextHtml(html);
    if (parsed.sections.length < 2) throw new UserError("Geen hoofdstukken gevonden. Gebruik de kopstijlen van Word (Kop 1 en Kop 2).");
    const imageCount = await prisma.contextImage.count({ where: { analysisId } });

    await prisma.$transaction(
      async (tx) => {
        if (approvedAt) await tx.contextAnalysis.updateMany({ where: { status: "APPROVED" }, data: { status: "SUPERSEDED" } });
        await tx.contextAnalysis.update({
          where: { id: analysisId },
          data: {
            title: parsed.meta.title ?? upload.title,
            versionLabel: parsed.meta.versionLabel,
            sharepointUrl,
            ownerText: parsed.meta.ownerText,
            reviewCycle: parsed.meta.reviewCycle,
            approvedByText: parsed.meta.approvedByText,
            status: approvedAt ? "APPROVED" : "CONCEPT",
            approvedAt,
            approvedById: approvedAt ? user.id : null,
            nextReviewDate: approvedAt ? addMonths(approvedAt, 12) : null,
          },
        });
        await tx.contextSection.createMany({
          data: parsed.sections.map((s, i) => ({
            analysisId,
            part: s.part,
            partTitle: s.partTitle,
            partSubtitle: s.partSubtitle,
            partKern: s.partKern,
            number: s.number,
            title: s.title,
            anchor: s.anchor,
            html: sanitizeContextHtml(s.html),
            sortOrder: i,
          })),
        });
      },
      { timeout: 60_000 },
    );

    let factorsNew = 0;
    let stakeholdersNew = 0;
    let obligationsNew = 0;
    for (const [i, f] of parsed.factors.entries()) {
      const existing = await prisma.contextFactor.findUnique({ where: { name: f.name } });
      const data = {
        importance: f.importance,
        character: f.character,
        ambition: f.ambition,
        sortOrder: i,
        ...(f.kind ? { kind: f.kind } : {}),
        ...(f.sectionNumber ? { sectionNumber: f.sectionNumber } : {}),
      };
      if (existing) await prisma.contextFactor.update({ where: { id: existing.id }, data });
      else {
        await prisma.contextFactor.create({ data: { name: f.name, ...data } });
        factorsNew++;
      }
    }
    for (const [i, s] of parsed.stakeholders.entries()) {
      const data = { expectations: s.expectations, influenceLevel: s.influenceLevel, howAddressed: s.howAddressed, sortOrder: i };
      const existing = await prisma.stakeholder.findUnique({ where: { name: s.name } });
      if (existing) await prisma.stakeholder.update({ where: { id: existing.id }, data });
      else {
        await prisma.stakeholder.create({ data: { name: s.name, type: /^(medewerkers|directie|or\b|or\/)/i.test(s.name) ? "INTERNAL" : "EXTERNAL", ...data } });
        stakeholdersNew++;
      }
    }
    const allStakeholders = await prisma.stakeholder.findMany({ select: { id: true, name: true } });
    for (const [i, o] of parsed.obligations.entries()) {
      const existing = await prisma.stakeholderObligation.findUnique({
        where: { stakeholderText_obligation: { stakeholderText: o.stakeholderText, obligation: o.obligation } },
      });
      if (existing) await prisma.stakeholderObligation.update({ where: { id: existing.id }, data: { character: o.character, sortOrder: i } });
      else {
        const ids = matchObligationStakeholders(o.stakeholderText, allStakeholders);
        await prisma.stakeholderObligation.create({
          data: {
            stakeholderText: o.stakeholderText,
            obligation: o.obligation,
            character: o.character,
            sortOrder: i,
            stakeholders: { connect: ids.map((id) => ({ id })) },
          },
        });
        obligationsNew++;
      }
    }

    await logAudit({
      user,
      action: "CREATE",
      entityType: "ContextAnalysis",
      entityId: analysisId,
      summary: `Context- en stakeholderanalyse ingelezen (${upload.fileName}): ${parsed.sections.length} paragrafen, ${imageCount} afbeeldingen; ${parsed.factors.length} contextfactoren (${factorsNew} nieuw), ${parsed.stakeholders.length} stakeholders (${stakeholdersNew} nieuw), ${parsed.obligations.length} verplichtingen (${obligationsNew} nieuw)${skippedImages ? `; ${skippedImages} afbeelding(en) overgeslagen` : ""}`,
    });
    revalidateContext();
  });
  if (result?.error) return result;
  redirect(`/context?versie=${analysisId}`);
}

const approveSchema = z.object({ approvedAt: optionalDate, approvedByText: optionalText });

/** Versie vaststellen (directie of QHSE namens de directie); de vorige vastgestelde versie wordt 'vervangen'. */
export async function approveContextAnalysis(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("context.approve");
    const { approvedAt, approvedByText } = parseForm(approveSchema, formData);
    if (!approvedAt) throw new UserError("Vul de datum van vaststelling in.");
    if (approvedAt.getTime() > Date.now()) throw new UserError("De datum van vaststelling kan niet in de toekomst liggen.");
    const a = await prisma.contextAnalysis.findUnique({ where: { id } });
    if (!a) throw new UserError("Versie niet gevonden.");
    await prisma.$transaction([
      prisma.contextAnalysis.updateMany({ where: { status: "APPROVED", id: { not: id } }, data: { status: "SUPERSEDED" } }),
      prisma.contextAnalysis.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedAt,
          approvedById: user.id,
          approvedByText: approvedByText ?? a.approvedByText,
          nextReviewDate: addMonths(approvedAt, 12),
        },
      }),
    ]);
    await logAudit({ user, action: "UPDATE", entityType: "ContextAnalysis", entityId: id, summary: `Analyse ${a.versionLabel ?? a.fileName} vastgesteld` });
    revalidateContext();
  });
}

export async function updateAnalysisMeta(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("context.edit");
    const data = parseForm(z.object({ sharepointUrl: optionalUrl, nextReviewDate: optionalDate, versionLabel: optionalText }), formData);
    await prisma.contextAnalysis.update({
      where: { id },
      data: { sharepointUrl: data.sharepointUrl ?? null, nextReviewDate: data.nextReviewDate ?? null, versionLabel: data.versionLabel ?? null },
    });
    await logAudit({ user, action: "UPDATE", entityType: "ContextAnalysis", entityId: id, summary: "Gegevens van de analyse gewijzigd" });
    revalidateContext();
  });
}

export async function deleteContextAnalysis(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("context.edit");
    const a = await prisma.contextAnalysis.findUnique({ where: { id } });
    if (!a) throw new UserError("Versie niet gevonden.");
    if (a.status === "APPROVED") throw new UserError("Een vastgestelde versie kun je niet verwijderen; lees een nieuwe versie in en stel die vast.");
    await prisma.contextAnalysis.delete({ where: { id } });
    await logAudit({
      user,
      action: "DELETE",
      entityType: "ContextAnalysis",
      entityId: id,
      summary: `Versie ${a.versionLabel ?? a.fileName} (${a.status === "CONCEPT" ? "concept" : "vervangen"}) verwijderd`,
    });
    revalidateContext();
  });
}

// ── Contextfactoren ───────────────────────────────────────────

const factorSchema = z.object({
  name: requiredText(200),
  kind: z.enum(ContextFactorKind),
  importance: optionalText,
  character: optionalText,
  ambition: optionalText,
  sectionNumber: optionalText,
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

export async function createFactor(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("context.edit");
    const data = parseForm(factorSchema, formData);
    const f = await prisma.contextFactor.create({ data });
    await logAudit({ user, action: "CREATE", entityType: "ContextFactor", entityId: f.id, summary: `Contextfactor "${f.name}" toegevoegd` });
    revalidateContext();
  });
}

/** Wijzigen; bij een nieuwe naam gaan de koppelingen in het risico- en kansenregister en het MAR mee. */
export async function updateFactor(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("context.edit");
    const data = parseForm(factorSchema.extend({ active: z.literal("on").optional() }), formData);
    const { active, ...rest } = data;
    const old = await prisma.contextFactor.findUnique({ where: { id } });
    if (!old) throw new UserError("Contextfactor niet gevonden.");
    const ops: Prisma.PrismaPromise<unknown>[] = [prisma.contextFactor.update({ where: { id }, data: { ...rest, active: active === "on" } })];
    if (old.name !== rest.name) {
      ops.push(prisma.risk.updateMany({ where: { contextFactor: old.name }, data: { contextFactor: rest.name } }));
      ops.push(prisma.environmentalAspect.updateMany({ where: { contextFactor: old.name }, data: { contextFactor: rest.name } }));
    }
    await prisma.$transaction(ops);
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "ContextFactor",
      entityId: id,
      summary:
        old.name !== rest.name
          ? `Contextfactor "${old.name}" hernoemd naar "${rest.name}" (risico's en milieuaspecten bijgewerkt)`
          : `Contextfactor "${rest.name}" gewijzigd`,
    });
    revalidateContext();
    revalidatePath("/risicos", "layout");
    revalidatePath("/milieuaspecten", "layout");
  });
}

export async function deleteFactor(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("context.edit");
    const f = await prisma.contextFactor.findUnique({ where: { id } });
    if (!f) throw new UserError("Contextfactor niet gevonden.");
    const [risks, aspects] = await Promise.all([
      prisma.risk.count({ where: { contextFactor: f.name } }),
      prisma.environmentalAspect.count({ where: { contextFactor: f.name } }),
    ]);
    if (risks + aspects)
      throw new UserError(
        `Deze factor is gekoppeld aan ${risks} risico('s)/kans(en) en ${aspects} milieuaspect(en). Zet hem op 'niet actief' in plaats van verwijderen.`,
      );
    await prisma.contextFactor.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "ContextFactor", entityId: id, summary: `Contextfactor "${f.name}" verwijderd` });
    revalidateContext();
    redirect("/context/factoren");
  });
}

// ── Stakeholders en verplichtingen ────────────────────────────

const stakeholderSchema = z.object({
  name: requiredText(300),
  type: z.enum(["INTERNAL", "EXTERNAL"]),
  expectations: optionalText,
  influenceLevel: optionalText,
  howAddressed: optionalText,
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

export async function createStakeholder(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("context.edit");
    const data = parseForm(stakeholderSchema, formData);
    const sortOrder = data.sortOrder || ((await prisma.stakeholder.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1;
    const s = await prisma.stakeholder.create({ data: { ...data, sortOrder } });
    await logAudit({ user, action: "CREATE", entityType: "Stakeholder", entityId: s.id, summary: `Stakeholder "${s.name}" toegevoegd` });
    revalidateContext();
  });
}

export async function updateStakeholder(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("context.edit");
    const { active, ...data } = parseForm(stakeholderSchema.extend({ active: z.literal("on").optional() }), formData);
    await prisma.stakeholder.update({ where: { id }, data: { ...data, active: active === "on" } });
    await logAudit({ user, action: "UPDATE", entityType: "Stakeholder", entityId: id, summary: `Stakeholder "${data.name}" gewijzigd` });
    revalidateContext();
  });
}

export async function deleteStakeholder(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("context.edit");
    const s = await prisma.stakeholder.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "Stakeholder", entityId: id, summary: `Stakeholder "${s.name}" verwijderd` });
    revalidateContext();
  });
}

const obligationSchema = z.object({
  stakeholderText: requiredText(300),
  obligation: requiredText(2000),
  character: z.enum(ObligationCharacter),
  stakeholderIds: z.array(z.string().min(1)).max(200),
  legalIds: z.array(z.string().min(1)).max(3000),
});
const OBL_MULTI = ["stakeholderIds", "legalIds"];

export async function createObligation(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("context.edit");
    const { stakeholderIds, legalIds, ...data } = parseForm(obligationSchema, formData, OBL_MULTI);
    const sortOrder = ((await prisma.stakeholderObligation.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1;
    const o = await prisma.stakeholderObligation.create({
      data: {
        ...data,
        sortOrder,
        stakeholders: { connect: stakeholderIds.map((id) => ({ id })) },
        legalRequirements: { connect: legalIds.map((id) => ({ id })) },
      },
    });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "StakeholderObligation",
      entityId: o.id,
      summary: `Verplichting "${o.obligation.slice(0, 80)}" toegevoegd`,
    });
    revalidateContext();
  });
}

export async function updateObligation(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("context.edit");
    const { stakeholderIds, legalIds, ...data } = parseForm(obligationSchema, formData, OBL_MULTI);
    await prisma.stakeholderObligation.update({
      where: { id },
      data: { ...data, stakeholders: { set: stakeholderIds.map((x) => ({ id: x })) }, legalRequirements: { set: legalIds.map((x) => ({ id: x })) } },
    });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "StakeholderObligation",
      entityId: id,
      summary: `Verplichting gewijzigd (${legalIds.length} wettelijke eis(en) gekoppeld)`,
    });
    revalidateContext();
    revalidatePath("/wetgeving", "layout");
  });
}

export async function deleteObligation(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("context.edit");
    await prisma.stakeholderObligation.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "StakeholderObligation", entityId: id, summary: "Verplichting verwijderd" });
    revalidateContext();
  });
}

// ── Bewerken in de app (alleen conceptversies; een vastgestelde versie blijft ongewijzigd als bewijs) ──

async function loadConcept(analysisId: string) {
  const a = await prisma.contextAnalysis.findUnique({ where: { id: analysisId } });
  if (!a) throw new UserError("Versie niet gevonden.");
  if (a.status !== "CONCEPT") throw new UserError("Alleen een conceptversie kan worden bewerkt. Maak eerst een nieuwe conceptversie.");
  return a;
}

/** Nieuwe conceptversie als kopie van een (vastgestelde) versie, om in de app te bewerken. */
export async function createDraftFromAnalysis(id: string): Promise<ActionResult> {
  let newId = "";
  const result = await safeAction(async () => {
    const user = await requirePermission("context.edit");
    const src = await prisma.contextAnalysis.findUnique({ where: { id }, include: { sections: { orderBy: { sortOrder: "asc" } }, images: true } });
    if (!src) throw new UserError("Versie niet gevonden.");
    const idMap = new Map(src.images.map((img) => [img.id, randomUUID()]));
    const rewrite = (html: string) =>
      html.replace(/\/context\/afbeelding\/([0-9a-f-]{36})/g, (m, old: string) => (idMap.has(old) ? `/context/afbeelding/${idMap.get(old)}` : m));
    const draft = await prisma.$transaction(
      async (tx) => {
        const d = await tx.contextAnalysis.create({
          data: {
            title: src.title,
            versionLabel: src.versionLabel ? `${src.versionLabel} (concept)` : null,
            fileName: `${src.fileName} (bewerkt in de app)`,
            sharepointUrl: src.sharepointUrl,
            ownerText: src.ownerText,
            reviewCycle: src.reviewCycle,
            approvedByText: src.approvedByText,
            status: "CONCEPT",
            uploadedById: user.id,
            sections: {
              create: src.sections.map((s) => ({
                part: s.part,
                partTitle: s.partTitle,
                partSubtitle: s.partSubtitle,
                partKern: s.partKern,
                number: s.number,
                title: s.title,
                anchor: s.anchor,
                html: rewrite(s.html),
                sortOrder: s.sortOrder,
              })),
            },
          },
        });
        for (const img of src.images) {
          await tx.contextImage.create({
            data: { id: idMap.get(img.id)!, analysisId: d.id, contentType: img.contentType, data: img.data, size: img.size, alt: img.alt },
          });
        }
        return d;
      },
      { timeout: 60_000 },
    );
    newId = draft.id;
    await logAudit({
      user,
      action: "CREATE",
      entityType: "ContextAnalysis",
      entityId: draft.id,
      summary: `Nieuwe conceptversie gemaakt op basis van ${src.versionLabel ?? src.fileName}`,
    });
    revalidateContext();
  });
  if (result?.error) return result;
  redirect(`/context?versie=${newId}`);
}

const sectionSchema = z.object({
  number: optionalText,
  title: requiredText(300),
  html: z.string().max(2_000_000),
});

export async function updateSection(sectionId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("context.edit");
    const s = await prisma.contextSection.findUnique({ where: { id: sectionId } });
    if (!s) throw new UserError("Paragraaf niet gevonden.");
    await loadConcept(s.analysisId);
    const data = parseForm(sectionSchema, formData);
    await prisma.contextSection.update({
      where: { id: sectionId },
      data: { number: data.number ?? null, title: data.title, html: sanitizeContextHtml(data.html) },
    });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "ContextAnalysis",
      entityId: s.analysisId,
      summary: `Paragraaf ${data.number ?? ""} "${data.title}" bewerkt (concept)`.replace("  ", " "),
    });
    revalidateContext();
  });
}

/** Nieuwe paragraaf direct na een bestaande (zelfde deel). */
export async function addSectionAfter(sectionId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("context.edit");
    const ref = await prisma.contextSection.findUnique({ where: { id: sectionId } });
    if (!ref) throw new UserError("Paragraaf niet gevonden.");
    await loadConcept(ref.analysisId);
    const data = parseForm(sectionSchema.extend({ html: z.string().max(2_000_000).default("") }), formData);
    const anchor = `${data.number ? `p-${data.number.replace(/\./g, "-")}` : "par"}-${randomUUID().slice(0, 8)}`;
    await prisma.$transaction([
      prisma.contextSection.updateMany({ where: { analysisId: ref.analysisId, sortOrder: { gt: ref.sortOrder } }, data: { sortOrder: { increment: 1 } } }),
      prisma.contextSection.create({
        data: {
          analysisId: ref.analysisId,
          part: ref.part,
          partTitle: ref.partTitle,
          partSubtitle: ref.partSubtitle,
          partKern: ref.partKern,
          number: data.number ?? null,
          title: data.title,
          anchor,
          html: sanitizeContextHtml(data.html),
          sortOrder: ref.sortOrder + 1,
        },
      }),
    ]);
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "ContextAnalysis",
      entityId: ref.analysisId,
      summary: `Paragraaf "${data.title}" toegevoegd (concept)`,
    });
    revalidateContext();
  });
}

export async function deleteSection(sectionId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("context.edit");
    const s = await prisma.contextSection.findUnique({ where: { id: sectionId } });
    if (!s) throw new UserError("Paragraaf niet gevonden.");
    await loadConcept(s.analysisId);
    await prisma.contextSection.delete({ where: { id: sectionId } });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "ContextAnalysis",
      entityId: s.analysisId,
      summary: `Paragraaf ${s.number ?? ""} "${s.title}" verwijderd (concept)`.replace("  ", " "),
    });
    revalidateContext();
  });
}

/** Afbeelding toevoegen aan een conceptversie (vanuit de editor); geeft het adres terug om in de tekst te plaatsen. */
export async function uploadSectionImage(analysisId: string, formData: FormData): Promise<{ error?: string; src?: string }> {
  try {
    const user = await requirePermission("context.edit");
    await loadConcept(analysisId);
    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) return { error: "Kies een afbeelding." };
    if (file.size > MAX_IMAGE_UPLOAD) return { error: "De afbeelding is groter dan 4 MB." };
    const data = new Uint8Array(await file.arrayBuffer());
    const contentType = sniffImage(data);
    if (!contentType) return { error: "Alleen PNG, JPEG, GIF of WebP." };
    const id = randomUUID();
    await prisma.contextImage.create({ data: { id, analysisId, contentType, data, size: data.length, alt: file.name.slice(0, 200) } });
    await logAudit({ user, action: "UPDATE", entityType: "ContextAnalysis", entityId: analysisId, summary: `Afbeelding toegevoegd (${file.name})` });
    return { src: `/context/afbeelding/${id}` };
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    console.error("[context] afbeelding uploaden mislukt", err);
    return { error: "Uploaden mislukt." };
  }
}
