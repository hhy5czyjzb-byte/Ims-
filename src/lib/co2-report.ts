import { z } from "zod";
import { prisma } from "@/lib/db";

/**
 * CO2-jaarverslag (opbouw zoals het jaarverslag trede 1 van Rouwmaat): vaste teksten die QHSE invult,
 * opgeslagen in AppSetting `co2.report`. Cijfers, tabellen, grafieken en de teksten bij de cijfers rekent de app zelf uit.
 */
export const CO2_REPORT_KEY = "co2.report";

const t = (max = 12000) => z.string().max(max).default("");
/**
 * Alle tekstvelden ondersteunen eenvoudige opmaak (`richBlocks`): lege regel = nieuwe alinea, "## " kop,
 * "### " tussenkop, "- " opsomming, regels met | = tabel (eerste regel kolomkoppen).
 */
export const reportTextSchema = z.object({
  publication: t(200), // regel onder de titel op het voorblad, bijv. "CO2-prestatieladder – Publicatie oktober 2026"
  readingGuide: t(), // leeswijzer
  statement: t(), // managementstatement & energiebeleid
  statementDate: t(40),
  statementName: t(200),
  organisation: t(), // organisatiebeschrijving
  boundary: t(), // organisatiegrens (tekst + entiteiten)
  planning: t(), // planning: PDCA-cyclus
  pdcaPlan: t(1000), // tekst in het PDCA-figuur
  pdcaDo: t(1000),
  pdcaCheck: t(1000),
  pdcaAct: t(1000),
  legalRisk: t(), // wetgeving en risicobeheer
  projects: t(), // projecten met gunningvoordeel
  footprintText: t(), // toelichting footprint (leeg = automatische tekst)
  nonCo2: t(), // niet-CO2-broeikasgassen
  energyReview: t(), // energiebeoordeling (inleiding; de stromen tot 80% rekent de app uit)
  fuelText: t(), // brandstofgebruik (leeg = automatische tekst)
  truckText: t(), // vrachtwagenpark (bij figuur V1)
  fleetText: t(), // wagenpark (bij figuur V3)
  conclusions: t(), // conclusies, aanbevelingen en genomen maatregelen
  flexibility: t(), // flexibiliteit van het energiesysteem
  strategy: t(), // algemene uitleg strategie
  co2TargetText: t(), // korte termijn CO2-doelstellingen (inleiding)
  energyTargetText: t(), // korte termijn energiedoelstellingen (inleiding)
  energyGoals: t(), // subdoelstellingen energie: "Onderwerp | doel" per regel
  shortTermStrategy: t(), // korte termijn strategie
  planText: t(), // plan van aanpak (leeg = de vijf grootste maatregelen uit het plan van aanpak)
  justification: t(), // verantwoording doelstellingen
  progressText: t(), // voortgang CO2 (leeg = automatische tekst)
  energyProgressText: t(), // voortgang energie
  peersIntro: t(), // vergelijking met sectorgenoten: inleiding
  peers: t(), // tabel: eerste regel kolomkoppen
  peersText: t(),
  keyPersonsIntro: t(),
  keyPersons: t(), // tabel: eerste regel kolomkoppen, regel met alleen de eerste kolom = tussenkop
  support: t(), // ondersteuning (adviseur)
  communication: t(), // communicatieplan: inleiding
  channels: t(), // middelen
  audienceExternal: t(), // externe doelgroepen: tabel
  audienceInternal: t(), // interne doelgroepen: tabel
  commPlanning: t(), // verantwoordelijke en planning per middel
  collaboration: t(), // inventarisatie kennis- en samenwerkingsbehoeftes
  partners: t(), // samenwerkingsverbanden, één per regel
  partnersText: t(), // toelichting samenwerkingsverbanden / waardeketen
  closing: t(), // slot: "Bedankt voor het lezen" + contact
});
export type ReportTexts = z.infer<typeof reportTextSchema>;

export const REPORT_FILE_TYPE = "ims-co2-jaarverslag-teksten";

/**
 * Teksten uit een bestand (download van deze pagina): alleen bekende velden met een niet-lege waarde.
 * Gooit een fout met een Nederlandse melding als het geen tekstenbestand is.
 */
export function textsFromFile(json: string): Partial<ReportTexts> {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Dit is geen geldig tekstenbestand (geen JSON).");
  }
  const obj = data && typeof data === "object" && "texts" in data ? (data as { texts: unknown }).texts : data;
  if (!obj || typeof obj !== "object") throw new Error("Dit is geen tekstenbestand van het CO2-jaarverslag.");
  const out: Partial<ReportTexts> = {};
  const shape = reportTextSchema.shape;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!(k in shape) || typeof v !== "string" || !v.trim()) continue;
    const r = shape[k as keyof ReportTexts].safeParse(v.trim());
    if (r.success) out[k as keyof ReportTexts] = r.data;
  }
  if (!Object.keys(out).length) throw new Error("Het bestand bevat geen teksten voor het CO2-jaarverslag.");
  return out;
}

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

// ── Opmaak in de teksten ───────────────────────────────────────

export type RichBlock =
  | { kind: "p"; text: string }
  | { kind: "h"; level: 2 | 3; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "table"; head: string[]; rows: { cells: string[]; group: boolean }[] };

const BULLET = /^\s*(?:[-•*▪●]|\d+[.)])\s+/;

/**
 * Eenvoudige opmaak voor de verslagteksten: lege regel = nieuwe alinea; "## kop" en "### tussenkop";
 * regels die beginnen met "- " of "• " = opsomming; opeenvolgende regels met | = tabel (eerste regel
 * = kolomkoppen; een regel met alleen tekst in de eerste kolom = tussenkop in de tabel).
 */
export function richBlocks(text: string): RichBlock[] {
  const out: RichBlock[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join("\n") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      out.push({ kind: "h", level: h[1].length === 2 ? 2 : 3, text: h[2].trim() });
      continue;
    }
    if (line.includes("|")) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes("|")) {
        const cells = lines[i]
          .trim()
          .replace(/\|\s*$/, "")
          .split("|")
          .map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$|^$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      const width = Math.max(...rows.map((r) => r.length));
      const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
      const [head, ...body] = rows.map(pad);
      out.push({ kind: "table", head, rows: body.map((cells) => ({ cells, group: width > 1 && !!cells[0] && cells.slice(1).every((c) => !c) })) });
      continue;
    }
    if (BULLET.test(line)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && BULLET.test(lines[i].trim())) {
        let item = lines[i].trim().replace(BULLET, "");
        // vervolgregels (ingesprongen, geen nieuw opsommingsteken) horen bij hetzelfde punt
        while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !BULLET.test(lines[i + 1].trim())) item += ` ${lines[++i].trim()}`;
        items.push(item);
        i++;
      }
      i--;
      out.push({ kind: "ul", items });
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

// ── Teksten bij de cijfers ─────────────────────────────────────

/**
 * Energiebeoordeling: de emissiestromen die samen ten minste 80% van het energieverbruik vormen
 * (grootste eerst, tot en met de stroom waarmee 80% wordt bereikt).
 */
export function majorEnergyStreams<T extends { name: string; gj: number }>(lines: T[], share = 0.8): (T & { pct: number; cumPct: number })[] {
  const pos = lines.filter((l) => l.gj > 0).sort((a, b) => b.gj - a.gj);
  const total = pos.reduce((n, l) => n + l.gj, 0);
  if (!total) return [];
  const out: (T & { pct: number; cumPct: number })[] = [];
  let cum = 0;
  for (const l of pos) {
    cum += l.gj;
    out.push({ ...l, pct: (l.gj / total) * 100, cumPct: (cum / total) * 100 });
    if (cum / total >= share - 1e-9) break;
  }
  return out;
}

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
