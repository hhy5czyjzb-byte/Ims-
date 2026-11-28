"use server";

import { disciplineMap } from "@/lib/masterdata";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { ActionKind, ActionPriority, InjuryLevel, Prisma, ReportOrigin, ReportSeverity, ReportType } from "@prisma/client";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { can, canEditReport } from "@/lib/rbac";
import { optionalDate, optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";
import { REPORT_STATUS_LABEL, REPORT_TYPE_LABEL } from "@/lib/labels";
import {
  actionSourceForReport,
  parseInjury,
  parseReportOrigin,
  parseReportSeverity,
  parseReportStatus,
  parseReportType,
  reportCloseProblems,
  reportDisplayCode,
} from "@/lib/reports";
import type { ImportResult, ImportRow } from "@/lib/spreadsheet-import";

function revalidateReports(id?: string) {
  revalidatePath("/meldingen", "layout");
  if (id) revalidatePath(`/meldingen/${id}`);
  revalidatePath("/acties", "layout");
  revalidatePath("/");
}

const requiredDate = z
  .string()
  .trim()
  .min(1, "Vul de datum in")
  .transform((v, ctx) => {
    const d = new Date(`${v.slice(0, 10)}T00:00:00Z`);
    if (isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Ongeldige datum" });
      return z.NEVER;
    }
    return d;
  });

const optionalInt = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 10_000) {
      ctx.addIssue({ code: "custom", message: "Vul een heel getal in" });
      return z.NEVER;
    }
    return n;
  });
const optionalMoney = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Vul een bedrag in" });
      return z.NEVER;
    }
    return n;
  });
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on");

/** Melden: kort en laagdrempelig (iedereen). */
const createSchema = z.object({
  type: z.enum(ReportType),
  title: requiredText(300),
  description: optionalText,
  occurredAt: requiredDate,
  origin: z.enum(ReportOrigin).default("INTERNAL"),
  locationId: optionalId,
  locationText: optionalText,
  disciplineId: optionalId,
  severity: z
    .union([z.enum(ReportSeverity), z.literal("")])
    .optional()
    .transform((v) => v || null),
  immediateAction: optionalText,
  injury: z
    .union([z.enum(InjuryLevel), z.literal("")])
    .optional()
    .transform((v) => v || null),
  reporterText: optionalText,
});

export async function createReport(formData: FormData): Promise<ActionResult> {
  let id = "";
  const r = await safeAction(async () => {
    const user = await requirePermission("reports.create");
    const data = parseForm(createSchema, formData);
    if (data.occurredAt.getTime() > Date.now() + 86_400_000) throw new UserError("De datum van het voorval kan niet in de toekomst liggen.");
    const report = await prisma.report.create({ data: { ...data, reportedById: user.id } });
    id = report.id;
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Report",
      entityId: report.id,
      summary: `${reportDisplayCode(report)} gemeld: ${REPORT_TYPE_LABEL[report.type].toLowerCase()} "${report.title}"`,
    });
    revalidateReports();
  });
  if (r?.error) return r;
  redirect(`/meldingen/${id}`);
}

/** Behandelen: alle velden, inclusief analyse en effectiviteit. */
const updateSchema = createSchema.extend({
  processId: optionalId,
  lostDays: optionalInt,
  reportable: checkbox,
  reportedToAuthorityAt: optionalDate,
  rootCause: optionalText,
  rootCauseMethod: optionalText,
  causeCategory: optionalText,
  costs: optionalMoney,
  ownerId: optionalId,
  ownerText: optionalText,
  effective: z
    .enum(["", "ja", "nee"])
    .default("")
    .transform((v) => (v === "ja" ? true : v === "nee" ? false : null)),
  effectivenessNote: optionalText,
  effectivenessCheckedAt: optionalDate,
  externalRef: optionalText,
  requirementIds: z.array(z.string().min(1)).max(500),
});

async function loadEditable(id: string) {
  const user = await requireUser();
  const report = await prisma.report.findUnique({ where: { id }, include: { actions: { select: { status: true } } } });
  if (!report) throw new UserError("Melding niet gevonden.");
  if (!canEditReport(user, report)) throw new UserError("Alleen QHSE, de melder of de behandelaar kan deze melding wijzigen.");
  return { user, report };
}

export async function updateReport(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, report } = await loadEditable(id);
    const { requirementIds, ...data } = parseForm(updateSchema, formData, ["requirementIds"]);
    // Alleen QHSE wijst een behandelaar toe of wijzigt het eigen nummer.
    const manage = can(user.role, "reports.manage");
    const guarded = manage ? data : { ...data, ownerId: report.ownerId, ownerText: report.ownerText, externalRef: report.externalRef };
    await prisma.report.update({
      where: { id },
      data: {
        ...guarded,
        status: report.status === "NEW" && (data.rootCause || data.ownerId || data.ownerText) ? "IN_PROGRESS" : undefined,
        requirements: { set: requirementIds.map((r) => ({ id: r })) },
      },
    });
    await logAudit({ user, action: "UPDATE", entityType: "Report", entityId: id, summary: `${reportDisplayCode(report)} bijgewerkt` });
    revalidateReports(id);
  });
}

const statusSchema = z.object({ status: z.enum(["IN_PROGRESS", "CLOSED", "REJECTED", "NEW"]), closingNote: optionalText });

export async function setReportStatus(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("reports.manage");
    const report = await prisma.report.findUnique({ where: { id }, include: { actions: { select: { status: true } } } });
    if (!report) throw new UserError("Melding niet gevonden.");
    const { status, closingNote } = parseForm(statusSchema, formData);
    if (status === "CLOSED") {
      const problems = reportCloseProblems(report);
      if (problems.length) throw new UserError(`Afsluiten kan nog niet: ${problems.join(" ")}`);
    }
    if (status === "REJECTED" && !closingNote) throw new UserError("Geef bij afwijzen een toelichting.");
    await prisma.report.update({
      where: { id },
      data: {
        status,
        closingNote: closingNote ?? report.closingNote,
        closedAt: status === "CLOSED" || status === "REJECTED" ? new Date() : null,
      },
    });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Report",
      entityId: id,
      summary: `${reportDisplayCode(report)}: ${REPORT_STATUS_LABEL[report.status].toLowerCase()} → ${REPORT_STATUS_LABEL[status].toLowerCase()}`,
    });
    revalidateReports(id);
  });
}

const actionSchema = z.object({
  title: requiredText(300),
  description: optionalText,
  kind: z.enum(ActionKind).default("CORRECTIVE"),
  ownerId: optionalId,
  ownerText: optionalText,
  deadline: optionalDate,
  priority: z.enum(ActionPriority).default("MEDIUM"),
});

export async function createReportAction(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("actions.create");
    const { report } = await loadEditable(id);
    const data = parseForm(actionSchema, formData);
    const action = await prisma.action.create({
      data: {
        ...data,
        source: actionSourceForReport(report.type),
        reportId: id,
        createdById: user.id,
        disciplineId: report.disciplineId,
        locationId: report.locationId,
      },
    });
    if (report.status === "NEW") await prisma.report.update({ where: { id }, data: { status: "IN_PROGRESS" } });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Action",
      entityId: action.id,
      summary: `Actie #${action.number} aangemaakt vanuit ${reportDisplayCode(report)}`,
    });
    revalidateReports(id);
  });
}

export async function deleteReport(id: string): Promise<ActionResult> {
  const r = await safeAction(async () => {
    const user = await requirePermission("reports.manage");
    const report = await prisma.report.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "Report", entityId: id, summary: `${reportDisplayCode(report)} "${report.title}" verwijderd` });
    revalidateReports();
  });
  if (r?.error) return r;
  redirect("/meldingen");
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
  type: txt(200),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().min(1).max(5000),
  description: txt(10_000),
  origin: txt(200),
  location: txt(200),
  discipline: txt(200),
  reporter: txt(200),
  severity: txt(100),
  injury: txt(100),
  lostDays: txt(10),
  immediateAction: txt(10_000),
  rootCause: txt(10_000),
  owner: txt(200),
  status: txt(100),
  closedAt: isoDate,
});

/** Bestaand meldingen-, klachten- of ongevallenregister inlezen. Bijwerken op nummer; lege cellen wissen niets. */
export async function importReports(rowsInput: ImportRow[], options: { updateExisting: boolean }): Promise<ImportResult> {
  try {
    const user = await requirePermission("reports.manage");
    if (!Array.isArray(rowsInput) || rowsInput.length === 0) return { error: "Geen regels om te importeren." };
    if (rowsInput.length > 5000) return { error: "Maximaal 5000 regels per import." };
    const key = (s: string) => s.trim().toLowerCase();
    const [disciplines, locations, users] = await Promise.all([
      prisma.discipline.findMany({ select: { id: true, name: true, aliases: true } }),
      prisma.location.findMany({ select: { id: true, name: true } }),
      prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } }),
    ]);
    const discMap = disciplineMap(disciplines);
    const locMap = new Map(locations.map((l) => [key(l.name), l.id]));
    const userMap = new Map(users.flatMap((u) => [[key(u.name), u.id] as const, [key(u.email), u.id] as const]));
    const warnings: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const input of rowsInput) {
      const parsed = importRowSchema.safeParse(input);
      if (!parsed.success) {
        skipped++;
        warnings.push(`Rij ${typeof input?.rowNumber === "number" ? input.rowNumber : "?"}: datum of omschrijving ontbreekt of is ongeldig — overgeslagen`);
        continue;
      }
      const r = parsed.data;
      const title = r.title.length > 300 ? `${r.title.slice(0, 297)}…` : r.title;
      const type = parseReportType(r.type) ?? parseReportType(r.title) ?? "OTHER";
      const status = r.status !== undefined ? (parseReportStatus(r.status) ?? undefined) : undefined;
      if (r.status !== undefined && !status) warnings.push(`Rij ${r.rowNumber}: status "${r.status}" niet herkend — niet overgenomen`);
      const ownerId = r.owner ? userMap.get(key(r.owner)) : undefined;
      const values = {
        externalRef: r.externalRef,
        type,
        origin: r.origin !== undefined ? (parseReportOrigin(r.origin) ?? undefined) : undefined,
        title,
        description: r.title.length > 300 ? [r.title, r.description].filter(Boolean).join("\n\n") : r.description,
        occurredAt: new Date(`${r.occurredAt}T00:00:00Z`),
        locationId: r.location ? locMap.get(key(r.location)) : undefined,
        locationText: r.location && !locMap.has(key(r.location)) ? r.location : undefined,
        disciplineId: r.discipline ? discMap.get(key(r.discipline)) : undefined,
        reporterText: r.reporter,
        severity: r.severity !== undefined ? (parseReportSeverity(r.severity) ?? undefined) : undefined,
        injury: r.injury !== undefined ? (parseInjury(r.injury) ?? undefined) : undefined,
        lostDays: r.lostDays !== undefined && Number.isInteger(Number(r.lostDays)) ? Number(r.lostDays) : undefined,
        immediateAction: r.immediateAction,
        rootCause: r.rootCause,
        ownerId,
        ownerText: r.owner && !ownerId ? r.owner : undefined,
        status,
        closedAt: r.closedAt ? new Date(`${r.closedAt}T00:00:00Z`) : status === "CLOSED" ? new Date(`${r.occurredAt}T00:00:00Z`) : undefined,
      };
      const data = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as Prisma.ReportUncheckedUpdateInput;
      const existing = options.updateExisting && r.externalRef ? await prisma.report.findUnique({ where: { externalRef: r.externalRef } }) : null;
      try {
        if (existing) {
          await prisma.report.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.report.create({
            data: { ...(data as Prisma.ReportUncheckedCreateInput), type, title, occurredAt: values.occurredAt, reportedById: user.id },
          });
          created++;
        }
      } catch (err) {
        skipped++;
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
          warnings.push(`Rij ${r.rowNumber}: nummer "${r.externalRef}" komt dubbel voor — overgeslagen`);
        else {
          console.error("[import] melding mislukt", err);
          warnings.push(`Rij ${r.rowNumber}: opslaan mislukt — overgeslagen`);
        }
      }
    }
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Report",
      summary: `Import meldingen: ${created} nieuw, ${updated} bijgewerkt, ${skipped} overgeslagen`,
      details: { created, updated, skipped, warnings: warnings.slice(0, 200) },
    });
    revalidateReports();
    return { created, updated, skipped, warnings };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof UserError) return { error: err.message };
    console.error("[import] meldingen mislukt", err);
    return { error: "Import mislukt. Probeer het opnieuw." };
  }
}
