"use server";

import { disciplineMap } from "@/lib/masterdata";
import { rootCauseProblem } from "@/lib/corrective";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ActionKind, ActionPriority, ActionSource, ActionStatus, Prisma } from "@prisma/client";
import { unstable_rethrow } from "next/navigation";
import type { ImportResult, ImportRow } from "@/lib/spreadsheet-import";
import { parseActionKind, parseActionPriority, parseActionSource, parseActionStatus } from "@/lib/action-import";
import { prisma } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEditAction } from "@/lib/rbac";
import { optionalDate, optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";
import { ACTION_STATUS_LABEL } from "@/lib/labels";

const actionSchema = z.object({
  title: requiredText(300),
  description: optionalText,
  source: z.enum(ActionSource).default("MANUAL"),
  kind: z.enum(ActionKind).default("TASK"),
  priority: z.enum(ActionPriority).default("MEDIUM"),
  ownerId: optionalId,
  ownerText: optionalText,
  deadline: optionalDate,
  disciplineId: optionalId,
  locationId: optionalId,
  rootCause: optionalText,
  requirementIds: z.array(z.string().min(1)).max(500),
});

export async function createAction(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("actions.create");
    const { requirementIds, ...data } = parseForm(actionSchema, formData, ["requirementIds"]);
    const problem = rootCauseProblem(data.kind, data.rootCause);
    if (problem) throw new UserError(problem);
    const action = await prisma.action.create({
      data: { ...data, createdById: user.id, requirements: { connect: requirementIds.map((id) => ({ id })) } },
    });
    await logAudit({ user, action: "CREATE", entityType: "Action", entityId: action.id, summary: `Actie #${action.number} "${action.title}" aangemaakt` });
    revalidatePath("/acties");
    revalidatePath("/");
    redirect(`/acties/${action.id}`);
  });
}

async function loadEditable(id: string) {
  const user = await requireUser();
  const action = await prisma.action.findUnique({ where: { id } });
  if (!action) throw new UserError("Actie niet gevonden.");
  if (!canEditAction(user, action)) throw new UserError("Alleen de eigenaar, de aanmaker of QHSE kan deze actie wijzigen.");
  return { user, action };
}

const updateSchema = actionSchema.extend({
  status: z.enum(ActionStatus),
  result: optionalText,
  verifiedAt: optionalDate,
  verificationNote: optionalText,
});

export async function updateAction(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, action } = await loadEditable(id);
    const { requirementIds, ...data } = parseForm(updateSchema, formData, ["requirementIds"]);
    const problem = rootCauseProblem(data.kind, data.rootCause);
    if (problem) throw new UserError(problem);
    const completedAt = data.status === "DONE" ? (action.completedAt ?? new Date()) : null;
    await prisma.action.update({
      where: { id },
      data: { ...data, completedAt, requirements: { set: requirementIds.map((r) => ({ id: r })) } },
    });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Action",
      entityId: id,
      summary: `Actie #${action.number} gewijzigd${action.status !== data.status ? ` (status ${ACTION_STATUS_LABEL[action.status]} → ${ACTION_STATUS_LABEL[data.status]})` : ""}`,
      details: { ...data, deadline: data.deadline?.toISOString() ?? null, requirementIds },
    });
    revalidatePath("/acties");
    revalidatePath(`/acties/${id}`);
    revalidatePath("/");
  });
}

export async function setActionStatus(id: string, status: ActionStatus): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, action } = await loadEditable(id);
    const parsed = z.enum(ActionStatus).parse(status);
    await prisma.action.update({
      where: { id },
      data: { status: parsed, completedAt: parsed === "DONE" ? (action.completedAt ?? new Date()) : null },
    });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Action",
      entityId: id,
      summary: `Actie #${action.number}: status ${ACTION_STATUS_LABEL[action.status]} → ${ACTION_STATUS_LABEL[parsed]}`,
    });
    revalidatePath("/acties");
    revalidatePath(`/acties/${id}`);
    revalidatePath("/");
  });
}

export async function deleteAction(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("actions.editAny");
    const action = await prisma.action.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "Action", entityId: id, summary: `Actie #${action.number} "${action.title}" verwijderd` });
    revalidatePath("/acties");
    revalidatePath("/");
    redirect("/acties");
  });
}

// ── Import ────────────────────────────────────────────────────

const txt = (max: number) => z.string().trim().max(max).optional();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();
const importRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  externalRef: txt(100),
  title: z.string().trim().min(1).max(5000),
  description: txt(10_000),
  source: txt(300),
  kind: txt(100),
  owner: txt(200),
  deadline: isoDate,
  status: txt(100),
  priority: txt(50),
  discipline: txt(200),
  location: txt(200),
  result: txt(10_000),
  completedAt: isoDate,
  reportRef: txt(100),
});

/** Bestaande actielijst inlezen. Bijwerken op nummer; eigenaar op naam/e-mail (anders als tekst); lege cellen wissen niets. */
export async function importActions(rowsInput: ImportRow[], options: { updateExisting: boolean }): Promise<ImportResult> {
  try {
    const user = await requirePermission("actions.editAny");
    if (!Array.isArray(rowsInput) || rowsInput.length === 0) return { error: "Geen regels om te importeren." };
    if (rowsInput.length > 5000) return { error: "Maximaal 5000 regels per import." };
    const key = (s: string) => s.trim().toLowerCase();
    const [disciplines, locations, users, reports] = await Promise.all([
      prisma.discipline.findMany({ select: { id: true, name: true, aliases: true } }),
      prisma.location.findMany({ select: { id: true, name: true } }),
      prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } }),
      prisma.report.findMany({ select: { id: true, number: true, externalRef: true } }),
    ]);
    const discMap = disciplineMap(disciplines);
    const locMap = new Map(locations.map((l) => [key(l.name), l.id]));
    const userMap = new Map(users.flatMap((u) => [[key(u.name), u.id] as const, [key(u.email), u.id] as const]));
    const reportMap = new Map(
      reports.flatMap((r) => [[`m-${String(r.number).padStart(3, "0")}`, r.id] as const, ...(r.externalRef ? [[key(r.externalRef), r.id] as const] : [])]),
    );
    const warnings: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const input of rowsInput) {
      const parsed = importRowSchema.safeParse(input);
      if (!parsed.success) {
        skipped++;
        warnings.push(`Rij ${typeof input?.rowNumber === "number" ? input.rowNumber : "?"}: actie ontbreekt of ongeldige waarde — overgeslagen`);
        continue;
      }
      const r = parsed.data;
      const title = r.title.length > 300 ? `${r.title.slice(0, 297)}…` : r.title;
      const status = r.status !== undefined ? (parseActionStatus(r.status) ?? undefined) : undefined;
      if (r.status !== undefined && !status) warnings.push(`Rij ${r.rowNumber}: status "${r.status}" niet herkend — open aangenomen`);
      const ownerId = r.owner ? userMap.get(key(r.owner)) : undefined;
      const reportId = r.reportRef ? reportMap.get(key(r.reportRef)) : undefined;
      if (r.reportRef && !reportId) warnings.push(`Rij ${r.rowNumber}: melding "${r.reportRef}" niet gevonden — niet gekoppeld`);
      const values = {
        externalRef: r.externalRef,
        title,
        description: r.title.length > 300 ? [r.title, r.description].filter(Boolean).join("\n\n") : r.description,
        source: r.source !== undefined ? parseActionSource(r.source) : undefined,
        kind: r.kind !== undefined ? (parseActionKind(r.kind) ?? undefined) : undefined,
        ownerId,
        ownerText: r.owner && !ownerId ? r.owner : undefined,
        deadline: r.deadline ? new Date(`${r.deadline}T00:00:00Z`) : undefined,
        status,
        priority: r.priority !== undefined ? (parseActionPriority(r.priority) ?? undefined) : undefined,
        disciplineId: r.discipline ? discMap.get(key(r.discipline)) : undefined,
        locationId: r.location ? locMap.get(key(r.location)) : undefined,
        result: r.result,
        completedAt: r.completedAt ? new Date(`${r.completedAt}T00:00:00Z`) : status === "DONE" ? new Date() : undefined,
        reportId,
      };
      const data = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as Prisma.ActionUncheckedUpdateInput;
      // "#12" = actienummer uit de app (export); anders het eigen nummer uit de actielijst.
      const appNumber = r.externalRef && /^#\d+$/.test(r.externalRef) ? Number(r.externalRef.slice(1)) : null;
      if (appNumber) delete (data as Record<string, unknown>).externalRef;
      const existing = !options.updateExisting
        ? null
        : appNumber
          ? await prisma.action.findUnique({ where: { number: appNumber } })
          : r.externalRef
            ? await prisma.action.findUnique({ where: { externalRef: r.externalRef } })
            : null;
      try {
        if (existing) {
          await prisma.action.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.action.create({ data: { ...(data as Prisma.ActionUncheckedCreateInput), title, createdById: user.id } });
          created++;
        }
      } catch (err) {
        skipped++;
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
          warnings.push(`Rij ${r.rowNumber}: nummer "${r.externalRef}" komt dubbel voor — overgeslagen`);
        else {
          console.error("[import] actie mislukt", err);
          warnings.push(`Rij ${r.rowNumber}: opslaan mislukt — overgeslagen`);
        }
      }
    }
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Action",
      summary: `Import actielijst: ${created} nieuw, ${updated} bijgewerkt, ${skipped} overgeslagen`,
      details: { created, updated, skipped, warnings: warnings.slice(0, 200) },
    });
    revalidatePath("/acties", "layout");
    revalidatePath("/");
    return { created, updated, skipped, warnings };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof UserError) return { error: err.message };
    console.error("[import] acties mislukt", err);
    return { error: "Import mislukt. Probeer het opnieuw." };
  }
}
