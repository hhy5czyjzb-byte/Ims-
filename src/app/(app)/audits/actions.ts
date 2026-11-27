"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ActionPriority, AuditStatus, AuditType, ChecklistResult, FindingClass, FindingStatus, Prisma } from "@prisma/client";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { auditCode, findingCode } from "@/lib/audit-plan";
import { optionalDate, optionalId, optionalText, optionalUrl, parseForm, requiredText } from "@/lib/forms";

const requiredDate = z
  .string()
  .trim()
  .min(1, "Datum is verplicht")
  .transform((v, ctx) => {
    const d = new Date(`${v}T00:00:00Z`);
    if (isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Ongeldige datum" });
      return z.NEVER;
    }
    return d;
  });

const auditSchema = z.object({
  type: z.enum(AuditType),
  title: requiredText(300),
  plannedDate: requiredDate,
  auditor: optionalText,
  certificationBody: optionalText,
  scope: optionalText,
  locationId: optionalId,
  disciplineId: optionalId,
  reportUrl: optionalUrl,
  normIds: z.array(z.string().min(1)).min(1, "Kies minstens één norm").max(50),
});

function revalidateAudits(id?: string) {
  revalidatePath("/audits", "layout");
  if (id) revalidatePath(`/audits/${id}`, "layout");
  revalidatePath("/");
  revalidatePath("/normen", "layout");
}

/** Alle 'blad'-eisen (zonder onderliggende eisen) van de opgegeven normen. */
async function leafRequirementIds(normIds: string[]) {
  const reqs = await prisma.normRequirement.findMany({
    where: { normId: { in: normIds }, children: { none: {} } },
    select: { id: true },
  });
  return reqs.map((r) => r.id);
}

async function loadAudit(id: string) {
  const audit = await prisma.audit.findUnique({ where: { id }, include: { norms: { select: { id: true } } } });
  if (!audit) throw new UserError("Audit niet gevonden.");
  return audit;
}

/** Controleer dat eisen bij de normen van deze audit horen. */
async function assertRequirementsInScope(normIds: string[], requirementIds: string[]) {
  if (!requirementIds.length) return;
  const count = await prisma.normRequirement.count({ where: { id: { in: requirementIds }, normId: { in: normIds } } });
  if (count !== new Set(requirementIds).size) throw new UserError("Een of meer eisen horen niet bij de normen van deze audit.");
}

export async function createAudit(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("audits.edit");
    const { normIds, ...data } = parseForm(auditSchema, formData, ["normIds"]);
    const fillChecklist = formData.get("fillChecklist") === "on";
    const reqIds = fillChecklist ? await leafRequirementIds(normIds) : [];
    const audit = await prisma.audit.create({
      data: {
        ...data,
        norms: { connect: normIds.map((id) => ({ id })) },
        checklist: { create: reqIds.map((requirementId) => ({ requirementId })) },
      },
    });
    await logAudit({ user, action: "CREATE", entityType: "Audit", entityId: audit.id, summary: `${auditCode(audit.number)} "${audit.title}" gepland` });
    revalidateAudits();
    redirect(`/audits/${audit.id}`);
  });
}

const updateSchema = auditSchema.extend({
  status: z.enum(AuditStatus),
  completedDate: optionalDate,
  conclusion: optionalText,
});

export async function updateAudit(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("audits.edit");
    const audit = await loadAudit(id);
    const { normIds, ...data } = parseForm(updateSchema, formData, ["normIds"]);
    if (data.status === "COMPLETED" && !data.completedDate) data.completedDate = new Date(new Date().toISOString().slice(0, 10));
    await prisma.audit.update({ where: { id }, data: { ...data, norms: { set: normIds.map((n) => ({ id: n })) } } });
    // Checklistregels van normen die uit de scope zijn gehaald, vervallen.
    const removed = await prisma.auditChecklistItem.deleteMany({ where: { auditId: id, requirement: { normId: { notIn: normIds } } } });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Audit",
      entityId: id,
      summary: `${auditCode(audit.number)} gewijzigd${audit.status !== data.status ? ` (status ${audit.status} → ${data.status})` : ""}${removed.count ? ` — ${removed.count} checklistregel(s) vervallen` : ""}`,
      details: { ...data, plannedDate: data.plannedDate.toISOString(), completedDate: data.completedDate?.toISOString() ?? null, normIds },
    });
    revalidateAudits(id);
  });
}

export async function setAuditStatus(id: string, status: AuditStatus): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("audits.edit");
    const audit = await loadAudit(id);
    const parsed = z.enum(AuditStatus).parse(status);
    const completedDate = parsed === "COMPLETED" ? (audit.completedDate ?? new Date(new Date().toISOString().slice(0, 10))) : audit.completedDate;
    await prisma.audit.update({ where: { id }, data: { status: parsed, completedDate } });
    await logAudit({ user, action: "UPDATE", entityType: "Audit", entityId: id, summary: `${auditCode(audit.number)}: status ${audit.status} → ${parsed}` });
    revalidateAudits(id);
  });
}

export async function deleteAudit(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("audits.edit");
    const audit = await prisma.audit.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "Audit", entityId: id, summary: `${auditCode(audit.number)} "${audit.title}" verwijderd` });
    revalidateAudits();
    redirect("/audits");
  });
}

// ── Checklist ─────────────────────────────────────────────────

export async function setChecklistItems(auditId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("audits.edit");
    const audit = await loadAudit(auditId);
    const { requirementIds } = parseForm(z.object({ requirementIds: z.array(z.string().min(1)).max(3000) }), formData, ["requirementIds"]);
    await assertRequirementsInScope(
      audit.norms.map((n) => n.id),
      requirementIds,
    );
    const [removed, added] = await prisma.$transaction([
      prisma.auditChecklistItem.deleteMany({ where: { auditId, requirementId: { notIn: requirementIds } } }),
      prisma.auditChecklistItem.createMany({ data: requirementIds.map((requirementId) => ({ auditId, requirementId })), skipDuplicates: true }),
    ]);
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Audit",
      entityId: auditId,
      summary: `Checklist: ${added.count} eis(en) toegevoegd, ${removed.count} verwijderd`,
    });
    revalidateAudits(auditId);
  });
}

export async function addAllRequirements(auditId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("audits.edit");
    const audit = await loadAudit(auditId);
    const ids = await leafRequirementIds(audit.norms.map((n) => n.id));
    const added = await prisma.auditChecklistItem.createMany({ data: ids.map((requirementId) => ({ auditId, requirementId })), skipDuplicates: true });
    await logAudit({ user, action: "UPDATE", entityType: "Audit", entityId: auditId, summary: `Checklist: alle eisen toegevoegd (${added.count} nieuw)` });
    revalidateAudits(auditId);
  });
}

export async function saveChecklistResults(auditId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("audits.edit");
    const items = await prisma.auditChecklistItem.findMany({ where: { auditId } });
    const resultEnum = z.enum(ChecklistResult);
    const updates: Prisma.PrismaPromise<unknown>[] = [];
    let changed = 0;
    for (const item of items) {
      const rawResult = formData.get(`result_${item.id}`);
      if (rawResult === null) continue;
      const result = resultEnum.parse(String(rawResult));
      const notesRaw = String(formData.get(`notes_${item.id}`) ?? "")
        .trim()
        .slice(0, 5000);
      const notes = notesRaw === "" ? null : notesRaw;
      if (result !== item.result || notes !== item.notes) {
        changed++;
        updates.push(prisma.auditChecklistItem.update({ where: { id: item.id }, data: { result, notes } }));
      }
    }
    if (updates.length) await prisma.$transaction(updates);
    await logAudit({ user, action: "UPDATE", entityType: "Audit", entityId: auditId, summary: `Checklist ingevuld (${changed} regel(s) gewijzigd)` });
    revalidateAudits(auditId);
  });
}

// ── Bevindingen ───────────────────────────────────────────────

const findingSchema = z.object({
  classification: z.enum(FindingClass),
  requirementId: optionalId,
  description: requiredText(5000),
  rootCause: optionalText,
  dueDate: optionalDate,
});

export async function createFinding(auditId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("audits.edit");
    const audit = await loadAudit(auditId);
    const data = parseForm(findingSchema, formData);
    if (data.requirementId)
      await assertRequirementsInScope(
        audit.norms.map((n) => n.id),
        [data.requirementId],
      );

    // Volgnummer binnen de audit; bij gelijktijdig toevoegen opnieuw proberen.
    let finding;
    for (let attempt = 0; attempt < 3 && !finding; attempt++) {
      try {
        finding = await prisma.$transaction(async (tx) => {
          const last = await tx.auditFinding.findFirst({ where: { auditId }, orderBy: { number: "desc" }, select: { number: true } });
          const created = await tx.auditFinding.create({ data: { ...data, auditId, number: (last?.number ?? 0) + 1 } });
          if (data.requirementId) {
            // De eis op de checklist markeren als 'bevinding'.
            await tx.auditChecklistItem.upsert({
              where: { auditId_requirementId: { auditId, requirementId: data.requirementId } },
              update: { result: "FINDING" },
              create: { auditId, requirementId: data.requirementId, result: "FINDING" },
            });
          }
          return created;
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
    }
    if (!finding) throw new UserError("Opslaan mislukt door gelijktijdige wijziging. Probeer het opnieuw.");
    await logAudit({
      user,
      action: "CREATE",
      entityType: "AuditFinding",
      entityId: finding.id,
      summary: `Bevinding ${findingCode(audit.number, finding.number)} (${finding.classification}) vastgelegd`,
    });
    revalidateAudits(auditId);
  });
}

async function loadFinding(auditId: string, findingId: string) {
  const finding = await prisma.auditFinding.findFirst({
    where: { id: findingId, auditId },
    include: { audit: { include: { norms: { select: { id: true } } } }, actions: { select: { status: true } } },
  });
  if (!finding) throw new UserError("Bevinding niet gevonden.");
  return finding;
}

export async function updateFinding(auditId: string, findingId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("audits.edit");
    const finding = await loadFinding(auditId, findingId);
    const data = parseForm(findingSchema, formData);
    if (data.requirementId)
      await assertRequirementsInScope(
        finding.audit.norms.map((n) => n.id),
        [data.requirementId],
      );
    await prisma.auditFinding.update({ where: { id: findingId }, data });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "AuditFinding",
      entityId: findingId,
      summary: `Bevinding ${findingCode(finding.audit.number, finding.number)} gewijzigd`,
      details: { ...data, dueDate: data.dueDate?.toISOString() ?? null },
    });
    revalidateAudits(auditId);
  });
}

export async function setFindingStatus(auditId: string, findingId: string, status: FindingStatus): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("audits.edit");
    const finding = await loadFinding(auditId, findingId);
    const parsed = z.enum(FindingStatus).parse(status);
    if (parsed === "CLOSED") {
      const open = finding.actions.filter((a) => a.status === "OPEN" || a.status === "IN_PROGRESS").length;
      if (open) throw new UserError(`Er staan nog ${open} actie(s) open. Rond die eerst af (of zet ze op 'Vervallen').`);
      if (finding.classification !== "OBSERVATION" && !finding.rootCause) {
        throw new UserError("Leg eerst de oorzaakanalyse vast; die is verplicht bij een major of minor.");
      }
    }
    await prisma.auditFinding.update({ where: { id: findingId }, data: { status: parsed, closedAt: parsed === "CLOSED" ? new Date() : null } });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "AuditFinding",
      entityId: findingId,
      summary: `Bevinding ${findingCode(finding.audit.number, finding.number)} ${parsed === "CLOSED" ? "afgehandeld" : "heropend"}`,
    });
    revalidateAudits(auditId);
  });
}

export async function deleteFinding(auditId: string, findingId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("audits.edit");
    const finding = await loadFinding(auditId, findingId);
    await prisma.auditFinding.delete({ where: { id: findingId } });
    await logAudit({
      user,
      action: "DELETE",
      entityType: "AuditFinding",
      entityId: findingId,
      summary: `Bevinding ${findingCode(finding.audit.number, finding.number)} verwijderd`,
    });
    revalidateAudits(auditId);
    redirect(`/audits/${auditId}`);
  });
}

const findingActionSchema = z.object({
  title: requiredText(300),
  ownerId: optionalId,
  deadline: optionalDate,
  priority: z.enum(ActionPriority).default("MEDIUM"),
});

/** Corrigerende maatregel als actie, gekoppeld aan de bevinding (bron: Audit). */
export async function createFindingAction(auditId: string, findingId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("actions.create");
    const finding = await loadFinding(auditId, findingId);
    const data = parseForm(findingActionSchema, formData);
    const action = await prisma.action.create({
      data: {
        ...data,
        source: "AUDIT",
        findingId,
        createdById: user.id,
        locationId: finding.audit.locationId,
        disciplineId: finding.audit.disciplineId,
        requirements: finding.requirementId ? { connect: [{ id: finding.requirementId }] } : undefined,
      },
    });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Action",
      entityId: action.id,
      summary: `Actie #${action.number} aangemaakt vanuit bevinding ${findingCode(finding.audit.number, finding.number)}`,
    });
    revalidateAudits(auditId);
    revalidatePath("/acties");
  });
}
