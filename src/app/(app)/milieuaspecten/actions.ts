"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { ActionPriority, AspectType, OperatingSituation, Prisma } from "@prisma/client";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { aspectCode, aspectScore, defaultCo2Relevant, determineSignificance, SIGNIFICANCE_THRESHOLD_KEY } from "@/lib/aspects";
import { getSignificanceThreshold } from "@/lib/settings";
import { optionalDate, optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";
import { parseAspectType, parseSituation } from "@/lib/aspect-import";
import { parseYesNo, type ImportResult, type ImportRow } from "@/lib/spreadsheet-import";

const ids = (max: number) => z.array(z.string().min(1)).max(max);
const scale = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().int().min(1, "Scores lopen van 1 tot 5").max(5, "Scores lopen van 1 tot 5").nullable())
  .optional()
  .transform((v) => v ?? null);
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on");

const aspectSchema = z
  .object({
    activity: requiredText(300),
    aspect: requiredText(300),
    aspectType: z.enum(AspectType),
    impact: optionalText,
    situation: z.enum(OperatingSituation),
    controls: optionalText,
    frequency: scale,
    severity: scale,
    extent: scale,
    ownScore: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .pipe(z.number().int().min(0).max(100_000).nullable())
      .optional()
      .transform((v) => v ?? null),
    legalApplies: checkbox,
    stakeholderConcern: checkbox,
    co2Relevant: checkbox,
    significanceManual: checkbox,
    manualSignificant: z.enum(["ja", "nee"]).optional(),
    significanceReason: optionalText,
    externalRef: optionalText,
    ownerId: optionalId,
    disciplineId: optionalId,
    locationId: optionalId,
    reviewDate: optionalDate,
    processIds: ids(500),
    riskIds: ids(1000),
    legalIds: ids(3000),
    requirementIds: ids(2000),
  })
  .refine((v) => !v.significanceManual || (v.manualSignificant && v.significanceReason), {
    message: "Bij een handmatige bepaling: kies significant ja/nee en geef een toelichting",
    path: ["significanceReason"],
  });
const MULTI = ["processIds", "riskIds", "legalIds", "requirementIds"];

/** Velden + berekende score en significantie uit het formulier. */
async function toData(input: z.infer<typeof aspectSchema>) {
  const threshold = await getSignificanceThreshold();
  const { processIds, riskIds, legalIds, requirementIds, ownScore, manualSignificant, ...rest } = input;
  const score = aspectScore(rest.frequency, rest.severity, rest.extent) ?? ownScore;
  const sig = determineSignificance({
    score,
    threshold,
    legalApplies: rest.legalApplies || legalIds.length > 0,
    stakeholderConcern: rest.stakeholderConcern,
    manual: rest.significanceManual ? { significant: manualSignificant === "ja", reason: rest.significanceReason ?? null } : null,
  });
  return {
    links: { processIds, riskIds, legalIds, requirementIds },
    data: { ...rest, score, significant: sig.significant, significanceReason: rest.significanceManual ? rest.significanceReason : null },
  };
}

function linkData(l: { processIds: string[]; riskIds: string[]; legalIds: string[]; requirementIds: string[] }, mode: "connect" | "set") {
  const m = (list: string[]) => ({ [mode]: list.map((id) => ({ id })) });
  return { processes: m(l.processIds), risks: m(l.riskIds), legalRequirements: m(l.legalIds), requirements: m(l.requirementIds) };
}

function revalidateAspects(id?: string) {
  revalidatePath("/milieuaspecten", "layout");
  if (id) revalidatePath(`/milieuaspecten/${id}`);
  revalidatePath("/");
  revalidatePath("/normen", "layout");
  revalidatePath("/processen", "layout");
  revalidatePath("/wetgeving", "layout");
}

export async function createAspect(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("aspects.edit");
    const { data, links } = await toData(parseForm(aspectSchema, formData, MULTI));
    const aspect = await prisma.environmentalAspect.create({ data: { ...data, createdById: user.id, ...linkData(links, "connect") } });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "EnvironmentalAspect",
      entityId: aspect.id,
      summary: `${aspectCode(aspect.number)} "${aspect.aspect}" toegevoegd`,
    });
    revalidateAspects();
    redirect(`/milieuaspecten/${aspect.id}`);
  });
}

export async function updateAspect(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("aspects.edit");
    const existing = await prisma.environmentalAspect.findUnique({ where: { id } });
    if (!existing) throw new UserError("Milieuaspect niet gevonden.");
    const { data, links } = await toData(parseForm(aspectSchema, formData, MULTI));
    const active = formData.get("active") === "on";
    await prisma.environmentalAspect.update({ where: { id }, data: { ...data, active, ...linkData(links, "set") } });
    const change = existing.significant !== data.significant ? (data.significant ? " (nu significant)" : " (niet meer significant)") : "";
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "EnvironmentalAspect",
      entityId: id,
      summary: `${aspectCode(existing.number)} gewijzigd${change}`,
      details: { ...data, active, reviewDate: data.reviewDate?.toISOString() ?? null, ...links },
    });
    revalidateAspects(id);
  });
}

export async function deleteAspect(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("aspects.edit");
    const a = await prisma.environmentalAspect.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "EnvironmentalAspect", entityId: id, summary: `${aspectCode(a.number)} "${a.aspect}" verwijderd` });
    revalidateAspects();
    redirect("/milieuaspecten");
  });
}

/** Herbereken de significantie van alle niet-handmatig bepaalde aspecten (na wijziging van de drempel). */
async function recalculateAll(threshold: number) {
  const aspects = await prisma.environmentalAspect.findMany({
    where: { significanceManual: false },
    select: { id: true, score: true, legalApplies: true, stakeholderConcern: true, significant: true, _count: { select: { legalRequirements: true } } },
  });
  const updates = aspects
    .map((a) => ({
      a,
      significant: determineSignificance({
        score: a.score,
        threshold,
        legalApplies: a.legalApplies || a._count.legalRequirements > 0,
        stakeholderConcern: a.stakeholderConcern,
      }).significant,
    }))
    .filter((x) => x.significant !== x.a.significant);
  if (updates.length)
    await prisma.$transaction(updates.map((u) => prisma.environmentalAspect.update({ where: { id: u.a.id }, data: { significant: u.significant } })));
  return updates.length;
}

export async function setSignificanceThreshold(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("aspects.edit");
    const { threshold } = parseForm(
      z.object({ threshold: z.coerce.number().int().min(1, "Drempel tussen 1 en 125").max(125, "Drempel tussen 1 en 125") }),
      formData,
    );
    const old = await getSignificanceThreshold();
    await prisma.appSetting.upsert({
      where: { key: SIGNIFICANCE_THRESHOLD_KEY },
      update: { value: String(threshold), updatedById: user.id },
      create: { key: SIGNIFICANCE_THRESHOLD_KEY, value: String(threshold), updatedById: user.id },
    });
    const changed = await recalculateAll(threshold);
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "AppSetting",
      entityId: SIGNIFICANCE_THRESHOLD_KEY,
      summary: `Drempel significantie milieuaspecten ${old} → ${threshold} (${changed} aspect(en) gewijzigd)`,
    });
    revalidateAspects();
  });
}

const aspectActionSchema = z.object({
  title: requiredText(300),
  ownerId: optionalId,
  deadline: optionalDate,
  priority: z.enum(ActionPriority).default("MEDIUM"),
});

export async function createAspectAction(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("actions.create");
    const a = await prisma.environmentalAspect.findUnique({ where: { id }, include: { requirements: { select: { id: true } } } });
    if (!a) throw new UserError("Milieuaspect niet gevonden.");
    const data = parseForm(aspectActionSchema, formData);
    const action = await prisma.action.create({
      data: {
        ...data,
        source: "ENVIRONMENTAL_ASPECT",
        environmentalAspectId: id,
        createdById: user.id,
        disciplineId: a.disciplineId,
        locationId: a.locationId,
        requirements: { connect: a.requirements },
      },
    });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Action",
      entityId: action.id,
      summary: `Actie #${action.number} aangemaakt vanuit ${aspectCode(a.number)}`,
    });
    revalidateAspects(id);
    revalidatePath("/acties");
  });
}

// ── Import ────────────────────────────────────────────────────

const txt = (max: number) => z.string().trim().max(max).optional();
const importRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  externalRef: txt(100),
  activity: z.string().trim().min(1).max(300),
  aspect: z.string().trim().min(1).max(300),
  aspectType: txt(200),
  impact: txt(5000),
  situation: txt(200),
  discipline: txt(200),
  location: txt(200),
  owner: txt(200),
  controls: txt(10_000),
  frequency: txt(10),
  severity: txt(10),
  extent: txt(10),
  score: txt(10),
  significant: txt(100),
  legalApplies: txt(100),
  stakeholderConcern: txt(100),
  co2Relevant: txt(100),
  reviewDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/**
 * Importeer het milieuaspectenregister. Bijwerken op kenmerk, anders op activiteit + aspect + situatie.
 * Een significantiekolom uit het eigen register wordt overgenomen als handmatige bepaling, zodat de
 * bestaande beoordelingsmethode leidend blijft. Lege cellen wissen geen bestaande waarden.
 */
export async function importAspects(rowsInput: ImportRow[], options: { updateExisting: boolean }): Promise<ImportResult> {
  try {
    const user = await requirePermission("aspects.edit");
    if (!Array.isArray(rowsInput) || rowsInput.length === 0) return { error: "Geen regels om te importeren." };
    if (rowsInput.length > 5000) return { error: "Maximaal 5000 regels per import." };
    const threshold = await getSignificanceThreshold();

    const [disciplines, locations, users] = await Promise.all([
      prisma.discipline.findMany({ select: { id: true, name: true } }),
      prisma.location.findMany({ select: { id: true, name: true } }),
      prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } }),
    ]);
    const key = (s: string) => s.trim().toLowerCase();
    const discMap = new Map(disciplines.map((d) => [key(d.name), d.id]));
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
      const scaleValue = (v: string | undefined, label: string) => {
        if (v === undefined) return undefined;
        const n = Number(v);
        if (Number.isInteger(n) && n >= 1 && n <= 5) return n;
        warnings.push(`Rij ${r.rowNumber}: ${label} "${v}" valt buiten 1–5 — overgeslagen`);
        return undefined;
      };
      const yesNo = (v: string | undefined) => (v === undefined ? undefined : (parseYesNo(v) ?? undefined));
      const situation = r.situation !== undefined ? (parseSituation(r.situation) ?? undefined) : undefined;
      if (r.situation !== undefined && !situation) warnings.push(`Rij ${r.rowNumber}: situatie "${r.situation}" niet herkend — normaal aangenomen`);

      const frequency = scaleValue(r.frequency, "frequentie");
      const severity = scaleValue(r.severity, "ernst");
      const extent = scaleValue(r.extent, "omvang");
      const ownScore = r.score !== undefined && Number.isInteger(Number(r.score)) ? Number(r.score) : undefined;
      const importedSignificant = yesNo(r.significant);
      const values = {
        externalRef: r.externalRef,
        activity: r.activity,
        aspect: r.aspect,
        aspectType: parseAspectType(r.aspectType, r.aspect, r.impact),
        impact: r.impact,
        situation,
        controls: r.controls,
        frequency,
        severity,
        extent,
        legalApplies: yesNo(r.legalApplies),
        stakeholderConcern: yesNo(r.stakeholderConcern),
        co2Relevant: yesNo(r.co2Relevant),
        disciplineId: lookup(discMap, r.discipline, "discipline"),
        locationId: lookup(locMap, r.location, "locatie"),
        ownerId: lookup(userMap, r.owner, "eigenaar"),
        reviewDate: r.reviewDate ? new Date(`${r.reviewDate}T00:00:00Z`) : undefined,
      };
      const data = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as Prisma.EnvironmentalAspectUncheckedUpdateInput;

      const existing = options.updateExisting
        ? r.externalRef
          ? await prisma.environmentalAspect.findUnique({ where: { externalRef: r.externalRef }, include: { _count: { select: { legalRequirements: true } } } })
          : await prisma.environmentalAspect.findFirst({
              where: {
                activity: { equals: r.activity, mode: "insensitive" },
                aspect: { equals: r.aspect, mode: "insensitive" },
                situation: situation ?? "NORMAL",
              },
              include: { _count: { select: { legalRequirements: true } } },
            })
        : null;

      // Score en significantie op basis van de samengevoegde waarden (bestaand + import).
      const merged = {
        frequency: frequency ?? existing?.frequency ?? null,
        severity: severity ?? existing?.severity ?? null,
        extent: extent ?? existing?.extent ?? null,
        legalApplies: (values.legalApplies ?? existing?.legalApplies ?? false) || (existing?._count.legalRequirements ?? 0) > 0,
        stakeholderConcern: values.stakeholderConcern ?? existing?.stakeholderConcern ?? false,
      };
      const score = aspectScore(merged.frequency, merged.severity, merged.extent) ?? ownScore ?? existing?.score ?? null;
      const manual =
        importedSignificant !== undefined
          ? { significant: importedSignificant, reason: "Overgenomen uit eigen register (import)" }
          : existing?.significanceManual
            ? { significant: existing.significant, reason: existing.significanceReason }
            : null;
      const sig = determineSignificance({ score, threshold, legalApplies: merged.legalApplies, stakeholderConcern: merged.stakeholderConcern, manual });
      Object.assign(data, {
        score,
        significant: sig.significant,
        ...(importedSignificant !== undefined ? { significanceManual: true, significanceReason: "Overgenomen uit eigen register (import)" } : {}),
      });

      try {
        if (existing) {
          await prisma.environmentalAspect.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.environmentalAspect.create({
            data: {
              ...(data as Prisma.EnvironmentalAspectUncheckedCreateInput),
              activity: r.activity,
              aspect: r.aspect,
              co2Relevant: values.co2Relevant ?? defaultCo2Relevant(values.aspectType),
              createdById: user.id,
            },
          });
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
      entityType: "EnvironmentalAspect",
      summary: `Import milieuaspectenregister: ${created} nieuw, ${updated} bijgewerkt, ${skipped} overgeslagen`,
      details: { created, updated, skipped, warnings: warnings.slice(0, 200) },
    });
    revalidateAspects();
    return { created, updated, skipped, warnings };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof UserError) return { error: err.message };
    console.error("[import] mislukt", err);
    return { error: "Import mislukt. Probeer het opnieuw." };
  }
}
