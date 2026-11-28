"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { ActionPriority, AspectPriority, AspectSiteType, OperatingSituation, Prisma } from "@prisma/client";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { aspectDisplayCode, aspectTypeFromTheme, defaultCo2Relevant, isSignificant, situationFromTheme } from "@/lib/aspects";
import { optionalDate, optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";
import { parseInOperation, parseLifecycle, parseOpportunity, parsePriority, parseSiteType, parseSituation, splitRefs } from "@/lib/aspect-import";
import { parseYesNo, type ImportResult, type ImportRow } from "@/lib/spreadsheet-import";

const ids = (max: number) => z.array(z.string().min(1)).max(max);
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on");
/** Decimaal getal (komma of punt), leeg = null. */
const decimal = (label: string, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return null;
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > max) {
        ctx.addIssue({ code: "custom", message: `${label}: vul een getal tussen 0 en ${max} in` });
        return z.NEVER;
      }
      return n;
    });
const lifecycle = z
  .string()
  .optional()
  .transform((v) => (v === "1" || v === "2" || v === "3" ? Number(v) : null));

const aspectSchema = z.object({
  externalRef: optionalText,
  businessUnit: optionalText,
  locationText: optionalText,
  siteType: z.enum(AspectSiteType).default("SITE"),
  inOperation: checkbox,
  activity: requiredText(300),
  mba: optionalText,
  theme: optionalText,
  aspect: requiredText(500),
  impact: optionalText,
  situation: z.enum(OperatingSituation),
  contextFactor: optionalText,
  legalApplies: checkbox,
  legalText: optionalText,
  stakeholders: optionalText,
  complaints: checkbox,
  controls: optionalText,
  effectScore: decimal("Effect", 1000),
  exposure: decimal("Voorkomen", 100),
  probability: decimal("Waarschijnlijkheid", 100),
  opportunity: z.enum(["bedreiging", "kans"]).transform((v) => v === "kans"),
  priority: z
    .union([z.enum(AspectPriority), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  priorityRationale: optionalText,
  lcRawMaterials: lifecycle,
  lcDesign: lifecycle,
  lcProduction: lifecycle,
  lcTransport: lifecycle,
  lcUse: lifecycle,
  lcEndOfLife: lifecycle,
  lcDisposal: lifecycle,
  lifecycleSource: optionalText,
  measure: optionalText,
  ownerText: optionalText,
  origin: optionalText,
  co2Relevant: checkbox,
  ownerId: optionalId,
  disciplineId: optionalId,
  locationId: optionalId,
  reviewDate: optionalDate,
  processIds: ids(500),
  riskIds: ids(1000),
  legalIds: ids(3000),
  requirementIds: ids(2000),
});
const MULTI = ["processIds", "riskIds", "legalIds", "requirementIds"];

/** Velden uit het formulier; type volgt uit het thema, significant = prio hoog of middel. */
function toData(input: z.infer<typeof aspectSchema>) {
  const { processIds, riskIds, legalIds, requirementIds, ...rest } = input;
  return {
    links: { processIds, riskIds, legalIds, requirementIds },
    data: { ...rest, aspectType: aspectTypeFromTheme(rest.theme, rest.aspect, rest.impact), significant: isSignificant(rest.priority) },
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
    const { data, links } = toData(parseForm(aspectSchema, formData, MULTI));
    const aspect = await prisma.environmentalAspect.create({ data: { ...data, createdById: user.id, ...linkData(links, "connect") } });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "EnvironmentalAspect",
      entityId: aspect.id,
      summary: `${aspectDisplayCode(aspect)} "${aspect.aspect}" toegevoegd`,
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
    const { data, links } = toData(parseForm(aspectSchema, formData, MULTI));
    const active = formData.get("active") === "on";
    await prisma.environmentalAspect.update({ where: { id }, data: { ...data, active, ...linkData(links, "set") } });
    const change = existing.significant !== data.significant ? (data.significant ? " (nu significant)" : " (niet meer significant)") : "";
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "EnvironmentalAspect",
      entityId: id,
      summary: `${aspectDisplayCode(existing)} gewijzigd${change}`,
      details: { ...data, active, reviewDate: data.reviewDate?.toISOString() ?? null, ...links },
    });
    revalidateAspects(id);
  });
}

export async function deleteAspect(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("aspects.edit");
    const a = await prisma.environmentalAspect.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "EnvironmentalAspect", entityId: id, summary: `${aspectDisplayCode(a)} "${a.aspect}" verwijderd` });
    revalidateAspects();
    redirect("/milieuaspecten");
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
      summary: `Actie #${action.number} aangemaakt vanuit ${aspectDisplayCode(a)}`,
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
  businessUnit: txt(200),
  location: txt(200),
  siteType: txt(100),
  siteStatus: txt(100),
  activity: z.string().trim().min(1).max(300),
  mba: txt(2000),
  theme: txt(200),
  aspect: z.string().trim().min(1).max(500),
  impact: txt(2000),
  contextFactor: txt(300),
  legalApplies: txt(50),
  legalText: txt(5000),
  legalRefs: txt(1000),
  riskRefs: txt(1000),
  stakeholders: txt(2000),
  complaints: txt(50),
  controls: txt(10_000),
  effect: txt(20),
  exposure: txt(20),
  probability: txt(20),
  opportunity: txt(50),
  priority: txt(50),
  priorityRationale: txt(5000),
  lcRawMaterials: txt(10),
  lcDesign: txt(10),
  lcProduction: txt(10),
  lcTransport: txt(10),
  lcUse: txt(10),
  lcEndOfLife: txt(10),
  lcDisposal: txt(10),
  lifecycleSource: txt(200),
  measure: txt(5000),
  owner: txt(200),
  origin: txt(200),
  situation: txt(200),
  co2Relevant: txt(50),
  reviewDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** Bedrijfsonderdelen uit het MAR die anders heten dan de disciplines in de app. */
const BU_ALIASES: Record<string, string> = { "afval & recycling": "afval/transport", "afval en recycling": "afval/transport", transport: "afval/transport" };
const NO_BU = ["alle bedrijfsonderdelen", "groep", "bedrijfsbreed"];

/**
 * Importeer het milieuaspectenregister (MAR). Bijwerken op nummer, anders op bedrijfsonderdeel + locatie + activiteit + aspect.
 * W-nummers worden gekoppeld aan wettelijke eisen, R/K-nummers aan risico's en kansen (importeer die registers eerst).
 * Lege cellen wissen geen bestaande waarden.
 */
export async function importAspects(rowsInput: ImportRow[], options: { updateExisting: boolean }): Promise<ImportResult> {
  try {
    const user = await requirePermission("aspects.edit");
    if (!Array.isArray(rowsInput) || rowsInput.length === 0) return { error: "Geen regels om te importeren." };
    if (rowsInput.length > 5000) return { error: "Maximaal 5000 regels per import." };

    const [disciplines, locations, users, legal, risks] = await Promise.all([
      prisma.discipline.findMany({ select: { id: true, name: true } }),
      prisma.location.findMany({ select: { id: true, name: true } }),
      prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } }),
      prisma.legalRequirement.findMany({ where: { externalRef: { not: null } }, select: { id: true, externalRef: true } }),
      prisma.risk.findMany({ where: { externalRef: { not: null } }, select: { id: true, externalRef: true } }),
    ]);
    const key = (s: string) => s.trim().toLowerCase();
    const discMap = new Map(disciplines.map((d) => [key(d.name), d.id]));
    const locMap = new Map(locations.map((l) => [key(l.name), l.id]));
    const userMap = new Map(users.flatMap((u) => [[key(u.name), u.id] as const, [key(u.email), u.id] as const]));
    const legalByRef = new Map(legal.map((l) => [l.externalRef!.toUpperCase(), l.id]));
    const riskByRef = new Map(risks.map((r) => [r.externalRef!.toUpperCase(), r.id]));

    const warnings: string[] = [];
    const warnedOnce = new Set<string>();
    const warnOnce = (k: string, msg: string) => {
      if (warnedOnce.has(k)) return;
      warnedOnce.add(k);
      warnings.push(msg);
    };
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const input of rowsInput) {
      const parsed = importRowSchema.safeParse(input);
      if (!parsed.success) {
        skipped++;
        warnings.push(
          `Rij ${typeof input?.rowNumber === "number" ? input.rowNumber : "?"}: activiteit of aspect ontbreekt, of ongeldige waarde — overgeslagen`,
        );
        continue;
      }
      const r = parsed.data;
      const yesNo = (v: string | undefined) => (v === undefined ? undefined : (parseYesNo(v) ?? undefined));
      const num = (v: string | undefined, label: string) => {
        if (v === undefined) return undefined;
        const n = Number(v.replace(",", "."));
        if (Number.isFinite(n) && n >= 0) return n;
        warnings.push(`Rij ${r.rowNumber}: ${label} "${v}" is geen getal — overgeslagen`);
        return undefined;
      };
      const lc = (v: string | undefined, label: string) => {
        if (v === undefined) return undefined;
        const n = parseLifecycle(v);
        if (n === undefined) warnings.push(`Rij ${r.rowNumber}: levenscyclus ${label} "${v}" valt buiten 1–3 — overgeslagen`);
        return n ?? undefined;
      };

      const priority = r.priority !== undefined ? parsePriority(r.priority) : undefined;
      if (r.priority !== undefined && priority === undefined) warnings.push(`Rij ${r.rowNumber}: prio "${r.priority}" niet herkend (H, M of L) — overgeslagen`);
      const situation =
        r.situation !== undefined ? (parseSituation(r.situation) ?? undefined) : r.theme !== undefined ? situationFromTheme(r.theme) : undefined;

      // Bedrijfsonderdeel → discipline (op naam of alias); "Alle bedrijfsonderdelen" = bedrijfsbreed.
      let disciplineId: string | null | undefined;
      if (r.businessUnit !== undefined) {
        const bu = key(r.businessUnit);
        if (NO_BU.includes(bu)) disciplineId = null;
        else {
          disciplineId = discMap.get(bu) ?? discMap.get(BU_ALIASES[bu] ?? "");
          if (!disciplineId) warnOnce(`bu:${bu}`, `Bedrijfsonderdeel "${r.businessUnit}" komt niet voor bij de disciplines — alleen als tekst opgeslagen`);
        }
      }
      // Locatie: koppelen als de naam precies een vestiging is; anders alleen als tekst (bijv. "Project / werk").
      const locationId = r.location !== undefined ? locMap.get(key(r.location)) : undefined; // geen match: handmatige koppeling blijft staan
      const ownerId = r.owner !== undefined ? (userMap.get(key(r.owner)) ?? undefined) : undefined;

      let legalIds: string[] | undefined;
      if (r.legalRefs !== undefined) {
        legalIds = [];
        for (const ref of splitRefs(r.legalRefs)) {
          const id = legalByRef.get(ref);
          if (id) legalIds.push(id);
          else warnOnce(`w:${ref}`, `Wettelijke eis ${ref} niet gevonden (importeer eerst het register wet- en regelgeving) — koppeling overgeslagen`);
        }
      }
      let riskIds: string[] | undefined;
      if (r.riskRefs !== undefined) {
        riskIds = [];
        for (const ref of splitRefs(r.riskRefs)) {
          const id = riskByRef.get(ref);
          if (id) riskIds.push(id);
          else warnOnce(`r:${ref}`, `Risico/kans ${ref} niet gevonden (importeer eerst het risico- en kansenregister) — koppeling overgeslagen`);
        }
      }

      const values = {
        externalRef: r.externalRef,
        businessUnit: r.businessUnit,
        locationText: r.location,
        siteType: r.siteType !== undefined ? parseSiteType(r.siteType) : undefined,
        inOperation: r.siteStatus !== undefined ? parseInOperation(r.siteStatus) : undefined,
        activity: r.activity,
        mba: r.mba,
        theme: r.theme,
        aspect: r.aspect,
        impact: r.impact,
        situation,
        contextFactor: r.contextFactor,
        legalApplies: yesNo(r.legalApplies),
        legalText: r.legalText,
        stakeholders: r.stakeholders,
        complaints: yesNo(r.complaints),
        controls: r.controls,
        effectScore: num(r.effect, "effect"),
        exposure: num(r.exposure, "voorkomen"),
        probability: num(r.probability, "waarschijnlijkheid"),
        opportunity: r.opportunity !== undefined ? parseOpportunity(r.opportunity) : undefined,
        priority: priority === undefined ? undefined : priority,
        priorityRationale: r.priorityRationale,
        lcRawMaterials: lc(r.lcRawMaterials, "grondstofwinning"),
        lcDesign: lc(r.lcDesign, "ontwerp"),
        lcProduction: lc(r.lcProduction, "productie"),
        lcTransport: lc(r.lcTransport, "transport"),
        lcUse: lc(r.lcUse, "gebruik"),
        lcEndOfLife: lc(r.lcEndOfLife, "einde levensduur"),
        lcDisposal: lc(r.lcDisposal, "definitieve verwijdering"),
        lifecycleSource: r.lifecycleSource,
        measure: r.measure,
        ownerText: r.owner,
        origin: r.origin,
        co2Relevant: yesNo(r.co2Relevant),
        disciplineId,
        locationId,
        ownerId,
        reviewDate: r.reviewDate ? new Date(`${r.reviewDate}T00:00:00Z`) : undefined,
      };
      const data = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as Prisma.EnvironmentalAspectUncheckedUpdateInput;

      const existing = options.updateExisting
        ? r.externalRef
          ? await prisma.environmentalAspect.findUnique({ where: { externalRef: r.externalRef } })
          : await prisma.environmentalAspect.findFirst({
              where: {
                activity: { equals: r.activity, mode: "insensitive" },
                aspect: { equals: r.aspect, mode: "insensitive" },
                businessUnit: r.businessUnit ?? null,
                locationText: r.location ?? null,
              },
            })
        : null;

      const theme = r.theme ?? existing?.theme ?? null;
      const finalPriority = priority !== undefined ? priority : (existing?.priority ?? null);
      Object.assign(data, {
        aspectType: aspectTypeFromTheme(theme, r.aspect, r.impact ?? existing?.impact),
        significant: isSignificant(finalPriority),
      });

      try {
        if (existing) {
          await prisma.environmentalAspect.update({
            where: { id: existing.id },
            data: {
              ...data,
              ...(legalIds ? { legalRequirements: { set: legalIds.map((id) => ({ id })) } } : {}),
              ...(riskIds ? { risks: { set: riskIds.map((id) => ({ id })) } } : {}),
            },
          });
          updated++;
        } else {
          await prisma.environmentalAspect.create({
            data: {
              ...(data as Prisma.EnvironmentalAspectUncheckedCreateInput),
              activity: r.activity,
              aspect: r.aspect,
              co2Relevant: values.co2Relevant ?? defaultCo2Relevant(r.theme, r.contextFactor),
              createdById: user.id,
              ...(legalIds?.length ? { legalRequirements: { connect: legalIds.map((id) => ({ id })) } } : {}),
              ...(riskIds?.length ? { risks: { connect: riskIds.map((id) => ({ id })) } } : {}),
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
