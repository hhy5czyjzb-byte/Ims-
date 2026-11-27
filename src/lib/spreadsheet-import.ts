/**
 * Algemene import van registers uit Excel of CSV ("kolommen koppelen").
 * Pure functies: draaien in de browser (voorbeeld) én op de server. Geen Node- of DOM-afhankelijkheden.
 * Module-specifieke velden en herkenning staan in o.a. legal-import.ts en aspect-import.ts.
 */

export type FieldKind = "text" | "date" | "int" | "decimal" | "period";

/** Hoe de wizard een waarde in het voorbeeld toont (vertaling naar de waarde die wordt opgeslagen). */
export type PreviewKind = "legalStatus" | "aspectSituation" | "aspectType" | "yesNo" | "legalCategory" | "period" | "decimal";

export type ImportField = { key: string; label: string; required?: boolean; hints: string[]; kind?: FieldKind; preview?: PreviewKind };

export type Mapping = Record<string, number>; // veld → kolomindex

/** Eén regel zoals die naar de server gaat; alle waarden als tekst (datums als jjjj-mm-dd). */
export type ImportRow = { rowNumber: number } & { [key: string]: string | number };

export type ImportResult = { error?: string; created?: number; updated?: number; skipped?: number; warnings?: string[] };

export const normText = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Stel per veld een kolom voor op basis van de kopteksten. Elke kolom wordt hooguit één keer gebruikt. */
export function suggestMapping(headers: string[], fields: ImportField[]): Mapping {
  const scored: { key: string; col: number; score: number }[] = [];
  headers.forEach((h, col) => {
    const hn = normText(h ?? "");
    if (!hn) return;
    const words = hn.split(" ");
    for (const f of fields) {
      let best = 0;
      for (const hint of f.hints) {
        const hi = normText(hint);
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

/** Geheel getal uit een cel (ook "3,0" of 3.0); `invalid` bij tekst die geen getal is. */
export function parseIntCell(value: unknown): { value: number | null; invalid: boolean } {
  if (value === null || value === undefined || String(value).trim() === "") return { value: null, invalid: false };
  const n = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(n) || Math.round(n) !== n) return { value: null, invalid: true };
  return { value: n, invalid: false };
}

/** Ja/nee uit vrije tekst; `null` = niet herkend of leeg. */
export function parseYesNo(value: unknown): boolean | null {
  const v = normText(String(value ?? ""));
  if (!v) return null;
  if (/^(ja|j|yes|y|x|v|waar|true|1|significant|s)$/.test(v)) return true;
  if (/^(nee|n|no|niet|onwaar|false|0|niet significant|ns)$/.test(v)) return false;
  return null;
}

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/** Bouw importregels uit de ruwe rijen op basis van de koppeling; datums en getallen genormaliseerd. */
export function buildRows(rows: unknown[][], headerRow: number, mapping: Mapping, fields: ImportField[]): { rows: ImportRow[]; warnings: string[] } {
  const out: ImportRow[] = [];
  const warnings: string[] = [];
  const required = fields.filter((f) => f.required);
  for (let i = headerRow + 1; i < rows.length; i++) {
    const raw = rows[i];
    const row: ImportRow = { rowNumber: i + 1 };
    for (const f of fields) {
      const col = mapping[f.key];
      if (col === undefined) continue;
      const value = raw[col];
      if (f.kind === "date") {
        const d = parseDateCell(value);
        if (d.invalid) warnings.push(`Rij ${i + 1}: datum "${cellText(value)}" (${f.label}) niet herkend — overgeslagen`);
        if (d.iso) row[f.key] = d.iso;
      } else if (f.kind === "int") {
        const n = parseIntCell(value);
        if (n.invalid) warnings.push(`Rij ${i + 1}: "${cellText(value)}" (${f.label}) is geen getal — overgeslagen`);
        if (n.value !== null) row[f.key] = String(n.value);
      } else if (f.kind === "decimal") {
        // Getallen uit Excel exact doorgeven (met decimale komma), tekst ongewijzigd; de server leest beide met parseDecimal.
        if (typeof value === "number" && Number.isFinite(value)) row[f.key] = String(value).replace(".", ",");
        else {
          const t = cellText(value);
          if (t) row[f.key] = t;
        }
      } else if (f.kind === "period") {
        // Een Excel-datum op de 1e van de maand (bijv. weergegeven als "mrt-26") staat voor die hele maand.
        if (value instanceof Date && !isNaN(value.getTime()))
          row[f.key] = value.getUTCDate() === 1 ? value.toISOString().slice(0, 7) : value.toISOString().slice(0, 10);
        else {
          const t = cellText(value);
          if (t) row[f.key] = t;
        }
      } else {
        const t = cellText(value);
        if (t) row[f.key] = t;
      }
    }
    if (Object.keys(row).length === 1) continue; // lege rij
    const missing = required.find((f) => !row[f.key]);
    if (missing) {
      warnings.push(`Rij ${i + 1}: geen ${missing.label.toLowerCase()} — overgeslagen`);
      continue;
    }
    out.push(row);
  }
  return { rows: out, warnings };
}
