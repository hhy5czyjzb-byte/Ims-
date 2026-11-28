"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ObjectiveCategory, ObjectiveStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { canReviewObjective } from "@/lib/rbac";
import { optionalDate, optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";
import { addMonths } from "@/lib/compliance";
import { disciplineMap } from "@/lib/masterdata";
import { OBJECTIVE_STATUS_LABEL } from "@/lib/labels";
import { objectiveDisplayCode, parseNumber, parseObjectiveCategory, parseObjectiveStatus } from "@/lib/objectives";
import type { ImportResult, ImportRow } from "@/lib/spreadsheet-import";

function revalidate(id?: string) {
  revalidatePath("/doelstellingen", "layout");
  if (id) revalidatePath(`/doelstellingen/${id}`);
  revalidatePath("/");
  revalidatePath("/acties", "layout");
}

const optionalNumber = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = parseNumber(v);
    if (n === null) {
      ctx.addIssue({ code: "custom", message: "Vul een getal in" });
      return z.NEVER;
    }
    return n;
  });

const objectiveSchema = z.object({
  title: requiredText(300),
  description: optionalText,
  category: z.enum(ObjectiveCategory),
  indicator: optionalText,
  baselineText: optionalText,
  targetText: optionalText,
  unit: optionalText,
  baselineValue: optionalNumber,
  targetValue: optionalNumber,
  startDate: optionalDate,
  deadline: optionalDate,
  termText: optionalText,
  ownerId: optionalId,
  ownerText: optionalText,
  disciplineId: optionalId,
  reductionTargetId: optionalId,
  reviewIntervalMonths: z.coerce.number().int().min(1).max(24).default(3),
  externalRef: optionalText,
  normIds: z.array(z.string().min(1)).max(50),
  requirementIds: z.array(z.string().min(1)).max(500),
});

export async function createObjective(formData: FormData): Promise<ActionResult> {
  let id = "";
  const r = await safeAction(async () => {
    const user = await requirePermission("objectives.edit");
    const { normIds, requirementIds, ...data } = parseForm(objectiveSchema, formData, ["normIds", "requirementIds"]);
    const o = await prisma.objective.create({
      data: {
        ...data,
        createdById: user.id,
        nextReviewDate: addMonths(data.startDate ?? new Date(), data.reviewIntervalMonths),
        norms: { connect: normIds.map((n) => ({ id: n })) },
        requirements: { connect: requirementIds.map((n) => ({ id: n })) },
      },
    });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Objective",
      entityId: o.id,
      summary: `Doelstelling ${objectiveDisplayCode(o)} "${o.title}" aangemaakt`,
    });
    id = o.id;
    revalidate();
  });
  if (r?.error) return r;
  redirect(`/doelstellingen/${id}`);
}

export async function updateObjective(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("objectives.edit");
    const { normIds, requirementIds, ...data } = parseForm(objectiveSchema.extend({ active: z.literal("on").optional() }), formData, [
      "normIds",
      "requirementIds",
    ]);
    const { active, ...rest } = data;
    const o = await prisma.objective.update({
      where: { id },
      data: {
        ...rest,
        active: active === "on",
        norms: { set: normIds.map((n) => ({ id: n })) },
        requirements: { set: requirementIds.map((n) => ({ id: n })) },
      },
    });
    await logAudit({ user, action: "UPDATE", entityType: "Objective", entityId: id, summary: `Doelstelling ${objectiveDisplayCode(o)} gewijzigd` });
    revalidate(id);
  });
}

export async function deleteObjective(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("objectives.edit");
    const o = await prisma.objective.findUnique({ where: { id }, include: { _count: { select: { reviews: true, actions: true } } } });
    if (!o) throw new UserError("Doelstelling niet gevonden.");
    if (o._count.reviews || o._count.actions)
      throw new UserError("Deze doelstelling heeft beoordelingen of acties (bewijs). Zet hem op 'vervallen' of 'niet actief' in plaats van verwijderen.");
    await prisma.objective.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "Objective", entityId: id, summary: `Doelstelling ${objectiveDisplayCode(o)} verwijderd` });
    revalidate();
    redirect("/doelstellingen");
  });
}

const reviewSchema = z.object({
  date: optionalDate,
  status: z.enum(ObjectiveStatus).refine((s) => s !== "NOT_ASSESSED", "Kies een status"),
  currentValue: optionalNumber,
  progressPct: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Math.max(0, Math.min(100, Math.round(Number(v) || 0))) : null)),
  explanation: optionalText,
});

/** Voortgang beoordelen: legt de status vast (historie); de meest recente beoordeling bepaalt de actuele status. */
export async function reviewObjective(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const o = await prisma.objective.findUnique({ where: { id } });
    if (!o) throw new UserError("Doelstelling niet gevonden.");
    if (!canReviewObjective(user, o)) throw new UserError("Alleen QHSE of de eigenaar kan de voortgang beoordelen.");
    const data = parseForm(reviewSchema, formData);
    const date = data.date ?? new Date();
    if (date.getTime() > Date.now() + 86_400_000) throw new UserError("De datum van de beoordeling kan niet in de toekomst liggen.");
    if ((data.status === "OFF_TRACK" || data.status === "NOT_ACHIEVED" || data.status === "AT_RISK") && !data.explanation)
      throw new UserError("Geef bij deze status een toelichting (oorzaak en vervolg).");
    await prisma.objectiveReview.create({
      data: {
        objectiveId: id,
        date,
        status: data.status,
        currentValue: data.currentValue,
        progressPct: data.progressPct,
        explanation: data.explanation,
        userId: user.id,
      },
    });
    const latest = await prisma.objectiveReview.findFirst({ where: { objectiveId: id }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
    if (latest)
      await prisma.objective.update({
        where: { id },
        data: {
          status: latest.status,
          currentValue: latest.currentValue ?? o.currentValue,
          lastReviewDate: latest.date,
          nextReviewDate: ["ACHIEVED", "NOT_ACHIEVED", "PARTIAL", "CANCELLED"].includes(latest.status) ? null : addMonths(latest.date, o.reviewIntervalMonths),
        },
      });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Objective",
      entityId: id,
      summary: `Doelstelling ${objectiveDisplayCode(o)} beoordeeld: ${OBJECTIVE_STATUS_LABEL[data.status].toLowerCase()}`,
    });
    revalidate(id);
  });
}

const actionSchema = z.object({ title: requiredText(300), ownerId: optionalId, ownerText: optionalText, deadline: optionalDate });

export async function createObjectiveAction(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("actions.create");
    const o = await prisma.objective.findUnique({ where: { id }, include: { requirements: { select: { id: true } } } });
    if (!o) throw new UserError("Doelstelling niet gevonden.");
    const data = parseForm(actionSchema, formData);
    const a = await prisma.action.create({
      data: {
        ...data,
        source: "OBJECTIVE",
        kind: "IMPROVEMENT",
        objectiveId: id,
        disciplineId: o.disciplineId,
        createdById: user.id,
        requirements: { connect: o.requirements },
      },
    });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Action",
      entityId: a.id,
      summary: `Actie #${a.number} "${a.title}" bij doelstelling ${objectiveDisplayCode(o)}`,
    });
    revalidate(id);
  });
}

// ── Import ────────────────────────────────────────────────────

const txt = (max: number) => z.string().trim().max(max).optional();
const importRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  externalRef: txt(100),
  title: z.string().trim().min(1).max(2000),
  category: txt(200),
  indicator: txt(5000),
  baselineText: txt(500),
  targetText: txt(500),
  owner: txt(200),
  deadline: txt(100),
  discipline: txt(200),
  status: txt(200),
  explanation: txt(5000),
});

function parseDateText(v: string | undefined): Date | null {
  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const nl = v.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (nl) return new Date(Date.UTC(+nl[3], +nl[2] - 1, +nl[1]));
  const y = v.match(/^(20\d{2})$/);
  if (y) return new Date(Date.UTC(+y[1], 11, 31));
  return null;
}

/** Doelstellingen inlezen (bijv. uit de managementreview of een eigen lijst). Bijwerken op nummer, anders op titel. */
export async function importObjectives(rowsInput: ImportRow[], options: { updateExisting: boolean }): Promise<ImportResult> {
  try {
    const user = await requirePermission("objectives.edit");
    if (!Array.isArray(rowsInput) || rowsInput.length === 0) return { error: "Geen regels om te importeren." };
    if (rowsInput.length > 2000) return { error: "Maximaal 2000 regels per import." };
    const key = (s: string) => s.trim().toLowerCase();
    const [disciplines, users] = await Promise.all([
      prisma.discipline.findMany({ select: { id: true, name: true, aliases: true } }),
      prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } }),
    ]);
    const discMap = disciplineMap(disciplines);
    const userMap = new Map(users.flatMap((u) => [[key(u.name), u.id] as const, [key(u.email), u.id] as const]));
    const warnings: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const input of rowsInput) {
      const p = importRowSchema.safeParse(input);
      if (!p.success) {
        skipped++;
        continue;
      }
      const r = p.data;
      const title = r.title.length > 300 ? `${r.title.slice(0, 297)}…` : r.title;
      const deadline = parseDateText(r.deadline);
      const ownerId = r.owner ? userMap.get(key(r.owner)) : undefined;
      const status = r.status ? parseObjectiveStatus(r.status) : null;
      if (r.status && !status) warnings.push(`Rij ${r.rowNumber}: status "${r.status}" niet herkend — niet overgenomen`);
      const values = {
        externalRef: r.externalRef,
        title,
        category: (r.category ? parseObjectiveCategory(r.category) : null) ?? parseObjectiveCategory(`${r.title} ${r.indicator ?? ""}`) ?? undefined,
        indicator: r.indicator,
        baselineText: r.baselineText,
        targetText: r.targetText,
        baselineValue: r.baselineText ? (parseNumber(r.baselineText) ?? undefined) : undefined,
        targetValue: r.targetText ? (parseNumber(r.targetText) ?? undefined) : undefined,
        deadline: deadline ?? undefined,
        termText: r.deadline && !deadline ? r.deadline : undefined,
        ownerId,
        ownerText: r.owner && !ownerId ? r.owner : undefined,
        disciplineId: r.discipline ? discMap.get(key(r.discipline)) : undefined,
      };
      const data = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as Prisma.ObjectiveUncheckedUpdateInput;
      const existing = options.updateExisting
        ? r.externalRef
          ? await prisma.objective.findUnique({ where: { externalRef: r.externalRef } })
          : await prisma.objective.findFirst({ where: { title: { equals: title, mode: "insensitive" } } })
        : null;
      try {
        const obj = existing
          ? await prisma.objective.update({ where: { id: existing.id }, data })
          : await prisma.objective.create({
              data: {
                ...(data as Prisma.ObjectiveUncheckedCreateInput),
                title,
                category: (values.category ?? "OTHER") as ObjectiveCategory,
                createdById: user.id,
                nextReviewDate: addMonths(new Date(), 3),
              },
            });
        if (existing) updated++;
        else created++;
        if (status && status !== obj.status) {
          const now = new Date();
          await prisma.objectiveReview.create({
            data: { objectiveId: obj.id, date: now, status, explanation: r.explanation ?? "Overgenomen uit import", userId: user.id },
          });
          await prisma.objective.update({
            where: { id: obj.id },
            data: { status, lastReviewDate: now, nextReviewDate: FINAL.includes(status) ? null : addMonths(now, obj.reviewIntervalMonths) },
          });
        }
      } catch (err) {
        skipped++;
        console.error("[import] doelstelling mislukt", err);
        warnings.push(`Rij ${r.rowNumber}: opslaan mislukt — overgeslagen`);
      }
    }
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Objective",
      summary: `Import doelstellingen: ${created} nieuw, ${updated} bijgewerkt, ${skipped} overgeslagen`,
      details: { warnings: warnings.slice(0, 200) },
    });
    revalidate();
    return { created, updated, skipped, warnings };
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    console.error("[import] doelstellingen", err);
    return { error: "Import mislukt." };
  }
}
const FINAL: ObjectiveStatus[] = ["ACHIEVED", "NOT_ACHIEVED", "PARTIAL", "CANCELLED"];
