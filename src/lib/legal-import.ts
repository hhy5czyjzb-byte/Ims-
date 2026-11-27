import type { ComplianceStatus, LegalCategory } from "@prisma/client";

/**
 * Import van het bestaande register wet- en regelgeving (Excel of CSV).
 * Pure functies: worden in de browser gebruikt (voorbeeld/kolommen koppelen)
 * én op de server (opnieuw valideren). Geen afhankelijkheden van Node of DOM.
 */

export type ImportFieldKey =
  | "externalRef"
  | "title"
  | "article"
  | "subject"
  | "description"
  | "source"
  | "sourceUrl"
  | "category"
  | "discipline"
  | "location"
  | "owner"
  | "status"
  | "explanation"
  | "lastReviewDate"
  | "nextReviewDate";

export const IMPORT_FIELDS: { key: ImportFieldKey; label: string; required?: boolean; hints: string[] }[] = [
  { key: "externalRef", label: "Kenmerk / nr. in bronregister", hints: ["nr", "nummer", "kenmerk", "id", "code", "ref", "referentie", "volgnummer"] },
  {
    key: "title",
    label: "Wet / regeling",
    required: true,
    hints: ["wet", "regeling", "wetgeving", "wet en regelgeving", "besluit", "titel", "naam", "wettelijke eis"],
  },
  { key: "article", label: "Artikel / onderdeel", hints: ["artikel", "art", "onderdeel", "hoofdstuk", "paragraaf", "voorschrift"] },
  { key: "subject", label: "Onderwerp", hints: ["onderwerp", "thema", "aspect"] },
  { key: "description", label: "Eis / omschrijving", hints: ["eis", "omschrijving", "verplichting", "inhoud", "beschrijving", "samenvatting", "eisen"] },
  { key: "source", label: "Bevoegd gezag / bron", hints: ["bevoegd gezag", "gezag", "bron", "instantie", "uitgever", "toezichthouder"] },
  { key: "sourceUrl", label: "Link (https)", hints: ["link", "url", "website", "vindplaats"] },
  { key: "category", label: "Categorie", hints: ["categorie", "soort", "type", "domein", "rubriek"] },
  { key: "discipline", label: "Discipline", hints: ["discipline", "afdeling", "bedrijfsonderdeel", "divisie", "werkmaatschappij"] },
  { key: "location", label: "Locatie", hints: ["locatie", "vestiging", "inrichting", "terrein"] },
  { key: "owner", label: "Eigenaar", hints: ["eigenaar", "verantwoordelijk", "verantwoordelijke", "owner", "contactpersoon"] },
  { key: "status", label: "Compliancestatus", hints: ["status", "voldoet", "compliance", "naleving", "compliancestatus", "voldaan"] },
  { key: "explanation", label: "Toelichting", hints: ["toelichting", "opmerking", "opmerkingen", "onderbouwing", "maatregel", "maatregelen", "bewijs"] },
  {
    key: "lastReviewDate",
    label: "Datum laatste toetsing",
    hints: ["laatste toetsing", "datum toetsing", "getoetst", "beoordeeld", "datum laatste", "laatst getoetst"],
  },
  {
    key: "nextReviewDate",
    label: "Volgende toetsing",
    hints: ["volgende toetsing", "volgende", "herbeoordeling", "hertoetsing", "volgende beoordeling", "toetsen voor"],
  },
];

export type Mapping = Partial<Record<ImportFieldKey, number>>; // veld → kolomindex

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Stel per veld een kolom voor op basis van de kopteksten. Elke kolom wordt hooguit één keer gebruikt. */
export function suggestMapping(headers: string[]): Mapping {
  const scored: { key: ImportFieldKey; col: number; score: number }[] = [];
  headers.forEach((h, col) => {
    const hn = norm(h ?? "");
    if (!hn) return;
    for (const f of IMPORT_FIELDS) {
      let best = 0;
      for (const hint of f.hints) {
        const hi = norm(hint);
        const words = hn.split(" ");
        if (hn === hi) best = Math.max(best, 100 + hi.length);
        else if (hi.includes(" ") && hn.includes(hi)) best = Math.max(best, 60 + hi.length);
        else if (words.includes(hi)) best = Math.max(best, 40 + hi.length);
        else if (hi.length >= 4 && hn.startsWith(hi)) best = Math.max(best, 20 + hi.length);
      }
      if (best) scored.push({ key: f.key, col, score: best });
    }
  });
  scored.sort((a, b) => b.score - a.score);
  const mapping: Mapping = {};
  const usedCols = new Set<number>();
  for (const s of scored) {
    if (mapping[s.key] !== undefined || usedCols.has(s.col)) continue;
    mapping[s.key] = s.col;
    usedCols.add(s.col);
  }
  return mapping;
}

/** Eerste rij met minstens twee gevulde cellen geldt als kopregel (registers beginnen vaak met een titelregel). */
export function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const filled = rows[i].filter((c) => c !== null && c !== undefined && String(c).trim() !== "").length;
    if (filled >= 2) return i;
  }
  return 0;
}

/** Eenvoudige CSV-parser (puntkomma, komma of tab; aanhalingstekens volgens RFC 4180). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", "\t", ","].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Compliancestatus uit vrije tekst; `null` = niet herkend. Lege cel = nog niet getoetst. */
export function parseStatus(value: unknown): ComplianceStatus | null {
  const v = norm(String(value ?? ""));
  if (!v) return "NOT_ASSESSED";
  if (/^(n v t|nvt|niet van toepassing|na|n a|not applicable)$/.test(v)) return "NOT_APPLICABLE";
  if (/(voldoet niet|niet voldaan|non ?compliant|nee|^niet$|^nok$|^rood$|^red$|^no$)/.test(v)) return "NON_COMPLIANT";
  if (/(deels|gedeeltelijk|ten dele|partial|^oranje$|^geel$|^amber$|^orange$)/.test(v)) return "PARTIAL";
  if (/(voldoet|voldaan|^ja$|^ok$|^groen$|^green$|conform|compliant|^yes$|^v$|^x$)/.test(v)) return "COMPLIANT";
  if (/(niet getoetst|nog toetsen|onbekend|open|^\?$)/.test(v)) return "NOT_ASSESSED";
  return null;
}

/** Categorie op trefwoorden; onbekend → OTHER. */
export function parseCategory(value: unknown): LegalCategory {
  const v = norm(String(value ?? ""));
  if (/(milieu|omgeving|bodem|water|lucht|afval|geluid|natuur|emissie|bal\b|activiteitenbesluit)/.test(v)) return "ENVIRONMENT";
  if (/(arbo|veilig|gezondheid|vca|scl|asbest|brandveilig)/.test(v)) return "HEALTH_SAFETY";
  if (/(energie|co2|klimaat)/.test(v)) return "ENERGY_CO2";
  if (/(product|brl|bouwstof|kwaliteit|ce markering)/.test(v)) return "PRODUCT";
  if (/(bouw|bbl|bouwbesluit)/.test(v)) return "BUILDING";
  return "OTHER";
}

/**
 * Datum uit een cel: Date, Excel-serienummer, of tekst (dd-mm-jjjj, d-m-jj, dd/mm/jjjj, jjjj-mm-dd).
 * Geeft 'jjjj-mm-dd' terug, of `null` als leeg/ongeldig (`invalid` = true bij onleesbare waarde).
 */
export function parseDateCell(value: unknown): { iso: string | null; invalid: boolean } {
  if (value === null || value === undefined || String(value).trim() === "") return { iso: null, invalid: false };
  const ok = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1900 || y > 2200) return { iso: null, invalid: true };
    return { iso: dt.toISOString().slice(0, 10), invalid: false };
  };
  if (value instanceof Date)
    return isNaN(value.getTime()) ? { iso: null, invalid: true } : ok(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  if (typeof value === "number") {
    if (value > 20000 && value < 90000) {
      // Excel-serienummer (dagen sinds 30-12-1899)
      const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
      return ok(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
    return { iso: null, invalid: true };
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return ok(y, +m[2], +m[1]);
  }
  return { iso: null, invalid: true };
}

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/** Eén geïmporteerde regel zoals die naar de server gaat (alle waarden als tekst). */
export type ImportRow = Partial<Record<ImportFieldKey, string>> & { rowNumber: number };

/** Bouw importregels uit de ruwe rijen op basis van de koppeling; datums al genormaliseerd naar jjjj-mm-dd. */
export function buildRows(rows: unknown[][], headerRow: number, mapping: Mapping): { rows: ImportRow[]; warnings: string[] } {
  const out: ImportRow[] = [];
  const warnings: string[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const raw = rows[i];
    const row: ImportRow = { rowNumber: i + 1 };
    for (const f of IMPORT_FIELDS) {
      const col = mapping[f.key];
      if (col === undefined) continue;
      const value = raw[col];
      if (f.key === "lastReviewDate" || f.key === "nextReviewDate") {
        const d = parseDateCell(value);
        if (d.invalid) warnings.push(`Rij ${i + 1}: datum "${cellText(value)}" (${f.label}) niet herkend — overgeslagen`);
        if (d.iso) row[f.key] = d.iso;
      } else {
        const t = cellText(value);
        if (t) row[f.key] = t;
      }
    }
    if (Object.keys(row).length === 1) continue; // lege rij
    if (!row.title) {
      warnings.push(`Rij ${i + 1}: geen wet/regeling — overgeslagen`);
      continue;
    }
    if (mapping.status !== undefined && row.status && parseStatus(row.status) === null) {
      warnings.push(`Rij ${i + 1}: status "${row.status}" niet herkend — wordt "nog niet getoetst"`);
    }
    out.push(row);
  }
  return { rows: out, warnings };
}
