import { z } from "zod";
import { prisma } from "@/lib/db";

/**
 * CO2-jaarverslag (opbouw zoals het jaarverslag trede 1 van Rouwmaat): vaste teksten die QHSE invult,
 * opgeslagen in AppSetting `co2.report`. Cijfers, tabellen, grafieken en de teksten bij de cijfers rekent de app zelf uit.
 */
export const CO2_REPORT_KEY = "co2.report";

const t = (max = 8000) => z.string().max(max).default("");
export const reportTextSchema = z.object({
  statement: t(), // managementstatement & energiebeleid
  statementDate: t(40),
  statementName: t(200),
  organisation: t(), // organisatiebeschrijving
  boundary: t(), // organisatiegrens (tekst + entiteiten)
  projects: t(), // projecten met gunningvoordeel
  nonCo2: t(), // niet-CO2-broeikasgassen
  conclusions: t(), // conclusies, aanbevelingen en genomen maatregelen
  flexibility: t(), // flexibiliteit van het energiesysteem
  strategy: t(), // strategie (korte termijn)
  energyGoals: t(), // subdoelstellingen energie: "Onderwerp | doel" per regel
  justification: t(), // verantwoording doelstellingen
  peers: t(), // vergelijking sectorgenoten: regels met kolommen gescheiden door |
  peersText: t(),
  keyPersons: t(), // sleutelpersonen: "Rol | Naam | Taak | CO2-bewustzijn" per regel
  communication: t(), // communicatieplan: tekst
  channels: t(), // middelen: "Middel | Planning | Verantwoordelijke | Toelichting" per regel
  collaboration: t(), // kennis- en samenwerkingsbehoeften
  partners: t(), // samenwerkingsverbanden, één per regel
});
export type ReportTexts = z.infer<typeof reportTextSchema>;

export function parseReportTexts(value: string | null | undefined): ReportTexts {
  try {
    return reportTextSchema.parse(value ? JSON.parse(value) : {});
  } catch {
    return reportTextSchema.parse({});
  }
}

export async function getReportTexts(): Promise<ReportTexts> {
  const row = await prisma.appSetting.findUnique({ where: { key: CO2_REPORT_KEY } });
  return parseReportTexts(row?.value);
}

/** Tabel uit tekst: één regel per rij, kolommen gescheiden door | (lege regels overgeslagen). */
export function pipeTable(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split("|").map((c) => c.trim()));
}

// ── Teksten bij de cijfers ─────────────────────────────────────

export type YearLines = { year: number; lines: { name: string; unit: string; scope: number; group: string; quantity: number; kg: number }[] };

const nl0 = (n: number) => Math.round(n).toLocaleString("nl-NL");
const nl1 = (n: number) => n.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const change = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);
const verb = (pct: number) => (pct < 0 ? "gedaald" : "gestegen");

/**
 * Brandstofgebruik (liters, scope 1, geen aardgas) per energiedrager per jaar en een samenvatting zoals in het
 * jaarverslag: totaal en verschil met vorig jaar en het eerste jaar, de grootste stroom en opvallende verschuivingen.
 */
export function fuelSummary(years: YearLines[], year: number) {
  const isFuel = (l: YearLines["lines"][number]) => l.scope === 1 && l.unit.toLowerCase().startsWith("liter") && !/aardgas/i.test(l.group);
  const perYear = years.map((y) => {
    const m = new Map<string, number>();
    for (const l of y.lines.filter(isFuel)) m.set(l.name, (m.get(l.name) ?? 0) + l.quantity);
    return { year: y.year, byCarrier: m, total: [...m.values()].reduce((n, v) => n + v, 0) };
  });
  const cur = perYear.find((p) => p.year === year);
  const prev = perYear.find((p) => p.year === year - 1);
  const first = perYear.find((p) => p.total > 0 && p.year < year - 1);
  const carriers = [...new Set(perYear.flatMap((p) => [...p.byCarrier.keys()]))].sort((a, b) => (cur?.byCarrier.get(b) ?? 0) - (cur?.byCarrier.get(a) ?? 0));
  const sentences: string[] = [];
  if (cur && cur.total) {
    let s = `Het totale brandstofgebruik bedraagt in ${year} ${nl0(cur.total)} liter.`;
    const c1 = prev ? change(cur.total, prev.total) : null;
    if (c1 !== null) s += ` Ten opzichte van ${year - 1} is het verbruik met circa ${nl1(Math.abs(c1))}% ${verb(c1)} (${nl0(prev!.total)} liter).`;
    const c2 = first ? change(cur.total, first.total) : null;
    if (c2 !== null) s += ` Ten opzichte van ${first!.year} is sprake van een ${c2 < 0 ? "daling" : "stijging"} van circa ${nl1(Math.abs(c2))}%.`;
    sentences.push(s);
    const top = carriers[0];
    if (top) {
      const v = cur.byCarrier.get(top) ?? 0;
      sentences.push(
        `De grootste stroom is ${top.toLowerCase()}: ${nl0(v)} liter, goed voor circa ${nl1((v / cur.total) * 100)}% van het totale brandstofgebruik.`,
      );
    }
    for (const c of carriers.slice(1)) {
      const v = cur.byCarrier.get(c) ?? 0;
      const p = prev?.byCarrier.get(c) ?? 0;
      const ch = change(v, p);
      if (ch !== null && Math.abs(ch) >= 20 && Math.max(v, p) >= 1000)
        sentences.push(`${c}: ${nl0(v)} liter in ${year} (${ch > 0 ? "+" : "−"}${nl1(Math.abs(ch))}% t.o.v. ${year - 1}).`);
    }
  }
  return { perYear, carriers, sentences };
}

/** Samenvatting van de uitstoot: totaal per scope en de ontwikkeling sinds het eerste jaar. */
export function emissionSummary(totals: { year: number; kg: number; scope1: number; scope2: number; bt: number }[], year: number) {
  const cur = totals.find((t) => t.year === year);
  const first = totals.find((t) => t.kg > 0 && t.year < year);
  if (!cur || !cur.kg) return [];
  const tn = (kg: number) => (kg / 1000).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const out = [
    `In ${year} bedroeg de totale CO2-uitstoot ${tn(cur.kg)} ton CO2. Hiervan was ${tn(cur.scope1)} ton CO2 (${nl1((cur.scope1 / cur.kg) * 100)}%) afkomstig uit scope 1, ${tn(cur.scope2)} ton CO2 uit scope 2 en ${tn(cur.bt)} ton CO2 uit zakelijk reizen.`,
  ];
  if (first) {
    const ch = change(cur.kg, first.kg)!;
    out.push(
      `Ten opzichte van ${first.year} is de totale CO2-uitstoot ${ch < 0 ? "afgenomen" : "toegenomen"} van ${tn(first.kg)} naar ${tn(cur.kg)} ton CO2 (${ch > 0 ? "+" : "−"}${nl1(Math.abs(ch))}%).`,
    );
  }
  return out;
}
