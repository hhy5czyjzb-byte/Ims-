"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { importCo2Data, importCo2Dkmp, importCo2Measures, importCo2Setup } from "@/app/(app)/co2/dashboard-actions";
import { parseCo2Workbook, type Rows } from "@/lib/co2-workbook";

type Parsed = ReturnType<typeof parseCo2Workbook>;
type Part = "setup" | "data" | "dkmp" | "plan";

/** CO2-dashboard (Excel) in één keer inlezen: emissiefactoren, verbruik en KPI's, DKMP en plan van aanpak. */
export function Co2WorkbookImport() {
  const router = useRouter();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileName, setFileName] = useState("");
  const [parts, setParts] = useState<Record<Part, boolean>>({ setup: true, data: true, dkmp: true, plan: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelMissing, setCancelMissing] = useState(true);
  const [log, setLog] = useState<{ part: string; ok: boolean; text: string; warnings?: string[] }[]>([]);

  async function onFile(f: File | undefined) {
    setError(null);
    setParsed(null);
    setLog([]);
    if (!f) return;
    setFileName(f.name);
    setBusy("Werkmap lezen…");
    try {
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const sheets = await readXlsxFile(f);
      const map: Record<string, Rows> = Object.fromEntries(sheets.map((s) => [s.sheet, s.data as unknown as Rows]));
      setParsed(parseCo2Workbook(map));
    } catch (e) {
      console.error(e);
      setError("Deze werkmap kon niet worden gelezen. Is het een .xlsx-bestand?");
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    if (!parsed) return;
    setError(null);
    const out: typeof log = [];
    const step = async (part: Part, label: string, fn: () => Promise<{ error?: string; summary?: string; warnings?: string[] }>) => {
      if (!parts[part]) return true;
      setBusy(`${label}…`);
      const r = await fn();
      out.push({ part: label, ok: !r.error, text: r.error ?? r.summary ?? "Klaar", warnings: r.warnings });
      setLog([...out]);
      return !r.error;
    };
    // Volgorde: eerst factoren en energiedragers, dan verbruik (koppelt op naam), dan DKMP en plan van aanpak.
    if (parsed.factors)
      if (
        !(await step("setup", "Emissiefactoren en energiedragers", () =>
          importCo2Setup({ organisations: parsed.factors!.organisations, factors: parsed.factors!.factors, energy: parsed.factors!.energy }),
        ))
      )
        return setBusy(null);
    if (parsed.data) await step("data", "Verbruik en kengetallen", () => importCo2Data({ consumptions: parsed.selected, kpis: parsed.kpis }));
    if (parsed.dkmp) await step("dkmp", "DKMP", () => importCo2Dkmp(parsed.dkmp!.items));
    if (parsed.measures.length)
      await step("plan", "Plan van aanpak", () => importCo2Measures({ measures: parsed.measures, pva: parsed.pva, pvaDoc: parsed.pvaDoc, cancelMissing }));
    setBusy(null);
    router.refresh();
  }

  const years = parsed ? [...new Set(parsed.selected.map((c) => c.year))].sort() : [];
  const halfYears = parsed ? [...new Set(parsed.selected.filter((c) => c.footprintType === "Half jaar").map((c) => c.year))] : [];
  const Row = ({ part, title, detail, available }: { part: Part; title: string; detail: string; available: boolean }) => (
    <label className={`flex items-start gap-3 rounded border p-3 ${available ? "border-neutral-200" : "border-dashed border-neutral-200 text-neutral-400"}`}>
      <input
        type="checkbox"
        className="mt-1"
        checked={available && parts[part]}
        disabled={!available || !!busy}
        onChange={(e) => setParts({ ...parts, [part]: e.target.checked })}
      />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-neutral-600">{available ? detail : "Tabblad niet gevonden"}</span>
      </span>
    </label>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div className="card space-y-3">
        <label className="block">
          <span className="label">CO2-dashboard (.xlsx)</span>
          <input type="file" accept=".xlsx" className="input" disabled={!!busy} onChange={(e) => onFile(e.target.files?.[0])} />
          <span className="mt-1 block text-xs text-neutral-500">Het bestand wordt in je browser gelezen; alleen de gevonden gegevens gaan naar de app.</span>
        </label>
        {error && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        {busy && <p className="text-sm text-neutral-600">{busy}</p>}
      </div>

      {parsed && (
        <div className="card space-y-3">
          <h2>Gevonden in {fileName}</h2>
          <Row
            part="setup"
            title="Emissiefactoren, energiedragers en organisaties"
            available={!!parsed.factors}
            detail={`${parsed.factors?.factors.length ?? 0} factoren (WTT/TTW/WTW per jaar), ${parsed.factors?.energy.length ?? 0} GJ-conversies, organisaties: ${parsed.factors?.organisations.map((o) => `${o.name} (${o.boundaryPct}%)`).join(", ")}`}
          />
          <Row
            part="data"
            title="Verbruik en kengetallen (Data scope 1&2)"
            available={!!parsed.data}
            detail={`${parsed.selected.length} verbruiksregels over ${years[0] ?? "?"}–${years[years.length - 1] ?? "?"} (per jaar 'heel jaar'; ${halfYears.length ? `alleen halfjaar voor ${halfYears.join(", ")}` : "geen losse halfjaren"}), ${parsed.kpis.length} kengetallen (FTE, omzet). Eerder ingelezen dashboardregels in deze jaren worden vervangen.`}
          />
          <Row
            part="dkmp"
            title="DKMP (datakwaliteitsmanagementplan)"
            available={!!parsed.dkmp}
            detail={`${parsed.dkmp?.items.length ?? 0} emissiestromen met bron, uitvoerder, onzekerheden en verbeterplan`}
          />
          <Row
            part="plan"
            title="Plan van aanpak → maatregelen (acties)"
            available={parsed.measures.length > 0}
            detail={`${parsed.measures.length} maatregelen met alle kolommen en de volgorde uit het plan van aanpak${parsed.pva?.targetText ? `; doelstelling: ${parsed.pva.targetText}` : ""}. Reductiepercentages en de doelstelling per scope uit 'PVA - berekening doelstelling'.`}
          />
          {parsed.measures.length > 0 && (
            <label className="ml-8 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={cancelMissing} disabled={!!busy} onChange={(e) => setCancelMissing(e.target.checked)} />
              <span>
                Maatregelen die niet meer in het plan van aanpak staan laten vervallen
                <span className="block text-xs text-neutral-500">Ze blijven als historie bewaard in de actielijst (status &lsquo;vervallen&rsquo;).</span>
              </span>
            </label>
          )}
          {(parsed.factors?.warnings.length ?? 0) + (parsed.data?.warnings.length ?? 0) > 0 && (
            <details className="text-sm text-neutral-600">
              <summary className="cursor-pointer">
                Opmerkingen bij het lezen ({(parsed.factors?.warnings.length ?? 0) + (parsed.data?.warnings.length ?? 0)})
              </summary>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {[...(parsed.factors?.warnings ?? []), ...(parsed.data?.warnings ?? [])].slice(0, 40).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          <button type="button" className="btn" disabled={!!busy || !Object.values(parts).some(Boolean)} onClick={run}>
            {busy ? "Bezig…" : "Inlezen"}
          </button>
        </div>
      )}

      {log.length > 0 && (
        <div className="card space-y-2">
          <h2>Resultaat</h2>
          {log.map((l, i) => (
            <div key={i} className={`rounded px-3 py-2 text-sm ${l.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-800"}`}>
              <b>{l.part}:</b> {l.text}
              {l.warnings && l.warnings.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {l.warnings.slice(0, 20).map((w, j) => (
                    <li key={j}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {!busy && (
            <p className="text-sm">
              Bekijk het resultaat bij <Link href="/co2/inventaris">Emissie-inventaris</Link>, <Link href="/co2/plan">Plan van aanpak</Link> en{" "}
              <Link href="/co2/dkmp">DKMP</Link>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
