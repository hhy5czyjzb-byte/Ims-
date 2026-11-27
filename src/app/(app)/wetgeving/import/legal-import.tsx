"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { buildRows, cellText, findHeaderRow, IMPORT_FIELDS, parseCsv, parseStatus, suggestMapping, type Mapping } from "@/lib/legal-import";
import { COMPLIANCE_STATUS_LABEL } from "@/lib/labels";
import { importLegal, type ImportResult } from "../actions";

type Sheet = { name: string; rows: unknown[][] };

const MAX_FILE_MB = 10;
const EMPTY: unknown[][] = [];

export function LegalImport() {
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
  const built = useMemo(() => (rows.length ? buildRows(rows, headerRow, mapping) : { rows: [], warnings: [] }), [rows, headerRow, mapping]);

  function selectSheet(list: Sheet[], index: number) {
    setSheets(list);
    setSheetIndex(index);
    const hr = findHeaderRow(list[index]?.rows ?? []);
    setHeaderRow(hr);
    setMapping(suggestMapping((list[index]?.rows[hr] ?? []).map(cellText)));
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
        // Kies het tabblad met de meeste rijen als startpunt.
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
    startTransition(async () => {
      const res = await importLegal(built.rows, { updateExisting });
      setResult(res);
    });
  }

  const mappedCount = Object.keys(mapping).length;
  const titleMapped = mapping.title !== undefined;

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
                  setMapping(suggestMapping((rows[hr] ?? []).map(cellText)));
                }}
                className="input w-24"
              />
            </label>
            <span className="text-xs text-neutral-500">{mappedCount} velden gekoppeld (automatisch voorgesteld op basis van de kolomkoppen)</span>
          </div>
          <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
            {IMPORT_FIELDS.map((f) => {
              const col = mapping[f.key];
              const sample =
                col !== undefined
                  ? rows
                      .slice(headerRow + 1)
                      .map((r) => cellText(r[col]))
                      .find((v) => v)
                  : undefined;
              return (
                <label key={f.key} className="grid grid-cols-[12rem_1fr] items-center gap-2 text-sm">
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
          {!titleMapped ? (
            <p className="text-sm text-brand-red-dark">Koppel minstens de kolom &quot;Wet / regeling&quot;.</p>
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
                      {IMPORT_FIELDS.filter((f) => mapping[f.key] !== undefined).map((f) => (
                        <th key={f.key}>{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {built.rows.slice(0, 8).map((r) => (
                      <tr key={r.rowNumber}>
                        <td className="text-neutral-500">{r.rowNumber}</td>
                        {IMPORT_FIELDS.filter((f) => mapping[f.key] !== undefined).map((f) => (
                          <td key={f.key} className="max-w-64 truncate" title={r[f.key]}>
                            {f.key === "status" ? (
                              <>
                                {r.status ?? ""}
                                <span className="block text-xs text-neutral-500">→ {COMPLIANCE_STATUS_LABEL[parseStatus(r.status) ?? "NOT_ASSESSED"]}</span>
                              </>
                            ) : (
                              (r[f.key] ?? "")
                            )}
                          </td>
                        ))}
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
                  Bestaande eisen bijwerken
                  <span className="block text-xs text-neutral-500">
                    Herkend op kenmerk, of anders op wet + artikel. Lege cellen wissen geen bestaande gegevens.
                  </span>
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
                  overgeslagen. <Link href="/wetgeving">Naar het register →</Link>
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
