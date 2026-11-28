"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { ActionPriority, EnergyCategory, Prisma } from "@prisma/client";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEditConsumption } from "@/lib/rbac";
import { parseDecimal, parsePeriod, unitMatches } from "@/lib/co2";
import { diffFields } from "@/lib/audit-diff";
import { normText, type ImportResult, type ImportRow } from "@/lib/spreadsheet-import";
import { optionalDate, optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";

const decimal = (label: string, opts: { min?: number; required?: boolean } = {}) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") {
        if (opts.required) ctx.addIssue({ code: "custom", message: `${label} is verplicht` });
        return null;
      }
      const p = parseDecimal(v);
      if (p.invalid || p.value === null) {
        ctx.addIssue({ code: "custom", message: `${label}: "${v}" is geen getal` });
        return z.NEVER;
      }
      if (opts.min !== undefined && p.value < opts.min) {
        ctx.addIssue({ code: "custom", message: `${label} moet minstens ${opts.min} zijn` });
        return z.NEVER;
      }
      return p.value;
    });
const scopeField = z.enum(["1", "2", "3"]).transform(Number);
const optionalScope = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.enum(["1", "2", "3"]).transform(Number).nullable())
  .optional()
  .transform((v) => v ?? null);
const isoDate = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is verplicht`)
    .transform((v, ctx) => {
      const d = new Date(`${v}T00:00:00Z`);
      if (isNaN(d.getTime())) {
        ctx.addIssue({ code: "custom", message: `${label}: ongeldige datum` });
        return z.NEVER;
      }
      return d;
    });

function revalidateCo2() {
  revalidatePath("/co2", "layout");
  revalidatePath("/");
}

// ── Energiedragers en emissiefactoren (QHSE) ──────────────────

const carrierSchema = z.object({
  name: requiredText(120),
  aliases: optionalText,
  unit: requiredText(20),
  category: z.enum(EnergyCategory),
  defaultScope: scopeField,
  sortOrder: z.coerce.number().int().default(0),
  energyPerUnit: decimal("GJ per eenheid", { min: 0 })
    .optional()
    .transform((v) => v ?? null),
  reportGroup: optionalText,
});

export async function createCarrier(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const data = parseForm(carrierSchema, formData);
    const c = await prisma.energyCarrier.create({ data });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "EnergyCarrier",
      entityId: c.id,
      summary: `Energiedrager "${c.name}" (${c.unit}, scope ${c.defaultScope}) toegevoegd`,
    });
    revalidateCo2();
  });
}

export async function updateCarrier(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const data = parseForm(carrierSchema, formData);
    const active = formData.get("active") === "on";
    const old = await prisma.energyCarrier.findUnique({ where: { id } });
    await prisma.energyCarrier.update({ where: { id }, data: { ...data, active } });
    const changes = diffFields(
      old ?? {},
      { ...data, active },
      {
        name: "Naam",
        unit: "Eenheid",
        category: "Categorie",
        defaultScope: "Scope",
        energyPerUnit: "GJ per eenheid",
        reportGroup: "Groep",
        aliases: "Andere namen",
        active: "Actief",
      },
    );
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "EnergyCarrier",
      entityId: id,
      summary: `Energiedrager "${data.name}" gewijzigd${changes.length ? `: ${changes.map((c) => c.label.toLowerCase()).join(", ")}` : ""}`,
      details: { changes },
    });
    revalidateCo2();
  });
}

/** Factoren in gram CO2 per eenheid (zoals op CO2emissiefactoren.nl); opgeslagen in kg. WTW = WTT + TTW als WTW leeg is. */
const gram = (label: string) =>
  decimal(label, { min: 0 })
    .optional()
    .transform((v) => (v === null || v === undefined ? null : v / 1000));
const factorSchema = z.object({
  wtwG: gram("WTW"),
  wttG: gram("WTT"),
  ttwG: gram("TTW"),
  biogenicG: gram("Biogeen"),
  validFrom: isoDate("Geldig vanaf"),
  source: requiredText(300),
  notes: optionalText,
});

function factorValues(d: z.infer<typeof factorSchema>) {
  const wtw = d.wtwG ?? (d.wttG !== null && d.ttwG !== null ? d.wttG + d.ttwG : null);
  if (wtw === null) throw new UserError("Vul de WTW-factor in (of WTT én TTW).");
  return { factor: wtw, wtt: d.wttG, ttw: d.ttwG, biogenic: d.biogenicG, validFrom: d.validFrom, source: d.source, notes: d.notes };
}

export async function addFactor(carrierId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const carrier = await prisma.energyCarrier.findUnique({ where: { id: carrierId } });
    if (!carrier) throw new UserError("Energiedrager niet gevonden.");
    const data = factorValues(parseForm(factorSchema, formData));
    const exists = await prisma.emissionFactor.findUnique({ where: { carrierId_validFrom: { carrierId, validFrom: data.validFrom } } });
    if (exists) throw new UserError("Er is al een factor met deze ingangsdatum. Wijzig die factor of kies een andere datum.");
    const f = await prisma.emissionFactor.create({ data: { ...data, carrierId } });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "EmissionFactor",
      entityId: f.id,
      summary: `Emissiefactor ${carrier.name}: ${Math.round(data.factor * 1000)} g CO2e/${carrier.unit} (WTW) vanaf ${data.validFrom.toISOString().slice(0, 10)} (${data.source})`,
    });
    revalidateCo2();
  });
}

/** Factor aanpassen; de footprint rekent direct opnieuw (niets wordt opgeslagen). */
export async function updateFactor(factorId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const old = await prisma.emissionFactor.findUnique({ where: { id: factorId }, include: { carrier: true } });
    if (!old) throw new UserError("Factor niet gevonden.");
    const data = factorValues(parseForm(factorSchema, formData));
    if (data.validFrom.getTime() !== old.validFrom.getTime()) {
      const clash = await prisma.emissionFactor.findUnique({ where: { carrierId_validFrom: { carrierId: old.carrierId, validFrom: data.validFrom } } });
      if (clash) throw new UserError("Er is al een factor met deze ingangsdatum.");
    }
    await prisma.emissionFactor.update({ where: { id: factorId }, data });
    const g = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 1000 * 1000) / 1000);
    const changes = diffFields(
      { wtt: g(old.wtt), ttw: g(old.ttw), factor: g(old.factor), biogenic: g(old.biogenic), validFrom: old.validFrom, source: old.source },
      { wtt: g(data.wtt), ttw: g(data.ttw), factor: g(data.factor), biogenic: g(data.biogenic), validFrom: data.validFrom, source: data.source },
      { wtt: "WTT (g)", ttw: "TTW (g)", factor: "WTW (g)", biogenic: "Biogeen (g)", validFrom: "Geldig vanaf", source: "Bron" },
    );
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "EmissionFactor",
      entityId: factorId,
      details: { changes, carrierId: old.carrierId },
      summary: `Emissiefactor ${old.carrier.name} vanaf ${data.validFrom.toISOString().slice(0, 10)}: ${Math.round(Number(old.factor) * 1000)} → ${Math.round(data.factor * 1000)} g CO2e/${old.carrier.unit} (WTW)`,
    });
    revalidateCo2();
  });
}

export async function deleteFactor(factorId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const f = await prisma.emissionFactor.delete({ where: { id: factorId }, include: { carrier: true } });
    await logAudit({
      user,
      action: "DELETE",
      entityType: "EmissionFactor",
      entityId: factorId,
      summary: `Emissiefactor ${f.carrier.name} vanaf ${f.validFrom.toISOString().slice(0, 10)} verwijderd (${f.factor})`,
    });
    revalidateCo2();
  });
}

// ── Materieel (QHSE) ──────────────────────────────────────────

const equipmentSchema = z.object({
  name: requiredText(200),
  code: optionalText,
  type: optionalText,
  defaultCarrierId: optionalId,
  disciplineId: optionalId,
  locationId: optionalId,
});

export async function createEquipment(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const data = parseForm(equipmentSchema, formData);
    const e = await prisma.equipment.create({ data });
    await logAudit({ user, action: "CREATE", entityType: "Equipment", entityId: e.id, summary: `Materieel "${e.name}" toegevoegd` });
    revalidateCo2();
  });
}

export async function toggleEquipment(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const e = await prisma.equipment.findUnique({ where: { id } });
    if (!e) throw new UserError("Materieel niet gevonden.");
    await prisma.equipment.update({ where: { id }, data: { active: !e.active } });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Equipment",
      entityId: id,
      summary: `Materieel "${e.name}" ${e.active ? "buiten gebruik" : "weer in gebruik"}`,
    });
    revalidateCo2();
  });
}

// ── Verbruik (QHSE en middenkader) ────────────────────────────

const consumptionSchema = z
  .object({
    carrierId: requiredText(100),
    quantity: decimal("Hoeveelheid", { required: true }),
    periodType: z.enum(["maand", "anders"]).default("maand"),
    month: z.string().trim().optional(),
    periodStart: optionalDate,
    periodEnd: optionalDate,
    scope: optionalScope,
    description: optionalText,
    disciplineId: optionalId,
    locationId: optionalId,
    equipmentId: optionalId,
  })
  .transform((v, ctx) => {
    let start = v.periodStart ?? null;
    let end = v.periodEnd ?? null;
    if (v.periodType === "maand") {
      const p = v.month ? parsePeriod(v.month) : null;
      if (!p) {
        ctx.addIssue({ code: "custom", message: "Kies een maand" });
        return z.NEVER;
      }
      start = new Date(`${p.start}T00:00:00Z`);
      end = new Date(`${p.end}T00:00:00Z`);
    }
    if (!start || !end) {
      ctx.addIssue({ code: "custom", message: "Vul begin- en einddatum van de periode in" });
      return z.NEVER;
    }
    if (end < start) {
      ctx.addIssue({ code: "custom", message: "De einddatum ligt vóór de begindatum" });
      return z.NEVER;
    }
    return {
      carrierId: v.carrierId,
      quantity: v.quantity!,
      periodStart: start,
      periodEnd: end,
      scope: v.scope,
      description: v.description,
      disciplineId: v.disciplineId,
      locationId: v.locationId,
      equipmentId: v.equipmentId,
    };
  });

async function assertCarrier(carrierId: string) {
  const c = await prisma.energyCarrier.findUnique({ where: { id: carrierId } });
  if (!c) throw new UserError("Kies een energiedrager.");
  return c;
}

export async function createConsumption(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.enter");
    const data = parseForm(consumptionSchema, formData);
    const carrier = await assertCarrier(data.carrierId);
    const c = await prisma.energyConsumption.create({ data: { ...data, createdById: user.id } });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "EnergyConsumption",
      entityId: c.id,
      summary: `Verbruik ${data.quantity} ${carrier.unit} ${carrier.name} (${data.periodStart.toISOString().slice(0, 10)} t/m ${data.periodEnd.toISOString().slice(0, 10)})`,
    });
    revalidateCo2();
  });
}

async function loadEditableConsumption(id: string) {
  const user = await requireUser();
  const c = await prisma.energyConsumption.findUnique({ where: { id } });
  if (!c) throw new UserError("Verbruiksregel niet gevonden.");
  if (!canEditConsumption(user, c)) throw new UserError("Alleen QHSE of degene die het verbruik heeft ingevoerd, kan dit wijzigen.");
  return { user, c };
}

export async function updateConsumption(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, c } = await loadEditableConsumption(id);
    const data = parseForm(consumptionSchema, formData);
    await assertCarrier(data.carrierId);
    await prisma.energyConsumption.update({ where: { id }, data });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "EnergyConsumption",
      entityId: id,
      summary: `Verbruik gewijzigd (${Number(c.quantity)} → ${data.quantity})`,
      details: {
        changes: diffFields(c, data, {
          carrierId: "Energiedrager",
          quantity: "Hoeveelheid",
          periodStart: "Begin",
          periodEnd: "Eind",
          scope: "Scope",
          description: "Omschrijving",
          disciplineId: "Bedrijfsonderdeel",
          locationId: "Vestiging",
          equipmentId: "Materieel",
        }),
      },
    });
    revalidateCo2();
  });
}

export async function deleteConsumption(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, c } = await loadEditableConsumption(id);
    await prisma.energyConsumption.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "EnergyConsumption", entityId: id, summary: `Verbruiksregel verwijderd (${Number(c.quantity)})` });
    revalidateCo2();
    redirect("/co2/verbruik");
  });
}

// ── Reductiedoelstellingen en maatregelen ─────────────────────

const targetSchema = z
  .object({
    title: requiredText(300),
    description: optionalText,
    scope: optionalScope,
    baseYear: z.coerce.number().int().min(2000).max(2100),
    targetYear: z.coerce.number().int().min(2000).max(2100),
    reductionPct: decimal("Reductiepercentage", { min: 0, required: true }),
    baselineKg: decimal("Uitstoot basisjaar", { min: 0 }),
    disciplineId: optionalId,
  })
  .refine((v) => v.targetYear > v.baseYear, { message: "Het doeljaar moet na het basisjaar liggen", path: ["targetYear"] })
  .refine((v) => (v.reductionPct ?? 0) <= 100, { message: "Reductie kan niet meer dan 100 % zijn", path: ["reductionPct"] });

export async function createTarget(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const data = parseForm(targetSchema, formData);
    const t = await prisma.reductionTarget.create({ data: { ...data, reductionPct: data.reductionPct! } });
    await logAudit({ user, action: "CREATE", entityType: "ReductionTarget", entityId: t.id, summary: `Reductiedoelstelling "${t.title}" vastgelegd` });
    revalidateCo2();
    redirect(`/co2/doelstellingen/${t.id}`);
  });
}

export async function updateTarget(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const data = parseForm(targetSchema, formData);
    const active = formData.get("active") === "on";
    const old = await prisma.reductionTarget.findUnique({ where: { id } });
    await prisma.reductionTarget.update({ where: { id }, data: { ...data, reductionPct: data.reductionPct!, active } });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "ReductionTarget",
      entityId: id,
      summary: `Reductiedoelstelling "${data.title}" gewijzigd`,
      details: {
        changes: diffFields(
          old ?? {},
          { ...data, active },
          {
            title: "Titel",
            scope: "Scope",
            baseYear: "Basisjaar",
            baselineKg: "Basis (kg)",
            targetYear: "Doeljaar",
            reductionPct: "Reductie %",
            disciplineId: "Bedrijfsonderdeel",
            active: "Actief",
          },
        ),
      },
    });
    revalidateCo2();
  });
}

export async function deleteTarget(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const t = await prisma.reductionTarget.delete({ where: { id } });
    await logAudit({
      user,
      action: "DELETE",
      entityType: "ReductionTarget",
      entityId: id,
      summary: `Reductiedoelstelling "${t.title}" verwijderd (maatregelen blijven als acties bestaan)`,
    });
    revalidateCo2();
    redirect("/co2/doelstellingen");
  });
}

const measureSchema = z.object({
  title: requiredText(300),
  ownerId: optionalId,
  deadline: optionalDate,
  priority: z.enum(ActionPriority).default("MEDIUM"),
  expectedReductionKg: decimal("Verwachte reductie", { min: 0 }),
});

/** Reductiemaatregel = actie (bron CO2-reductie) met een verwachte reductie in kg per jaar. */
export async function createMeasure(targetId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("actions.create");
    const t = await prisma.reductionTarget.findUnique({ where: { id: targetId } });
    if (!t) throw new UserError("Doelstelling niet gevonden.");
    const data = parseForm(measureSchema, formData);
    const a = await prisma.action.create({
      data: { ...data, source: "CO2_REDUCTION", reductionTargetId: targetId, disciplineId: t.disciplineId, createdById: user.id },
    });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Action",
      entityId: a.id,
      summary: `Maatregel #${a.number} toegevoegd aan doelstelling "${t.title}"`,
    });
    revalidateCo2();
    revalidatePath("/acties");
  });
}

// ── Import verbruik ───────────────────────────────────────────

const txt = (max: number) => z.string().trim().max(max).optional();
const importRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  externalRef: txt(100),
  carrier: z.string().trim().min(1).max(200),
  quantity: z.string().trim().min(1).max(50),
  unit: txt(30),
  period: txt(100),
  periodStart: txt(30),
  periodEnd: txt(30),
  discipline: txt(200),
  location: txt(200),
  equipment: txt(200),
  scope: txt(10),
  description: txt(1000),
});

/**
 * Importeer verbruik. Energiedrager op naam of alias; materieel op naam of code; disciplines/locaties op naam.
 * Periode uit één kolom ("2026-03", "Q2 2026", "H1 2026") of uit begin- en einddatum.
 * Bestaande regels worden bijgewerkt op kenmerk.
 */
export async function importConsumptions(rowsInput: ImportRow[], options: { updateExisting: boolean }): Promise<ImportResult> {
  try {
    const user = await requirePermission("co2.manage");
    if (!Array.isArray(rowsInput) || rowsInput.length === 0) return { error: "Geen regels om te importeren." };
    if (rowsInput.length > 20000) return { error: "Maximaal 20.000 regels per import." };

    const [carriers, disciplines, locations, equipment] = await Promise.all([
      prisma.energyCarrier.findMany(),
      prisma.discipline.findMany({ select: { id: true, name: true } }),
      prisma.location.findMany({ select: { id: true, name: true } }),
      prisma.equipment.findMany({ select: { id: true, name: true, code: true } }),
    ]);
    const k = (s: string) => normText(s);
    const carrierMap = new Map<string, (typeof carriers)[number]>();
    for (const c of carriers) {
      carrierMap.set(k(c.name), c);
      for (const a of (c.aliases ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean))
        carrierMap.set(k(a), c);
    }
    const discMap = new Map(disciplines.map((d) => [k(d.name), d.id]));
    const locMap = new Map(locations.map((l) => [k(l.name), l.id]));
    const eqMap = new Map(equipment.flatMap((e) => [[k(e.name), e.id] as const, ...(e.code ? [[k(e.code), e.id] as const] : [])]));

    const warnings: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const input of rowsInput) {
      const parsed = importRowSchema.safeParse(input);
      if (!parsed.success) {
        skipped++;
        warnings.push(`Rij ${typeof input?.rowNumber === "number" ? input.rowNumber : "?"}: ongeldige of onvolledige gegevens — overgeslagen`);
        continue;
      }
      const r = parsed.data;
      const skip = (msg: string) => {
        skipped++;
        warnings.push(`Rij ${r.rowNumber}: ${msg} — overgeslagen`);
      };
      const carrier = carrierMap.get(k(r.carrier));
      if (!carrier) {
        skip(`energiedrager "${r.carrier}" onbekend (voeg die toe onder Emissiefactoren, eventueel met deze naam als alias)`);
        continue;
      }
      const q = parseDecimal(r.quantity);
      if (q.invalid || q.value === null) {
        skip(`hoeveelheid "${r.quantity}" is geen getal`);
        continue;
      }
      if (r.unit && !unitMatches(r.unit, carrier.unit)) {
        skip(`eenheid "${r.unit}" wijkt af van ${carrier.unit} (${carrier.name}); reken om naar ${carrier.unit} of kies de juiste energiedrager`);
        continue;
      }
      let period = r.period ? parsePeriod(r.period) : null;
      if (!period && r.periodStart) {
        const s = parsePeriod(r.periodStart);
        const e = r.periodEnd ? parsePeriod(r.periodEnd) : s;
        if (s && e) period = { start: s.start, end: e.end };
      }
      if (!period || period.end < period.start) {
        skip(`periode "${r.period ?? r.periodStart ?? ""}" niet herkend`);
        continue;
      }
      const lookup = (map: Map<string, string>, value: string | undefined, label: string) => {
        if (!value) return undefined;
        const id = map.get(k(value));
        if (!id) warnings.push(`Rij ${r.rowNumber}: ${label} "${value}" niet gevonden — leeg gelaten`);
        return id;
      };
      const scope = r.scope && /^[123]$/.test(r.scope.replace(/scope\s*/i, "")) ? Number(r.scope.replace(/scope\s*/i, "")) : undefined;
      if (r.scope && !scope) warnings.push(`Rij ${r.rowNumber}: scope "${r.scope}" niet herkend — scope van de energiedrager gebruikt`);
      const data = {
        carrierId: carrier.id,
        quantity: q.value,
        periodStart: new Date(`${period.start}T00:00:00Z`),
        periodEnd: new Date(`${period.end}T00:00:00Z`),
        scope: scope ?? null,
        description: r.description ?? null,
        disciplineId: lookup(discMap, r.discipline, "discipline") ?? null,
        locationId: lookup(locMap, r.location, "locatie") ?? null,
        equipmentId: lookup(eqMap, r.equipment, "materieel") ?? null,
      };
      try {
        const existing = options.updateExisting && r.externalRef ? await prisma.energyConsumption.findUnique({ where: { externalRef: r.externalRef } }) : null;
        if (existing) {
          await prisma.energyConsumption.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.energyConsumption.create({ data: { ...data, externalRef: r.externalRef ?? null, createdById: user.id } });
          created++;
        }
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") skip(`kenmerk "${r.externalRef}" komt dubbel voor`);
        else {
          console.error("[import] rij mislukt", err);
          skip("opslaan mislukt");
        }
      }
    }
    await logAudit({
      user,
      action: "CREATE",
      entityType: "EnergyConsumption",
      summary: `Import verbruik: ${created} nieuw, ${updated} bijgewerkt, ${skipped} overgeslagen`,
      details: { created, updated, skipped, warnings: warnings.slice(0, 200) },
    });
    revalidateCo2();
    return { created, updated, skipped, warnings };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof UserError) return { error: err.message };
    console.error("[import] mislukt", err);
    return { error: "Import mislukt. Probeer het opnieuw." };
  }
}
