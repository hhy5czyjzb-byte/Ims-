"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { EnergyCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { UserError } from "@/lib/action-result";
import { CO2_SETTINGS_KEY, getCo2Settings } from "@/lib/co2-settings";
import { parseStreamGroup } from "@/lib/co2";

/**
 * Import van het CO2-dashboard (Excel, handboek 4.0) in vier stappen, zodat elk verzoek klein blijft:
 * 1. instellingen: organisaties, energiedragers, emissiefactoren per jaar (WTT/TTW/WTW/biogeen) en GJ-conversie;
 * 2. verbruik en KPI's (verbruik uit het dashboard wordt per jaar vervangen, dus herimport geeft geen dubbele regels);
 * 3. DKMP; 4. plan van aanpak (maatregelen → acties met CO2-gegevens) en de doelstelling.
 */

type Result = { error?: string; summary?: string; warnings?: string[] };
const DASH_PREFIX = "co2dash:";
const key = (s: string) => s.trim().toLowerCase();

function revalidate() {
  revalidatePath("/co2", "layout");
  revalidatePath("/acties", "layout");
  revalidatePath("/");
}

function guessCategory(name: string, scope: number): EnergyCategory {
  const n = name.toLowerCase();
  if (/aardgas|groengas|propaan/.test(n)) return "GAS";
  if (/elektri/.test(n)) return "ELECTRICITY";
  if (/warmte/.test(n)) return "HEAT";
  if (/zakelijk|vlieg|trein|openbaar vervoer/.test(n)) return "TRAVEL";
  if (scope === 1) return "FUEL";
  return "OTHER";
}

/** Energiedragers op naam of alias. */
async function carrierIndex() {
  const carriers = await prisma.energyCarrier.findMany({ select: { id: true, name: true, aliases: true, unit: true, defaultScope: true } });
  const map = new Map<string, (typeof carriers)[number]>();
  for (const c of carriers) {
    map.set(key(c.name), c);
    for (const a of (c.aliases ?? "").split(",")) if (a.trim()) map.set(key(a), c);
  }
  return map;
}

const setupSchema = z.object({
  organisations: z.array(z.object({ name: z.string().min(1).max(200), boundaryPct: z.number().min(0).max(100) })).max(50),
  factors: z
    .array(
      z.object({
        stream: z.string().min(1).max(200),
        scope: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        unit: z.string().max(30),
        year: z.number().int().min(1990).max(2100),
        wttKg: z.number().nullable(),
        ttwKg: z.number().nullable(),
        wtwKg: z.number(),
        biogenicKg: z.number().nullable(),
      }),
    )
    .max(5000),
  energy: z
    .array(
      z.object({
        stream: z.string().min(1).max(200),
        scope: z.number().nullable(),
        unit: z.string().max(30),
        gjPerUnit: z.number().positive(),
        source: z.string().nullable(),
      }),
    )
    .max(500),
});

export async function importCo2Setup(input: unknown): Promise<Result> {
  try {
    const user = await requirePermission("co2.manage");
    const p = setupSchema.safeParse(input);
    if (!p.success) return { error: "Ongeldige gegevens uit het tabblad keuzevariabelen." };
    const { organisations, factors, energy } = p.data;
    for (const o of organisations) await prisma.co2Organisation.upsert({ where: { name: o.name }, create: o, update: { boundaryPct: o.boundaryPct } });

    const idx = await carrierIndex();
    let carriersCreated = 0;
    const streams = new Map<string, { scope: number; unit: string }>();
    for (const f of factors) streams.set(f.stream, { scope: f.scope, unit: f.unit });
    for (const e of energy) if (!streams.has(e.stream) && e.scope) streams.set(e.stream, { scope: e.scope, unit: e.unit });
    for (const [name, info] of streams) {
      if (idx.has(key(name))) continue;
      const c = await prisma.energyCarrier.create({
        data: { name, unit: info.unit || "eenheid", defaultScope: info.scope === 2 ? 2 : info.scope === 3 ? 3 : 1, category: guessCategory(name, info.scope) },
        select: { id: true, name: true, aliases: true, unit: true, defaultScope: true },
      });
      idx.set(key(name), c);
      carriersCreated++;
    }
    for (const e of energy) {
      const c = idx.get(key(e.stream));
      if (c) await prisma.energyCarrier.update({ where: { id: c.id }, data: { energyPerUnit: e.gjPerUnit } });
    }
    let factorCount = 0;
    for (const f of factors) {
      const c = idx.get(key(f.stream));
      if (!c) continue;
      const validFrom = new Date(Date.UTC(f.year, 0, 1));
      const data = { factor: f.wtwKg, wtt: f.wttKg, ttw: f.ttwKg, biogenic: f.biogenicKg, source: `CO2-dashboard (handboek 4.0), factoren ${f.year}` };
      await prisma.emissionFactor.upsert({
        where: { carrierId_validFrom: { carrierId: c.id, validFrom } },
        create: { carrierId: c.id, validFrom, ...data },
        update: data,
      });
      factorCount++;
    }
    // Location-based scope 2: gridmix NL als referentie, als dat nog niet is ingesteld.
    const settings = await getCo2Settings();
    if (!settings.locationBasedCarrierId) {
      const grid = [...idx.values()].find((c) => /gridmix/i.test(c.name));
      if (grid)
        await prisma.appSetting.upsert({
          where: { key: CO2_SETTINGS_KEY },
          create: { key: CO2_SETTINGS_KEY, value: JSON.stringify({ ...settings, locationBasedCarrierId: grid.id }), updatedById: user.id },
          update: { value: JSON.stringify({ ...settings, locationBasedCarrierId: grid.id }), updatedById: user.id },
        });
    }
    const summary = `${organisations.length} organisatie(s), ${carriersCreated} nieuwe energiedrager(s), ${factorCount} emissiefactoren, ${energy.length} GJ-conversies`;
    await logAudit({ user, action: "CREATE", entityType: "EmissionFactor", summary: `CO2-dashboard ingelezen: ${summary}` });
    revalidate();
    return { summary };
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    console.error("[co2-import] instellingen", err);
    return { error: "Inlezen van de emissiefactoren mislukt." };
  }
}

const dataSchema = z.object({
  consumptions: z
    .array(
      z.object({
        row: z.number().int(),
        organisation: z.string().max(200),
        year: z.number().int().min(1990).max(2100),
        footprintType: z.enum(["Heel jaar", "Half jaar"]),
        scope: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        stream: z.string().min(1).max(200),
        quantity: z.number(),
        unit: z.string().max(30),
        source: z.string().max(1000).nullable(),
        note: z.string().max(2000).nullable(),
        location: z.string().max(300).nullable(),
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .max(20000),
  kpis: z
    .array(
      z.object({
        organisation: z.string().max(200),
        year: z.number().int(),
        kind: z.enum(["FTE", "REVENUE", "KM", "OTHER"]),
        label: z.string().max(200),
        value: z.number(),
      }),
    )
    .max(2000),
});

/** Vestiging herkennen aan straat + huisnummer (bijv. "Kanaalstraat 297 Enschede, 8716…" → vestiging met "Kanaalstraat 297"). */
function matchLocation(text: string | null, locations: { id: string; name: string; address: string | null }[]): string | null {
  if (!text) return null;
  const t = key(text);
  const m = t.match(/([a-z][a-z .'-]+?)\s*(\d+[a-z]?)/);
  for (const l of locations) {
    const hay = key(`${l.name} ${l.address ?? ""}`);
    if (m && hay.includes(`${m[1].trim()} ${m[2]}`)) return l.id;
    if (hay && (t.includes(key(l.name)) || key(l.name).includes(t))) return l.id;
  }
  return null;
}

export async function importCo2Data(input: unknown): Promise<Result> {
  try {
    const user = await requirePermission("co2.manage");
    const p = dataSchema.safeParse(input);
    if (!p.success) return { error: "Ongeldige gegevens uit het tabblad Data scope 1&2." };
    const { consumptions, kpis } = p.data;
    const idx = await carrierIndex();
    const [orgs, locations] = await Promise.all([
      prisma.co2Organisation.findMany(),
      prisma.location.findMany({ select: { id: true, name: true, address: true } }),
    ]);
    const orgMap = new Map(orgs.map((o) => [key(o.name), o.id]));
    const ensureOrg = async (name: string) => {
      if (!orgMap.has(key(name))) orgMap.set(key(name), (await prisma.co2Organisation.create({ data: { name } })).id);
      return orgMap.get(key(name))!;
    };
    const warnings: string[] = [];
    // Verbruik uit het dashboard per jaar vervangen (handmatig ingevoerd verbruik blijft staan).
    const years = [...new Set(consumptions.map((c) => c.year))];
    let removed = 0;
    for (const y of years) {
      const r = await prisma.energyConsumption.deleteMany({
        where: { externalRef: { startsWith: DASH_PREFIX }, periodStart: { gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) } },
      });
      removed += r.count;
    }
    let created = 0;
    for (const c of consumptions) {
      let carrier = idx.get(key(c.stream));
      if (!carrier) {
        carrier = await prisma.energyCarrier.create({
          data: { name: c.stream, unit: c.unit || "eenheid", defaultScope: c.scope, category: guessCategory(c.stream, c.scope) },
          select: { id: true, name: true, aliases: true, unit: true, defaultScope: true },
        });
        idx.set(key(c.stream), carrier);
        warnings.push(`Energiedrager "${c.stream}" bestond nog niet en is aangemaakt (zonder emissiefactor? Controleer de factoren).`);
      }
      const locationId = matchLocation(c.location, locations);
      await prisma.energyConsumption.create({
        data: {
          externalRef: `${DASH_PREFIX}${c.year}:${c.row}`,
          carrierId: carrier.id,
          quantity: c.quantity,
          periodStart: new Date(`${c.periodStart}T00:00:00Z`),
          periodEnd: new Date(`${c.periodEnd}T00:00:00Z`),
          scope: c.scope !== carrier.defaultScope ? c.scope : null,
          description: c.note,
          sourceRef: c.source,
          locationText: c.location,
          locationId,
          organisationId: await ensureOrg(c.organisation),
          createdById: user.id,
        },
      });
      created++;
    }
    let kpiCount = 0;
    for (const k of kpis) {
      const organisationId = await ensureOrg(k.organisation);
      const existing = await prisma.co2Kpi.findFirst({ where: { year: k.year, kind: k.kind, organisationId } });
      if (existing) await prisma.co2Kpi.update({ where: { id: existing.id }, data: { value: k.value, label: k.label, source: "CO2-dashboard" } });
      else await prisma.co2Kpi.create({ data: { year: k.year, kind: k.kind, label: k.label, value: k.value, organisationId, source: "CO2-dashboard" } });
      kpiCount++;
    }
    const summary = `${created} verbruiksregels (${years.length} jaar; ${removed} eerder ingelezen regels vervangen), ${kpiCount} kengetallen`;
    await logAudit({ user, action: "CREATE", entityType: "EnergyConsumption", summary: `CO2-dashboard ingelezen: ${summary}` });
    revalidate();
    return { summary, warnings: [...new Set(warnings)] };
  } catch (err) {
    console.error("[co2-import] verbruik", err);
    return { error: "Inlezen van het verbruik mislukt." };
  }
}

const dkmpSchema = z.array(
  z.object({
    section: z.string().min(1).max(200),
    stream: z.string().min(1).max(300),
    unit: z.string().max(50).nullable(),
    source: z.string().max(1000).nullable(),
    dataOwner: z.string().max(500).nullable(),
    executor: z.string().max(500).nullable(),
    requestPeriod: z.string().max(200).nullable(),
    analysisPeriod: z.string().max(200).nullable(),
    deviation: z.string().max(4000).nullable(),
    uncertainty: z.string().max(4000).nullable(),
    improvement: z.string().max(4000).nullable(),
  }),
);

export async function importCo2Dkmp(input: unknown): Promise<Result> {
  try {
    const user = await requirePermission("co2.manage");
    const p = dkmpSchema.max(1000).safeParse(input);
    if (!p.success) return { error: "Ongeldige gegevens uit het tabblad DKMP." };
    let n = 0;
    for (const [i, item] of p.data.entries()) {
      await prisma.dataQualityItem.upsert({
        where: { section_stream: { section: item.section, stream: item.stream } },
        create: { ...item, sortOrder: i },
        update: { ...item, sortOrder: i },
      });
      n++;
    }
    await logAudit({ user, action: "CREATE", entityType: "DataQualityItem", summary: `DKMP ingelezen uit het CO2-dashboard (${n} emissiestromen)` });
    revalidate();
    return { summary: `${n} regels in het DKMP` };
  } catch (err) {
    console.error("[co2-import] dkmp", err);
    return { error: "Inlezen van het DKMP mislukt." };
  }
}

const opt = (max: number) => z.string().max(max).nullable();
const measuresSchema = z.object({
  measures: z
    .array(
      z.object({
        streamGroup: z.string().max(200),
        title: z.string().min(1).max(300),
        description: opt(4000),
        deadline: opt(100),
        planning: opt(2000),
        skao: opt(100),
        skaoCategory: opt(20),
        term: opt(100),
        owner: opt(300),
        knowledgeNeed: opt(1000),
        progressNote: opt(4000),
        trl: opt(200),
        flexibilityImpact: opt(1000),
        investment: opt(500),
        legislation: opt(1000),
        resources: opt(2000),
        valueChain: opt(1000),
        currentYearActions: opt(2000),
        tenderAdvantage: opt(500),
        notApplicableReason: opt(2000),
        measureType: opt(200),
        reductionPct: z.number().nullable(),
        energyReductionPct: z.number().nullable(),
      }),
    )
    .max(500),
  pva: z.object({ baseYear: z.number().int().nullable(), targetYear: z.number().int().nullable(), targetText: z.string().max(2000).nullable() }).nullable(),
});

function deadlineFrom(text: string | null): Date | null {
  if (!text) return null;
  const y = text.match(/^(20\d{2})$/);
  if (y) return new Date(Date.UTC(+y[1], 11, 31));
  const d = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (d) return new Date(Date.UTC(+d[1], +d[2] - 1, +d[3]));
  return null;
}

/** Plan van aanpak → acties (bron CO2-reductie) met CO2-gegevens; bijwerken op titel. Doelstelling uit de PVA-berekening. */
export async function importCo2Measures(input: unknown): Promise<Result> {
  try {
    const user = await requirePermission("co2.manage");
    const p = measuresSchema.safeParse(input);
    if (!p.success) return { error: "Ongeldige gegevens uit het plan van aanpak." };
    const { measures, pva } = p.data;
    let targetId: string | null = null;
    if (pva?.baseYear && pva.targetYear) {
      const pct = Number(pva.targetText?.match(/(\d+(?:[.,]\d+)?)\s*%/)?.[1]?.replace(",", ".") ?? NaN);
      const existing = await prisma.reductionTarget.findFirst({
        where: { baseYear: pva.baseYear, targetYear: pva.targetYear, scope: null, disciplineId: null },
      });
      if (existing) targetId = existing.id;
      else if (Number.isFinite(pct))
        targetId = (
          await prisma.reductionTarget.create({
            data: {
              title: `CO2-reductie ${pct}% in ${pva.targetYear} t.o.v. ${pva.baseYear}`,
              description: pva.targetText,
              baseYear: pva.baseYear,
              targetYear: pva.targetYear,
              reductionPct: pct,
            },
          })
        ).id;
    }
    const idx = await carrierIndex();
    let created = 0;
    let updated = 0;
    for (const m of measures) {
      const group = parseStreamGroup(m.streamGroup) ?? m.streamGroup;
      const existing = await prisma.action.findFirst({ where: { source: "CO2_REDUCTION", title: m.title } });
      const deadline = deadlineFrom(m.deadline);
      const actionData = {
        title: m.title,
        description: [m.description, m.planning && `Planning: ${m.planning}`].filter(Boolean).join("\n\n") || null,
        ownerText: m.owner && !/^afdeling\/functie/i.test(m.owner) ? m.owner : null,
        deadline,
        reductionTargetId: targetId,
      };
      const co2 = {
        streamGroup: group,
        carrierId: idx.get(key(m.streamGroup))?.id ?? null,
        reductionPct: m.reductionPct,
        energyReductionPct: m.energyReductionPct,
        measureType: m.measureType,
        skao: m.skao,
        skaoCategory: m.skaoCategory,
        term: m.term,
        planning: m.planning ?? (m.deadline && !deadline ? m.deadline : null),
        knowledgeNeed: m.knowledgeNeed,
        progressNote: m.progressNote,
        trl: m.trl,
        flexibilityImpact: m.flexibilityImpact,
        investment: m.investment,
        legislation: m.legislation,
        resources: m.resources,
        valueChain: m.valueChain,
        currentYearActions: m.currentYearActions,
        tenderAdvantage: m.tenderAdvantage,
        notApplicableReason: m.notApplicableReason,
      };
      if (existing) {
        await prisma.action.update({
          where: { id: existing.id },
          data: { ...actionData, co2Measure: { upsert: { create: co2, update: co2 } } },
        });
        updated++;
      } else {
        await prisma.action.create({
          data: { ...actionData, source: "CO2_REDUCTION", kind: "IMPROVEMENT", createdById: user.id, co2Measure: { create: co2 } },
        });
        created++;
      }
    }
    const summary = `${created} nieuwe en ${updated} bijgewerkte maatregelen${targetId ? ", gekoppeld aan de doelstelling" : ""}`;
    await logAudit({ user, action: "CREATE", entityType: "Action", summary: `Plan van aanpak ingelezen uit het CO2-dashboard: ${summary}` });
    revalidate();
    return { summary };
  } catch (err) {
    console.error("[co2-import] plan van aanpak", err);
    return { error: "Inlezen van het plan van aanpak mislukt." };
  }
}
