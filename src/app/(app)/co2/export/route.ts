import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { PERIOD_PARTS, type PeriodPart } from "@/lib/co2";
import { latestDataYear, loadFootprint } from "@/lib/co2-data";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";

/** Export van de footprint (per verbruiksregel, naar rato toegerekend) voor de gekozen periode. */
export async function GET(request: Request) {
  const user = await requireUser();
  const sp = new URL(request.url).searchParams;
  const year = Number(sp.get("jaar")) || (await latestDataYear());
  const part = (PERIOD_PARTS.some((p) => p.value === sp.get("deel")) ? sp.get("deel") : "jaar") as PeriodPart;
  const fp = await loadFootprint(year, part, { disciplineId: sp.get("discipline") || undefined, locationId: sp.get("locatie") || undefined });
  const header = [
    "Periode verbruik van",
    "t/m",
    "Energiedrager",
    "Eenheid",
    "Hoeveelheid (in rapportageperiode)",
    "Emissiefactor (kg CO2e/eenheid)",
    "kg CO2e",
    "Scope",
    "Discipline",
    "Locatie",
    "Materieel",
    "Omschrijving",
  ];
  const rows = fp.rows.map((r) => [
    formatDate(r.c.periodStart),
    formatDate(r.c.periodEnd),
    r.c.carrier.name,
    r.c.carrier.unit,
    r.quantity.toFixed(4).replace(".", ","),
    r.factor === null ? "geen factor" : String(r.factor).replace(".", ","),
    r.kg === null ? "" : r.kg.toFixed(2).replace(".", ","),
    r.scope,
    r.c.discipline?.name ?? "",
    r.c.location?.name ?? "",
    r.c.equipment ? (r.c.equipment.code ?? r.c.equipment.name) : "",
    r.c.description ?? "",
  ]);
  const totals = [
    [],
    ["Totaal scope 1 (kg)", fp.byScope[1].toFixed(2).replace(".", ",")],
    ["Totaal scope 2 (kg)", fp.byScope[2].toFixed(2).replace(".", ",")],
    ["Totaal scope 3 (kg)", fp.byScope[3].toFixed(2).replace(".", ",")],
    ["Totaal (kg)", fp.totalKg.toFixed(2).replace(".", ",")],
  ];
  await logAudit({ user, action: "VIEW", entityType: "EnergyConsumption", summary: `CO2-footprint ${fp.range.label} geëxporteerd (${rows.length} regels)` });
  return csvResponse(toCsv([[`CO2-footprint ${fp.range.label}`], header, ...rows, ...totals]), `co2-footprint-${fp.range.label.replace(/\s+/g, "-")}.csv`);
}
