"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { ActionPriority, Prisma, RiskCategory, RiskStatus, RiskType, TreatmentStatus } from "@prisma/client";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEditRisk } from "@/lib/rbac";
import { riskDisplayCode } from "@/lib/risk";
import { addMonths } from "@/lib/compliance";
import { categoryFromTheme, parseRiskType, parseStrategic, parseTreatmentStatus, splitBUs } from "@/lib/risk-import";
import { normText, type ImportResult, type ImportRow } from "@/lib/spreadsheet-import";
import { optionalDate, optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";
import { RISK_STATUS_LABEL } from "@/lib/labels";

const score = z.coerce.number().int().min(1).max(5);
const optionalScore = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().int().min(1).max(5).nullable())
  .optional()
  .transform((v) => v ?? null);

const riskSchema = z
  .object({
    type: z.enum(RiskType),
    category: z.enum(RiskCategory),
    title: requiredText(300),
    description: optionalText,
    cause: optionalText,
    consequence: optionalText,
    measures: optionalText,
    likelihoodBefore: score,
    impactBefore: score,
    likelihoodAfter: optionalScore,
    impactAfter: optionalScore,
    ownerId: optionalId,
    locationId: optionalId,
    reviewDate: optionalDate,
    externalRef: optionalText,
    strategic: z
      .string()
      .optional()
      .transform((v) => v === "on"),
    origin: optionalText,
    contextFactor: optionalText,
    theme: optionalText,
    ownerText: optionalText,
    term: optionalText,
    treatmentStatus: z.enum(TreatmentStatus).default("OPEN"),
    monitoring: optionalText,
    framework: optionalText,
    notes: optionalText,
    lastReviewedAt: optionalDate,
    disciplineIds: z.array(z.string().min(1)).max(50),
    processIds: z.array(z.string().min(1)).max(500),
    requirementIds: z.array(z.string().min(1)).max(2000),
  })
  .refine((v) => (v.likelihoodAfter == null) === (v.impactAfter == null), {
    message: "Vul bij 'na maatregelen' zowel kans als effect in, of laat beide leeg",
    path: ["likelihoodAfter"],
  });

const MULTI = ["processIds", "requirementIds", "disciplineIds"];

function revalidateRisks(id?: string) {
  revalidatePath("/risicos");
  if (id) revalidatePath(`/risicos/${id}`);
  revalidatePath("/");
  revalidatePath("/normen", "layout");
  revalidatePath("/processen", "layout");
}

export async function createRisk(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("risks.create");
    const { processIds, requirementIds, disciplineIds, ...data } = parseForm(riskSchema, formData, MULTI);
    const risk = await prisma.risk.create({
      data: {
        ...data,
        createdById: user.id,
        processes: { connect: processIds.map((id) => ({ id })) },
        disciplines: { connect: disciplineIds.map((id) => ({ id })) },
        requirements: { connect: requirementIds.map((id) => ({ id })) },
      },
    });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Risk",
      entityId: risk.id,
      summary: `${riskDisplayCode(risk)} "${risk.title}" aangemaakt`,
    });
    revalidateRisks();
    redirect(`/risicos/${risk.id}`);
  });
}

async function loadEditable(id: string) {
  const user = await requireUser();
  const risk = await prisma.risk.findUnique({ where: { id } });
  if (!risk) throw new UserError("Risico niet gevonden.");
  if (!canEditRisk(user, risk)) throw new UserError("Alleen de eigenaar, de aanmaker of QHSE kan dit risico wijzigen.");
  return { user, risk };
}

export async function updateRisk(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, risk } = await loadEditable(id);
    const parsed = parseForm(riskSchema, formData, MULTI);
    const status = z.enum(RiskStatus).parse(formData.get("status") ?? risk.status);
    const { processIds, requirementIds, disciplineIds, ...data } = parsed;
    await prisma.risk.update({
      where: { id },
      data: {
        ...data,
        status,
        processes: { set: processIds.map((p) => ({ id: p })) },
        disciplines: { set: disciplineIds.map((d) => ({ id: d })) },
        requirements: { set: requirementIds.map((r) => ({ id: r })) },
      },
    });
    const scoreChange =
      risk.likelihoodAfter !== data.likelihoodAfter ||
      risk.impactAfter !== data.impactAfter ||
      risk.likelihoodBefore !== data.likelihoodBefore ||
      risk.impactBefore !== data.impactBefore;
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Risk",
      entityId: id,
      summary: `${riskDisplayCode({ ...risk, type: data.type })} gewijzigd${scoreChange ? " (beoordeling aangepast)" : ""}${risk.status !== status ? ` (status ${RISK_STATUS_LABEL[risk.status].split(" —")[0]} → ${RISK_STATUS_LABEL[status].split(" —")[0]})` : ""}`,
      details: {
        ...data,
        status,
        reviewDate: data.reviewDate?.toISOString() ?? null,
        lastReviewedAt: data.lastReviewedAt?.toISOString() ?? null,
        processIds,
        requirementIds,
        disciplineIds,
      },
    });
    revalidateRisks(id);
  });
}

export async function deleteRisk(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("risks.editAny");
    const risk = await prisma.risk.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "Risk", entityId: id, summary: `${riskDisplayCode(risk)} "${risk.title}" verwijderd` });
    revalidateRisks();
    redirect("/risicos");
  });
}

const riskActionSchema = z.object({
  title: requiredText(300),
  ownerId: optionalId,
  deadline: optionalDate,
  priority: z.enum(ActionPriority).default("MEDIUM"),
});

/** Maatregel als actie vastleggen, gekoppeld aan het risico (bron: Risico / kans). */
export async function createRiskAction(riskId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("actions.create");
    const risk = await prisma.risk.findUnique({
      where: { id: riskId },
      include: { requirements: { select: { id: true } }, disciplines: { select: { id: true } } },
    });
    if (!risk) throw new UserError("Risico niet gevonden.");
    const data = parseForm(riskActionSchema, formData);
    const action = await prisma.action.create({
      data: {
        ...data,
        source: "RISK",
        riskId,
        createdById: user.id,
        disciplineId: risk.disciplines.length === 1 ? risk.disciplines[0].id : null,
        locationId: risk.locationId,
        requirements: { connect: risk.requirements },
      },
    });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Action",
      entityId: action.id,
      summary: `Actie #${action.number} aangemaakt vanuit ${riskDisplayCode(risk)}`,
    });
    revalidateRisks(riskId);
    revalidatePath("/acties");
  });
}

// ── Import uit het eigen register (Excel) ─────────────────────

const imp = (max: number) => z.string().trim().max(max).optional();
const importRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  externalRef: imp(30),
  type: imp(50),
  title: z.string().trim().min(1).max(300),
  origin: imp(100),
  priority: imp(100),
  contextFactor: imp(200),
  theme: imp(200),
  bu: imp(300),
  cause: imp(5000),
  consequence: imp(5000),
  likelihood: z.string().trim().min(1),
  impact: z.string().trim().min(1),
  measures: imp(5000),
  owner: imp(200),
  term: imp(50),
  treatmentStatus: imp(50),
  monitoring: imp(1000),
  framework: imp(300),
  likelihoodAfter: imp(5),
  impactAfter: imp(5),
  lastReviewedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: imp(2000),
  location: imp(200),
});

/**
 * Importeer risico's en kansen. Bijwerken op het eigen nummer (R01, K12), anders op omschrijving + soort.
 * Lege cellen wissen niets. Een BU-kolom vervangt de BU's van de regel ("Groep" = bedrijfsbreed).
 * Volgende beoordeling = laatst beoordeeld + 12 maanden (minstens jaarlijks herbeoordelen).
 */
export async function importRisks(rowsInput: ImportRow[], options: { updateExisting: boolean }): Promise<ImportResult> {
  try {
    const user = await requirePermission("risks.editAny");
    if (!Array.isArray(rowsInput) || rowsInput.length === 0) return { error: "Geen regels om te importeren." };
    if (rowsInput.length > 5000) return { error: "Maximaal 5000 regels per import." };

    const [disciplines, locations, users] = await Promise.all([
      prisma.discipline.findMany({ select: { id: true, name: true } }),
      prisma.location.findMany({ select: { id: true, name: true } }),
      prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } }),
    ]);
    const k = (s: string) => normText(s);
    const discMap = new Map(disciplines.map((d) => [k(d.name), d.id]));
    const locMap = new Map(locations.map((l) => [k(l.name), l.id]));
    const userMap = new Map(users.flatMap((u) => [[k(u.name), u.id] as const, [k(u.email), u.id] as const]));

    const warnings: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const input of rowsInput) {
      const parsed = importRowSchema.safeParse(input);
      if (!parsed.success) {
        skipped++;
        warnings.push(
          `Rij ${typeof input?.rowNumber === "number" ? input.rowNumber : "?"}: ongeldige of onvolledige gegevens (omschrijving, kans en effect zijn verplicht) — overgeslagen`,
        );
        continue;
      }
      const r = parsed.data;
      const scale = (v: string | undefined, label: string, required: boolean) => {
        if (v === undefined || v === "") return required ? null : undefined;
        const n = Number(v);
        if (Number.isInteger(n) && n >= 1 && n <= 5) return n;
        warnings.push(`Rij ${r.rowNumber}: ${label} "${v}" valt buiten 1–5`);
        return required ? null : undefined;
      };
      const likelihood = scale(r.likelihood, "kans", true);
      const impact = scale(r.impact, "effect", true);
      if (!likelihood || !impact) {
        skipped++;
        warnings.push(`Rij ${r.rowNumber}: kans en effect (1–5) zijn verplicht — overgeslagen`);
        continue;
      }
      const likelihoodAfter = scale(r.likelihoodAfter, "restkans", false);
      const impactAfter = scale(r.impactAfter, "resteffect", false);
      if ((likelihoodAfter === undefined) !== (impactAfter === undefined))
        warnings.push(`Rij ${r.rowNumber}: alleen restkans óf resteffect ingevuld — restscore overgeslagen`);

      const type = parseRiskType(r.type, r.externalRef);
      const treatmentStatus = r.treatmentStatus !== undefined ? parseTreatmentStatus(r.treatmentStatus) : undefined;
      if (r.treatmentStatus && !treatmentStatus) warnings.push(`Rij ${r.rowNumber}: status "${r.treatmentStatus}" niet herkend — "Open" aangenomen`);
      let disciplineIds: string[] | undefined;
      if (r.bu !== undefined) {
        disciplineIds = [];
        for (const name of splitBUs(r.bu)) {
          const id = discMap.get(k(name));
          if (id) disciplineIds.push(id);
          else warnings.push(`Rij ${r.rowNumber}: BU "${name}" niet gevonden (voeg die toe onder Stamgegevens) — weggelaten`);
        }
      }
      const locationId = r.location ? locMap.get(k(r.location)) : undefined;
      if (r.location && !locationId) warnings.push(`Rij ${r.rowNumber}: locatie "${r.location}" niet gevonden — leeg gelaten`);
      const lastReviewedAt = r.lastReviewedAt ? new Date(`${r.lastReviewedAt}T00:00:00Z`) : undefined;

      const values = {
        externalRef: r.externalRef,
        type,
        title: r.title,
        origin: r.origin,
        strategic: r.priority !== undefined || r.origin !== undefined ? parseStrategic(r.priority, r.origin) : undefined,
        contextFactor: r.contextFactor,
        theme: r.theme,
        category: r.theme !== undefined ? categoryFromTheme(r.theme) : undefined,
        cause: r.cause,
        consequence: r.consequence,
        likelihoodBefore: likelihood,
        impactBefore: impact,
        measures: r.measures,
        ownerText: r.owner,
        ownerId: r.owner ? userMap.get(k(r.owner)) : undefined,
        term: r.term,
        treatmentStatus: treatmentStatus ?? (r.treatmentStatus !== undefined ? "OPEN" : undefined),
        monitoring: r.monitoring,
        framework: r.framework,
        likelihoodAfter: likelihoodAfter !== undefined && impactAfter !== undefined ? likelihoodAfter : undefined,
        impactAfter: likelihoodAfter !== undefined && impactAfter !== undefined ? impactAfter : undefined,
        lastReviewedAt,
        reviewDate: lastReviewedAt ? addMonths(lastReviewedAt, 12) : undefined,
        notes: r.notes,
        locationId,
      };
      const data = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as Prisma.RiskUncheckedUpdateInput;

      try {
        const existing = options.updateExisting
          ? r.externalRef
            ? await prisma.risk.findUnique({ where: { externalRef: r.externalRef } })
            : await prisma.risk.findFirst({ where: { title: { equals: r.title, mode: "insensitive" }, type } })
          : null;
        if (existing) {
          await prisma.risk.update({
            where: { id: existing.id },
            data: { ...data, ...(disciplineIds ? { disciplines: { set: disciplineIds.map((id) => ({ id })) } } : {}) },
          });
          updated++;
        } else {
          await prisma.risk.create({
            data: {
              ...(data as Prisma.RiskUncheckedCreateInput),
              title: r.title,
              likelihoodBefore: likelihood,
              impactBefore: impact,
              createdById: user.id,
              ...(disciplineIds ? { disciplines: { connect: disciplineIds.map((id) => ({ id })) } } : {}),
            },
          });
          created++;
        }
      } catch (err) {
        skipped++;
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
          warnings.push(`Rij ${r.rowNumber}: nummer "${r.externalRef}" komt dubbel voor — overgeslagen`);
        else {
          console.error("[import] rij mislukt", err);
          warnings.push(`Rij ${r.rowNumber}: opslaan mislukt — overgeslagen`);
        }
      }
    }

    await logAudit({
      user,
      action: "CREATE",
      entityType: "Risk",
      summary: `Import risico- en kansenregister: ${created} nieuw, ${updated} bijgewerkt, ${skipped} overgeslagen`,
      details: { created, updated, skipped, warnings: warnings.slice(0, 200) },
    });
    revalidateRisks();
    return { created, updated, skipped, warnings };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof UserError) return { error: err.message };
    console.error("[import] mislukt", err);
    return { error: "Import mislukt. Probeer het opnieuw." };
  }
}
