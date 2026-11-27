"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { ActionPriority, Applicability, ComplianceStatus, ImpactLevel, ImplementationStatus, LegalCategory, Prisma } from "@prisma/client";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { can, canAssessLegal } from "@/lib/rbac";
import { addMonths, legalCode, needsAction } from "@/lib/compliance";
import { optionalDate, optionalId, optionalText, optionalUrl, parseForm, requiredText } from "@/lib/forms";
import { parseApplicability, parseCategory, parseImpact, parseImplementationStatus, parseStatus } from "@/lib/legal-import";
import { parseYesNo, stripLeadingSymbols, type ImportResult, type ImportRow } from "@/lib/spreadsheet-import";
import { COMPLIANCE_STATUS_LABEL } from "@/lib/labels";

const ids = (max: number) => z.array(z.string().min(1)).max(max);

const legalSchema = z.object({
  title: requiredText(300),
  article: optionalText,
  subject: optionalText,
  description: optionalText,
  source: optionalText,
  sourceUrl: optionalUrl,
  externalRef: optionalText,
  category: z.enum(LegalCategory),
  theme: optionalText,
  regulationType: optionalText,
  applicability: z.enum(Applicability).default("YES"),
  implementationStatus: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.enum(ImplementationStatus).nullable())
    .optional()
    .transform((v) => v ?? null),
  impact: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.enum(ImpactLevel).nullable())
    .optional()
    .transform((v) => v ?? null),
  evidence: optionalText,
  ownerText: optionalText,
  nextStep: optionalText,
  origin: optionalText,
  ownerId: optionalId,
  disciplineId: optionalId,
  locationId: optionalId,
  nextReviewDate: optionalDate,
  reviewIntervalMonths: z.coerce.number().int().min(1, "Interval minimaal 1 maand").max(120, "Interval maximaal 120 maanden"),
  processIds: ids(500),
  documentIds: ids(1000),
  riskIds: ids(1000),
  requirementIds: ids(2000),
  normIds: ids(100),
});
const MULTI = ["processIds", "documentIds", "riskIds", "requirementIds", "normIds"];

function links(d: { processIds: string[]; documentIds: string[]; riskIds: string[]; requirementIds: string[]; normIds: string[] }, mode: "connect" | "set") {
  const m = (list: string[]) => ({ [mode]: list.map((id) => ({ id })) });
  return { processes: m(d.processIds), documents: m(d.documentIds), risks: m(d.riskIds), requirements: m(d.requirementIds), norms: m(d.normIds) };
}

function revalidateLegal(id?: string) {
  revalidatePath("/wetgeving", "layout");
  if (id) revalidatePath(`/wetgeving/${id}`);
  revalidatePath("/");
  revalidatePath("/normen", "layout");
  revalidatePath("/processen", "layout");
}

export async function createLegal(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("legal.edit");
    const { processIds, documentIds, riskIds, requirementIds, normIds, ...data } = parseForm(legalSchema, formData, MULTI);
    const req = await prisma.legalRequirement.create({
      data: { ...data, createdById: user.id, ...links({ processIds, documentIds, riskIds, requirementIds, normIds }, "connect") },
    });
    await logAudit({ user, action: "CREATE", entityType: "LegalRequirement", entityId: req.id, summary: `${legalCode(req.number)} "${req.title}" toegevoegd` });
    revalidateLegal();
    redirect(`/wetgeving/${req.id}`);
  });
}

export async function updateLegal(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("legal.edit");
    const existing = await prisma.legalRequirement.findUnique({ where: { id } });
    if (!existing) throw new UserError("Eis niet gevonden.");
    const { processIds, documentIds, riskIds, requirementIds, normIds, ...data } = parseForm(legalSchema, formData, MULTI);
    const active = formData.get("active") === "on";
    await prisma.legalRequirement.update({
      where: { id },
      data: { ...data, active, ...links({ processIds, documentIds, riskIds, requirementIds, normIds }, "set") },
    });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "LegalRequirement",
      entityId: id,
      summary: `${legalCode(existing.number)} gewijzigd${existing.active !== active ? (active ? " (weer actief)" : " (vervallen)") : ""}`,
      details: { ...data, active, nextReviewDate: data.nextReviewDate?.toISOString() ?? null, processIds, documentIds, riskIds, requirementIds, normIds },
    });
    revalidateLegal(id);
  });
}

export async function deleteLegal(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("legal.edit");
    const req = await prisma.legalRequirement.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "LegalRequirement", entityId: id, summary: `${legalCode(req.number)} "${req.title}" verwijderd` });
    revalidateLegal();
    redirect("/wetgeving");
  });
}

// ── Toetsing (evaluatie van de naleving) ──────────────────────

const assessmentSchema = z.object({
  date: z
    .string()
    .trim()
    .min(1, "Datum van de toetsing is verplicht")
    .transform((v, ctx) => {
      const d = new Date(`${v}T00:00:00Z`);
      if (isNaN(d.getTime())) {
        ctx.addIssue({ code: "custom", message: "Ongeldige datum" });
        return z.NEVER;
      }
      if (d.getTime() > Date.now() + 86_400_000) {
        ctx.addIssue({ code: "custom", message: "De datum van een toetsing kan niet in de toekomst liggen" });
        return z.NEVER;
      }
      return d;
    }),
  status: z.enum(ComplianceStatus).refine((s) => s !== "NOT_ASSESSED", { message: "Kies een uitkomst van de toetsing" }),
  explanation: optionalText,
  nextReviewDate: optionalDate,
  actionTitle: optionalText,
  actionOwnerId: optionalId,
  actionDeadline: optionalDate,
});

export async function recordAssessment(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const req = await prisma.legalRequirement.findUnique({
      where: { id },
      include: { actions: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { id: true } } },
    });
    if (!req) throw new UserError("Eis niet gevonden.");
    if (!canAssessLegal(user, req)) throw new UserError("Alleen QHSE of de eigenaar van deze eis kan een toetsing vastleggen.");
    const data = parseForm(assessmentSchema, formData);

    // Bij 'voldoet niet' direct een actie: verplicht, tenzij er al een open actie loopt.
    const wantsAction = !!data.actionTitle;
    if (data.status === "NON_COMPLIANT" && !wantsAction && req.actions.length === 0) {
      throw new UserError("Bij 'voldoet niet' hoort een actie. Vul de actie in (titel verplicht).");
    }
    if (wantsAction && !needsAction(data.status)) {
      throw new UserError("Een actie vanuit een toetsing kan alleen bij 'voldoet niet' of 'voldoet deels'.");
    }
    if (wantsAction && !can(user.role, "actions.create")) throw new UserError("Je mag geen acties aanmaken.");

    const nextReviewDate = data.nextReviewDate ?? (data.status === "NOT_APPLICABLE" ? null : addMonths(data.date, req.reviewIntervalMonths));
    // Alleen de meest recente toetsing bepaalt de actuele status (een oudere toetsing nalopen mag, maar overschrijft niets).
    const isLatest = !req.lastReviewDate || data.date >= req.lastReviewDate;

    const action = await prisma.$transaction(async (tx) => {
      await tx.complianceAssessment.create({
        data: { legalRequirementId: id, date: data.date, status: data.status, explanation: data.explanation, assessedById: user.id },
      });
      if (isLatest) {
        await tx.legalRequirement.update({
          where: { id },
          data: { status: data.status, explanation: data.explanation, lastReviewDate: data.date, nextReviewDate },
        });
      }
      if (!wantsAction) return null;
      return tx.action.create({
        data: {
          title: data.actionTitle!,
          source: "COMPLIANCE",
          priority: data.status === "NON_COMPLIANT" ? "HIGH" : "MEDIUM",
          legalRequirementId: id,
          ownerId: data.actionOwnerId ?? req.ownerId,
          deadline: data.actionDeadline,
          createdById: user.id,
          disciplineId: req.disciplineId,
          locationId: req.locationId,
          description: data.explanation,
        },
      });
    });

    await logAudit({
      user,
      action: "UPDATE",
      entityType: "LegalRequirement",
      entityId: id,
      summary: `${legalCode(req.number)} getoetst: ${COMPLIANCE_STATUS_LABEL[data.status].toLowerCase()}${isLatest ? "" : " (oudere toetsing, status niet gewijzigd)"}${action ? ` — actie #${action.number} aangemaakt` : ""}`,
    });
    revalidateLegal(id);
    revalidatePath("/acties");
  });
}

const legalActionSchema = z.object({
  title: requiredText(300),
  ownerId: optionalId,
  deadline: optionalDate,
  priority: z.enum(ActionPriority).default("MEDIUM"),
});

export async function createLegalAction(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("actions.create");
    const req = await prisma.legalRequirement.findUnique({ where: { id } });
    if (!req) throw new UserError("Eis niet gevonden.");
    const data = parseForm(legalActionSchema, formData);
    const action = await prisma.action.create({
      data: { ...data, source: "COMPLIANCE", legalRequirementId: id, createdById: user.id, disciplineId: req.disciplineId, locationId: req.locationId },
    });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Action",
      entityId: action.id,
      summary: `Actie #${action.number} aangemaakt vanuit ${legalCode(req.number)}`,
    });
    revalidateLegal(id);
    revalidatePath("/acties");
  });
}

// ── Import uit Excel / CSV ────────────────────────────────────

const importRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  externalRef: z.string().trim().max(100).optional(),
  title: z.string().trim().min(1).max(300),
  article: z.string().trim().max(300).optional(),
  subject: z.string().trim().max(300).optional(),
  description: z.string().trim().max(10_000).optional(),
  source: z.string().trim().max(300).optional(),
  sourceUrl: z.string().trim().max(2000).optional(),
  theme: z.string().trim().max(200).optional(),
  regulationType: z.string().trim().max(100).optional(),
  applicability: z.string().trim().max(100).optional(),
  appliesIso14001: z.string().trim().max(20).optional(),
  appliesCo2: z.string().trim().max(20).optional(),
  appliesVca: z.string().trim().max(20).optional(),
  appliesIso9001: z.string().trim().max(20).optional(),
  evidence: z.string().trim().max(5000).optional(),
  implementationStatus: z.string().trim().max(100).optional(),
  nextStep: z.string().trim().max(5000).optional(),
  impact: z.string().trim().max(50).optional(),
  riskRefs: z.string().trim().max(500).optional(),
  origin: z.string().trim().max(200).optional(),
  discipline: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
  owner: z.string().trim().max(200).optional(),
  status: z.string().trim().max(200).optional(),
  explanation: z.string().trim().max(10_000).optional(),
  lastReviewDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  nextReviewDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/**
 * Importeer regels in het register. Bestaande eisen worden bijgewerkt op kenmerk,
 * of anders op wet + artikel. Lege cellen wissen geen bestaande waarden.
 */
export async function importLegal(rowsInput: ImportRow[], options: { updateExisting: boolean }): Promise<ImportResult> {
  try {
    const user = await requirePermission("legal.edit");
    if (!Array.isArray(rowsInput) || rowsInput.length === 0) return { error: "Geen regels om te importeren." };
    if (rowsInput.length > 5000) return { error: "Maximaal 5000 regels per import." };

    const [disciplines, locations, users] = await Promise.all([
      prisma.discipline.findMany({ select: { id: true, name: true } }),
      prisma.location.findMany({ select: { id: true, name: true } }),
      prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } }),
    ]);
    const key = (s: string) => s.trim().toLowerCase();
    const discMap = new Map(disciplines.map((d) => [key(d.name), d.id]));
    const locMap = new Map(locations.map((l) => [key(l.name), l.id]));
    const userMap = new Map(users.flatMap((u) => [[key(u.name), u.id] as const, [key(u.email), u.id] as const]));

    // "Geldt voor"-kolommen → normen (op code); risicoregister-nummers → risico's (op eigen nummer).
    const normCodes = { appliesIso14001: "ISO 14001", appliesCo2: "CO2-prestatieladder", appliesVca: "VCA**", appliesIso9001: "ISO 9001" } as const;
    const norms = await prisma.norm.findMany({ where: { code: { in: Object.values(normCodes) } }, select: { id: true, code: true } });
    const normByCode = new Map(norms.map((n) => [n.code, n.id]));
    const riskRows = await prisma.risk.findMany({ where: { externalRef: { not: null } }, select: { id: true, externalRef: true } });
    const riskByRef = new Map(riskRows.map((r) => [r.externalRef!.toUpperCase(), r.id]));
    const warnings: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const input of rowsInput) {
      const parsed = importRowSchema.safeParse(input);
      if (!parsed.success) {
        skipped++;
        warnings.push(`Rij ${typeof input?.rowNumber === "number" ? input.rowNumber : "?"}: ongeldige gegevens — overgeslagen`);
        continue;
      }
      const r = parsed.data;
      const lookup = (map: Map<string, string>, value: string | undefined, label: string) => {
        if (!value) return undefined;
        const id = map.get(key(value));
        if (!id) warnings.push(`Rij ${r.rowNumber}: ${label} "${value}" niet gevonden — leeg gelaten`);
        return id;
      };
      const status = r.status !== undefined ? (parseStatus(r.status) ?? "NOT_ASSESSED") : undefined;
      const sourceUrl = r.sourceUrl && /^https:\/\//i.test(r.sourceUrl) ? r.sourceUrl : undefined;
      // Geen link maar een omschrijving (bijv. "wetten.nl - Arbeidsomstandighedenwet"): bewaren als bronvermelding.
      const sourceText = r.sourceUrl && !sourceUrl && !r.source ? r.sourceUrl.slice(0, 300) : r.source;
      const toDate = (iso?: string) => (iso ? new Date(`${iso}T00:00:00Z`) : undefined);

      const values = {
        title: r.title,
        article: r.article,
        subject: r.subject,
        description: r.description,
        source: sourceText,
        sourceUrl,
        externalRef: r.externalRef,
        theme: r.theme !== undefined ? stripLeadingSymbols(r.theme) : undefined,
        category: r.theme !== undefined ? parseCategory(`${r.theme} ${r.title}`) : undefined,
        regulationType: r.regulationType,
        applicability: r.applicability !== undefined ? (parseApplicability(r.applicability) ?? undefined) : undefined,
        implementationStatus: r.implementationStatus !== undefined ? (parseImplementationStatus(r.implementationStatus) ?? undefined) : undefined,
        evidence: r.evidence,
        nextStep: r.nextStep,
        impact: r.impact !== undefined ? (parseImpact(r.impact) ?? undefined) : undefined,
        origin: r.origin,
        ownerText: r.owner,
        disciplineId: lookup(discMap, r.discipline, "discipline"),
        locationId: lookup(locMap, r.location, "locatie"),
        ownerId: r.owner ? userMap.get(key(r.owner)) : undefined, // eigenaar is vaak een functie (bijv. "BU-directeur Afval"); die staat in ownerText
        status,
        explanation: r.explanation,
        lastReviewDate: toDate(r.lastReviewDate),
        nextReviewDate: toDate(r.nextReviewDate),
      };
      if (r.applicability && !values.applicability) warnings.push(`Rij ${r.rowNumber}: "van toepassing" = "${r.applicability}" niet herkend`);
      if (r.implementationStatus && !values.implementationStatus) warnings.push(`Rij ${r.rowNumber}: status "${r.implementationStatus}" niet herkend`);

      // Geldt voor: alleen bijwerken als een van die kolommen is gekoppeld.
      const flagKeys = (Object.keys(normCodes) as (keyof typeof normCodes)[]).filter((f) => r[f] !== undefined || rowsInput.some((x) => f in x));
      const normIds = flagKeys.length
        ? flagKeys
            .filter((f) => parseYesNo(r[f]) === true)
            .map((f) => normByCode.get(normCodes[f]))
            .filter((x): x is string => !!x)
        : undefined;
      for (const f of flagKeys)
        if (parseYesNo(r[f]) === true && !normByCode.get(normCodes[f]))
          warnings.push(`Rij ${r.rowNumber}: norm "${normCodes[f]}" bestaat niet in Normenbeheer — koppeling overgeslagen`);
      // Risicoregister: "R01, R02"
      let riskIds: string[] | undefined;
      if (r.riskRefs !== undefined) {
        riskIds = [];
        for (const ref of r.riskRefs
          .split(/[,;\s]+/)
          .map((x) => x.trim().toUpperCase())
          .filter((x) => /^[RK]\d+/.test(x))) {
          const id = riskByRef.get(ref);
          if (id) riskIds.push(id);
          else warnings.push(`Rij ${r.rowNumber}: risico ${ref} niet gevonden (importeer eerst het risico- en kansenregister) — koppeling overgeslagen`);
        }
      }
      const links = {
        ...(normIds ? { norms: { set: normIds.map((id) => ({ id })) } } : {}),
        ...(riskIds ? { risks: { set: riskIds.map((id) => ({ id })) } } : {}),
      };

      // Lege velden niet meesturen: bestaande waarden blijven staan.
      const data = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as Prisma.LegalRequirementUncheckedUpdateInput;

      const existing = options.updateExisting
        ? r.externalRef
          ? await prisma.legalRequirement.findUnique({ where: { externalRef: r.externalRef } })
          : await prisma.legalRequirement.findFirst({
              where: { title: { equals: r.title, mode: "insensitive" }, article: r.article ? { equals: r.article, mode: "insensitive" } : null },
            })
        : null;

      try {
        if (existing) {
          await prisma.legalRequirement.update({ where: { id: existing.id }, data: { ...data, ...links } });
          // Alleen een toetsing in de historie als de datum van de laatste controle bekend is (geen verzonnen datums).
          if (status && status !== "NOT_ASSESSED" && status !== existing.status && values.lastReviewDate) {
            await prisma.complianceAssessment.create({
              data: {
                legalRequirementId: existing.id,
                date: values.lastReviewDate,
                status,
                explanation: "Overgenomen uit import",
                assessedById: user.id,
              },
            });
          }
          updated++;
        } else {
          const createdReq = await prisma.legalRequirement.create({
            data: {
              ...(data as Prisma.LegalRequirementUncheckedCreateInput),
              title: r.title,
              // Geen categoriekolom? Leid de categorie af uit wet en onderwerp.
              category: values.category ?? parseCategory(`${r.title} ${r.subject ?? ""} ${r.description ?? ""}`),
              createdById: user.id,
              ...(normIds ? { norms: { connect: normIds.map((id) => ({ id })) } } : {}),
              ...(riskIds ? { risks: { connect: riskIds.map((id) => ({ id })) } } : {}),
            },
          });
          if (status && status !== "NOT_ASSESSED" && values.lastReviewDate) {
            await prisma.complianceAssessment.create({
              data: {
                legalRequirementId: createdReq.id,
                date: values.lastReviewDate,
                status,
                explanation: "Overgenomen uit import",
                assessedById: user.id,
              },
            });
          }
          created++;
        }
      } catch (err) {
        skipped++;
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
          warnings.push(`Rij ${r.rowNumber}: kenmerk "${r.externalRef}" komt dubbel voor — overgeslagen`);
        else {
          console.error("[import] rij mislukt", err);
          warnings.push(`Rij ${r.rowNumber}: opslaan mislukt — overgeslagen`);
        }
      }
    }

    await logAudit({
      user,
      action: "CREATE",
      entityType: "LegalRequirement",
      summary: `Import register wet- en regelgeving: ${created} nieuw, ${updated} bijgewerkt, ${skipped} overgeslagen`,
      details: { created, updated, skipped, warnings: warnings.slice(0, 200) },
    });
    revalidateLegal();
    return { created, updated, skipped, warnings };
  } catch (err) {
    unstable_rethrow(err); // doorsturen naar login e.d.
    if (err instanceof UserError) return { error: err.message };
    console.error("[import] mislukt", err);
    return { error: "Import mislukt. Probeer het opnieuw." };
  }
}
