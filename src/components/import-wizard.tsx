"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  buildRows,
  cellText,
  findHeaderRow,
  parseCsv,
  parseYesNo,
  suggestMapping,
  type ImportField,
  type ImportResult,
  type ImportRow,
  type Mapping,
  type PreviewKind,
} from "@/lib/spreadsheet-import";
import { parseApplicability, parseCategory, parseImpact, parseImplementationStatus, parseStatus } from "@/lib/legal-import";
import { parseRiskType, parseTreatmentStatus } from "@/lib/risk-import";
import { parseOpportunity, parsePriority, parseSituation } from "@/lib/aspect-import";
import { parseDecimal, parsePeriod, formatQuantity } from "@/lib/co2";
import { formatDate } from "@/lib/format";
import {
  APPLICABILITY_LABEL,
  ASPECT_PRIORITY_LABEL,
  COMPLIANCE_STATUS_LABEL,
  IMPACT_LEVEL_LABEL,
  IMPLEMENTATION_STATUS_LABEL,
  LEGAL_CATEGORY_LABEL,
  RISK_TYPE_LABEL,
  SITUATION_LABEL,
  TREATMENT_STATUS_LABEL,
} from "@/lib/labels";

type Sheet = { name: string; rows: unknown[][] };
const MAX_FILE_MB = 10;
const EMPTY: unknown[][] = [];

/** Hoe een waarde wordt opgeslagen (voor het voorbeeld). `null` = niet herkend. */
const PREVIEW: Record<PreviewKind, (raw: string, row: ImportRow) => string | null> = {
  legalStatus: (raw) => {
    const s = parseStatus(raw);
    return s ? COMPLIANCE_STATUS_LABEL[s] : null;
  },
  legalCategory: (raw) => LEGAL_CATEGORY_LABEL[parseCategory(raw)],
  aspectSituation: (raw) => {
    const s = parseSituation(raw);
    return s ? SITUATION_LABEL[s] : null;
  },
  aspectPriority: (raw) => {
    const p = parsePriority(raw);
    return p === undefined ? null : p === null ? "geen prio" : ASPECT_PRIORITY_LABEL[p];
  },
  opportunity: (raw) => {
    const o = parseOpportunity(raw);
    return o === undefined ? null : o ? "Kans" : "Bedreiging";
  },
  period: (raw) => {
    const p = parsePeriod(raw);
    return p ? (p.start === p.end ? formatDate(p.start) : `${formatDate(p.start)} t/m ${formatDate(p.end)}`) : null;
  },
  decimal: (raw) => {
    const n = parseDecimal(raw);
    return n.value === null ? null : formatQuantity(n.value);
  },
  riskType: (raw, row) => RISK_TYPE_LABEL[parseRiskType(raw, row.externalRef)],
  treatmentStatus: (raw) => {
    const t = parseTreatmentStatus(raw);
    return t ? TREATMENT_STATUS_LABEL[t] : null;
  },
  applicability: (raw) => {
    const a = parseApplicability(raw);
    return a ? APPLICABILITY_LABEL[a] : null;
  },
  implementationStatus: (raw) => {
    const i = parseImplementationStatus(raw);
    return i ? IMPLEMENTATION_STATUS_LABEL[i] : null;
  },
  impactLevel: (raw) => {
    const i = parseImpact(raw);
    return i ? IMPACT_LEVEL_LABEL[i] : null;
  },
  yesNo: (raw) => {
    const b = parseYesNo(raw);
    return b === null ? null : b ? "Ja" : "Nee";
  },
};

/**
 * Algemene importwizard voor registers (Excel .xlsx of CSV) met kolommen koppelen.
 * Het bestand wordt in de browser gelezen; alleen de gekoppelde kolommen gaan naar de server-actie.
 */
export function ImportWizard({
  fields,
  importAction,
  registerHref,
  matchHint,
}: {
  fields: ImportField[];
  importAction: (rows: ImportRow[], options: { updateExisting: boolean }) => Promise<ImportResult>;
  registerHref: string;
  matchHint: string;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [updateExisting, setUpdateExisting] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  const rows = useMemo(() => sheets[sheetIndex]?.rows ?? EMPTY, [sheets, sheetIndex]);
  const headers = useMemo(() => (rows[headerRow] ?? []).map((c, i) => cellText(c) || `Kolom ${i + 1}`), [rows, headerRow]);
  const built = useMemo(() => {
    if (!rows.length) return { rows: [] as ImportRow[], warnings: [] as string[] };
    const b = buildRows(rows, headerRow, mapping, fields);
    // Waarden die niet herkend worden (status, situatie, ja/nee) melden vóór de import.
    for (const r of b.rows) {
      for (const f of fields) {
        const raw = r[f.key];
        if (!f.preview || mapping[f.key] === undefined || raw === undefined) continue;
        if (PREVIEW[f.preview](String(raw), r) === null)
          b.warnings.push(`Rij ${r.rowNumber}: "${raw}" (${f.label}) niet herkend — wordt overgeslagen of standaardwaarde`);
      }
    }
    return b;
  }, [rows, headerRow, mapping, fields]);

  function selectSheet(list: Sheet[], index: number) {
    setSheets(list);
    setSheetIndex(index);
    const hr = findHeaderRow(list[index]?.rows ?? []);
    setHeaderRow(hr);
    setMapping(suggestMapping((list[index]?.rows[hr] ?? []).map(cellText), fields));
  }

  async function onFile(file: File | undefined) {
    setReadError(null);
    setResult(null);
    setSheets([]);
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setReadError(`Bestand is groter dan ${MAX_FILE_MB} MB.`);
      return;
    }
    setFileName(file.name);
    try {
      if (/\.csv$/i.test(file.name)) {
        selectSheet([{ name: file.name, rows: parseCsv(await file.text()) }], 0);
      } else if (/\.xlsx$/i.test(file.name)) {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const result = await readXlsxFile(file);
        const list = result.map((s) => ({ name: s.sheet, rows: s.data as unknown[][] })).filter((s) => s.rows.length > 0);
        if (!list.length) throw new Error("leeg");
        const best = list.reduce((bi, s, i) => (s.rows.length > list[bi].rows.length ? i : bi), 0);
        selectSheet(list, best);
      } else {
        setReadError("Kies een Excel-bestand (.xlsx) of CSV-bestand. Oude .xls-bestanden eerst opslaan als .xlsx.");
      }
    } catch {
      setReadError("Het bestand kon niet worden gelezen. Controleer of het een geldig .xlsx- of .csv-bestand is.");
    }
  }

  function runImport() {
    setResult(null);
    startTransition(async () => setResult(await importAction(built.rows, { updateExisting })));
  }

  const requiredMissing = fields.filter((f) => f.required && mapping[f.key] === undefined);
  const mappedFields = fields.filter((f) => mapping[f.key] !== undefined);

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="mb-2">1. Bestand kiezen</h2>
        <p className="mb-3 text-sm text-neutral-600">
          Kies het bestaande register (.xlsx of .csv). Het bestand wordt in je browser gelezen; alleen de gekoppelde kolommen worden opgeslagen.
        </p>
        <input type="file" accept=".xlsx,.csv" onChange={(e) => onFile(e.target.files?.[0])} className="block text-sm" aria-label="Bestand" />
        {readError && (
          <p role="alert" className="mt-2 text-sm text-brand-red-dark">
            {readError}
          </p>
        )}
      </section>

      {rows.length > 0 && (
        <section className="card">
          <h2 className="mb-3">2. Kolommen koppelen</h2>
          <div className="mb-4 flex flex-wrap items-end gap-4 text-sm">
            <span className="text-neutral-600">{fileName}</span>
            {sheets.length > 1 && (
              <label>
                <span className="label">Tabblad</span>
                <select className="input" value={sheetIndex} onChange={(e) => selectSheet(sheets, Number(e.target.value))}>
                  {sheets.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name} ({s.rows.length} rijen)
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span className="label">Kopregel staat op rij</span>
              <input
                type="number"
                min={1}
                max={rows.length}
                value={headerRow + 1}
                onChange={(e) => {
                  const hr = Math.max(0, Math.min(rows.length - 1, Number(e.target.value) - 1));
                  setHeaderRow(hr);
                  setMapping(suggestMapping((rows[hr] ?? []).map(cellText), fields));
                }}
                className="input w-24"
              />
            </label>
            <span className="text-xs text-neutral-500">{mappedFields.length} velden gekoppeld (automatisch voorgesteld op basis van de kolomkoppen)</span>
          </div>
          <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
            {fields.map((f) => {
              const col = mapping[f.key];
              const sample =
                col !== undefined
                  ? rows
                      .slice(headerRow + 1)
                      .map((r) => cellText(r[col]))
                      .find((v) => v)
                  : undefined;
              return (
                <label key={f.key} className="grid grid-cols-[13rem_1fr] items-center gap-2 text-sm">
                  <span>
                    {f.label}
                    {f.required && <span className="text-brand-red"> *</span>}
                  </span>
                  <span>
                    <select
                      className="input py-1.5"
                      value={col ?? ""}
                      onChange={(e) =>
                        setMapping((m) => {
                          const next = { ...m };
                          if (e.target.value === "") delete next[f.key];
                          else next[f.key] = Number(e.target.value);
                          return next;
                        })
                      }
                      aria-label={`Kolom voor ${f.label}`}
                    >
                      <option value="">— niet importeren —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                    {sample && <span className="mt-0.5 block truncate text-xs text-neutral-500">bijv. {sample}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <section className="card">
          <h2 className="mb-2">3. Controleren en importeren</h2>
          {requiredMissing.length > 0 ? (
            <p className="text-sm text-brand-red-dark">Koppel eerst de verplichte kolom(men): {requiredMissing.map((f) => f.label).join(", ")}.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-neutral-600">
                {built.rows.length} regels klaar om te importeren
                {built.warnings.length > 0 && <>, {built.warnings.length} waarschuwing(en)</>}. Voorbeeld van de eerste regels:
              </p>
              <div className="mb-3 overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Rij</th>
                      {mappedFields.map((f) => (
                        <th key={f.key}>{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {built.rows.slice(0, 8).map((r) => (
                      <tr key={r.rowNumber}>
                        <td className="text-neutral-500">{r.rowNumber}</td>
                        {mappedFields.map((f) => {
                          const raw = r[f.key] !== undefined ? String(r[f.key]) : "";
                          const shown = f.preview && raw ? PREVIEW[f.preview](raw, r) : null;
                          return (
                            <td key={f.key} className="max-w-64 truncate" title={raw}>
                              {raw}
                              {f.preview && raw && (
                                <span className={`block text-xs ${shown ? "text-neutral-500" : "text-amber-700"}`}>→ {shown ?? "niet herkend"}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {built.warnings.length > 0 && (
                <details className="mb-3 text-sm">
                  <summary className="cursor-pointer text-amber-800">Waarschuwingen ({built.warnings.length})</summary>
                  <ul className="mt-1 max-h-48 list-inside list-disc overflow-y-auto text-xs text-neutral-700">
                    {built.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}
              <label className="mb-3 flex items-start gap-2 text-sm">
                <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} className="mt-1" />
                <span>
                  Bestaande regels bijwerken
                  <span className="block text-xs text-neutral-500">{matchHint} Lege cellen wissen geen bestaande gegevens.</span>
                </span>
              </label>
              <button type="button" className="btn" disabled={pending || built.rows.length === 0} onClick={runImport}>
                {pending ? "Bezig met importeren…" : `${built.rows.length} regels importeren`}
              </button>
            </>
          )}
          {result && (
            <div
              role="status"
              className={`mt-4 rounded-md border px-3 py-2 text-sm ${result.error ? "border-brand-red/30 bg-red-50 text-brand-red-dark" : "border-green-200 bg-green-50 text-green-900"}`}
            >
              {result.error ?? (
                <>
                  Import klaar: <strong>{result.created}</strong> nieuw, <strong>{result.updated}</strong> bijgewerkt, <strong>{result.skipped}</strong>{" "}
                  overgeslagen. <Link href={registerHref}>Naar het register →</Link>
                  {result.warnings && result.warnings.length > 0 && (
                    <ul className="mt-2 max-h-48 list-inside list-disc overflow-y-auto text-xs text-neutral-700">
                      {result.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
