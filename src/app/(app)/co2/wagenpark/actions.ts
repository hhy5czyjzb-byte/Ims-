"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { optionalDate, optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";
import { diffFields } from "@/lib/audit-diff";
import { disciplineMap } from "@/lib/masterdata";
import {
  VEHICLE_TYPES,
  categoriesOf,
  euroLabel,
  fuelLabel,
  parseEuroClass,
  parseFuelType,
  parsePastedTable,
  parseVehicleType,
  vehicleLabel,
  type FleetKind,
} from "@/lib/fleet";
import type { ImportResult, ImportRow } from "@/lib/spreadsheet-import";

function revalidate() {
  revalidatePath("/co2/wagenpark", "layout");
  revalidatePath("/co2/materieel");
}
const kindSchema = z.enum(["FUEL", "EURO"]);
const catLabel = (kind: FleetKind, k: string) => (kind === "FUEL" ? fuelLabel(k) : euroLabel(k));

/** Aantallen voor één jaar opslaan (raster soort voertuig × brandstof of klasse); 0 of leeg verwijdert de regel. */
export async function saveFleetYear(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const year = Number(formData.get("year"));
    const kind = kindSchema.parse(formData.get("kind") ?? "FUEL");
    if (!Number.isInteger(year) || year < 1990 || year > 2100) throw new UserError("Vul een geldig jaar in.");
    const existing = await prisma.fleetCount.findMany({ where: { year, kind } });
    const changes: { field: string; label: string; from: string; to: string }[] = [];
    for (const v of VEHICLE_TYPES)
      for (const c of categoriesOf(kind)) {
        const raw = String(formData.get(`c_${v.key}_${c.key}`) ?? "").trim();
        const old = existing.find((e) => e.vehicleType === v.key && e.value === c.key);
        if (raw === "" && !old) continue;
        const n = raw === "" ? 0 : Number(raw);
        if (!Number.isInteger(n) || n < 0 || n > 100_000) throw new UserError(`${vehicleLabel(v.key)} – ${catLabel(kind, c.key)}: vul een heel getal in.`);
        if ((old?.count ?? 0) === n) continue;
        changes.push({ field: `${v.key}_${c.key}`, label: `${vehicleLabel(v.key)} – ${catLabel(kind, c.key)}`, from: String(old?.count ?? 0), to: String(n) });
        if (n === 0) {
          if (old) await prisma.fleetCount.delete({ where: { id: old.id } });
        } else
          await prisma.fleetCount.upsert({
            where: { year_vehicleType_kind_value: { year, vehicleType: v.key, kind, value: c.key } },
            create: { year, vehicleType: v.key, kind, value: c.key, count: n },
            update: { count: n },
          });
      }
    if (changes.length)
      await logAudit({
        user,
        action: "UPDATE",
        entityType: "FleetCount",
        entityId: `${year}-${kind}`,
        summary: `Wagenpark ${year} (${kind === "FUEL" ? "brandstoftypes" : "milieuclassificatie"}) bijgewerkt (${changes.length} wijziging(en))`,
        details: { changes },
      });
    revalidate();
  });
}

/** Jaartabel uit Excel plakken (klasse/brandstof × jaren) voor één soort voertuig. */
export async function pasteFleetTable(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const kind = kindSchema.parse(formData.get("kind"));
    const vehicleType = z.enum(VEHICLE_TYPES.map((v) => v.key) as [string, ...string[]]).parse(formData.get("vehicleType"));
    const text = String(formData.get("table") ?? "");
    if (!text.trim()) throw new UserError("Plak eerst de tabel uit Excel.");
    const t = parsePastedTable(text, kind);
    if (!t.years.length) throw new UserError("Geen jaren gevonden. Neem de kopregel met de jaartallen mee (bijv. Klasse | 2020 | 2021 | …).");
    if (!t.rows.length)
      throw new UserError(
        `Geen ${kind === "FUEL" ? "brandstoftypes" : "milieuklassen"} herkend${t.unknown.length ? ` (niet herkend: ${t.unknown.slice(0, 5).join(", ")})` : ""}.`,
      );
    let n = 0;
    for (const [i, year] of t.years.entries()) {
      // Het jaar wordt vervangen door de geplakte cijfers (zodat oude regels niet blijven hangen).
      await prisma.fleetCount.deleteMany({ where: { year, vehicleType, kind } });
      for (const r of t.rows) {
        const count = r.values[i];
        if (!count) continue;
        await prisma.fleetCount.create({ data: { year, vehicleType, kind, value: r.key, count } });
        n++;
      }
    }
    await logAudit({
      user,
      action: "CREATE",
      entityType: "FleetCount",
      summary: `Wagenpark geplakt: ${vehicleLabel(vehicleType)}, ${kind === "FUEL" ? "brandstoftypes" : "milieuclassificatie"} ${t.years[0]}–${t.years[t.years.length - 1]} (${n} waarden)`,
      details: { years: t.years, rows: t.rows.map((r) => ({ key: r.key, values: r.values })), unknown: t.unknown },
    });
    revalidate();
    if (t.unknown.length) throw new UserError(`Opgeslagen. Niet herkend en overgeslagen: ${t.unknown.join(", ")}.`);
  });
}

// ── Voertuigenregister ────────────────────────────────────────

const vehicleSchema = z.object({
  name: requiredText(200),
  code: optionalText,
  type: optionalText,
  vehicleType: optionalText,
  fuelType: optionalText,
  euroClass: optionalText,
  brand: optionalText,
  model: optionalText,
  buildYear: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) || null : null)),
  inServiceFrom: optionalDate,
  inServiceUntil: optionalDate,
  defaultCarrierId: optionalId,
  disciplineId: optionalId,
  locationId: optionalId,
  notes: optionalText,
});

const LABELS = {
  name: "Naam",
  code: "Kenteken",
  vehicleType: "Soort",
  fuelType: "Brandstof",
  euroClass: "Euroklasse",
  brand: "Merk",
  model: "Model",
  buildYear: "Bouwjaar",
  inServiceFrom: "In dienst",
  inServiceUntil: "Uit dienst",
  disciplineId: "Bedrijfsonderdeel",
  locationId: "Vestiging",
  active: "Actief",
};

export async function createVehicle(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const data = parseForm(vehicleSchema, formData);
    if (data.code && (await prisma.equipment.findUnique({ where: { code: data.code } }))) throw new UserError(`Kenteken/nummer "${data.code}" bestaat al.`);
    const e = await prisma.equipment.create({ data: { ...data, active: !data.inServiceUntil || data.inServiceUntil > new Date() } });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Equipment",
      entityId: e.id,
      summary: `Voertuig/materieel "${e.name}"${e.code ? ` (${e.code})` : ""} toegevoegd`,
    });
    revalidate();
  });
}

export async function updateVehicle(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const data = parseForm(vehicleSchema.extend({ active: z.literal("on").optional() }), formData);
    const { active, ...rest } = data;
    const old = await prisma.equipment.findUnique({ where: { id } });
    if (!old) throw new UserError("Niet gevonden.");
    if (rest.code && rest.code !== old.code && (await prisma.equipment.findUnique({ where: { code: rest.code } })))
      throw new UserError(`Kenteken/nummer "${rest.code}" bestaat al.`);
    const next = { ...rest, active: active === "on" };
    await prisma.equipment.update({ where: { id }, data: next });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Equipment",
      entityId: id,
      summary: `Voertuig/materieel "${rest.name}" gewijzigd`,
      details: { changes: diffFields(old, next, LABELS) },
    });
    revalidate();
    redirect("/co2/materieel");
  });
}

export async function deleteVehicle(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const e = await prisma.equipment.findUnique({ where: { id }, include: { _count: { select: { consumptions: true } } } });
    if (!e) throw new UserError("Niet gevonden.");
    if (e._count.consumptions) throw new UserError("Er staat verbruik op dit voertuig. Vul een 'uit dienst'-datum in in plaats van verwijderen.");
    await prisma.equipment.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "Equipment", entityId: id, summary: `Voertuig/materieel "${e.name}" verwijderd` });
    revalidate();
    redirect("/co2/materieel");
  });
}

const txt = (max: number) => z.string().trim().max(max).optional();
const importRowSchema = z.object({
  rowNumber: z.number().int(),
  code: z.string().trim().min(1).max(50),
  name: txt(200),
  vehicleType: txt(100),
  brand: txt(100),
  model: txt(200),
  fuelType: txt(100),
  euroClass: txt(50),
  buildYear: txt(10),
  inServiceFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  inServiceUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  discipline: txt(200),
  location: txt(200),
});

/** Voertuigenlijst inlezen (bijv. uit het wagenparkbeheer); bijwerken op kenteken; lege cellen wissen niets. */
export async function importVehicles(rowsInput: ImportRow[], options: { updateExisting: boolean }): Promise<ImportResult> {
  try {
    const user = await requirePermission("co2.manage");
    if (!Array.isArray(rowsInput) || !rowsInput.length) return { error: "Geen regels om te importeren." };
    if (rowsInput.length > 5000) return { error: "Maximaal 5000 regels per import." };
    const key = (s: string) => s.trim().toLowerCase();
    const [disciplines, locations] = await Promise.all([
      prisma.discipline.findMany({ select: { id: true, name: true, aliases: true } }),
      prisma.location.findMany({ select: { id: true, name: true } }),
    ]);
    const discMap = disciplineMap(disciplines);
    const locMap = new Map(locations.map((l) => [key(l.name), l.id]));
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
      const fuel = r.fuelType ? parseFuelType(r.fuelType) : undefined;
      const euro = r.euroClass ? parseEuroClass(r.euroClass) : undefined;
      if (r.fuelType && !fuel) warnings.push(`Rij ${r.rowNumber}: brandstof "${r.fuelType}" niet herkend`);
      if (r.euroClass && !euro) warnings.push(`Rij ${r.rowNumber}: Euroklasse "${r.euroClass}" niet herkend`);
      const until = r.inServiceUntil ? new Date(`${r.inServiceUntil}T00:00:00Z`) : undefined;
      const values = {
        name: r.name || [r.brand, r.model].filter(Boolean).join(" ") || r.code,
        type: r.vehicleType,
        vehicleType: r.vehicleType ? (parseVehicleType(r.vehicleType) ?? undefined) : undefined,
        brand: r.brand,
        model: r.model,
        fuelType: fuel ?? undefined,
        // Elektrische voertuigen zijn ook in de milieuclassificatie 'elektrisch'.
        euroClass: euro ?? (fuel === "ELECTRIC" || fuel === "HYDROGEN" ? "ELECTRIC" : undefined),
        buildYear: r.buildYear && Number.isInteger(Number(r.buildYear)) ? Number(r.buildYear) : undefined,
        inServiceFrom: r.inServiceFrom ? new Date(`${r.inServiceFrom}T00:00:00Z`) : undefined,
        inServiceUntil: until,
        active: until ? until > new Date() : undefined,
        disciplineId: r.discipline ? discMap.get(key(r.discipline)) : undefined,
        locationId: r.location ? locMap.get(key(r.location)) : undefined,
      };
      const data = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
      const existing = await prisma.equipment.findUnique({ where: { code: r.code } });
      if (existing) {
        if (!options.updateExisting) {
          skipped++;
          continue;
        }
        await prisma.equipment.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.equipment.create({ data: { ...data, name: values.name, code: r.code } });
        created++;
      }
    }
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Equipment",
      summary: `Voertuigenlijst ingelezen: ${created} nieuw, ${updated} bijgewerkt, ${skipped} overgeslagen`,
      details: { warnings: warnings.slice(0, 200) },
    });
    revalidate();
    return { created, updated, skipped, warnings };
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    console.error("[import] voertuigen", err);
    return { error: "Import mislukt." };
  }
}
