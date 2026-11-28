"use client";

import { useState } from "react";

/** Afdrukken of opslaan als PDF via de browser (menu, navigatie en knoppen worden verborgen). */
export function PrintButton({ label = "Afdrukken / PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary print:hidden">
      {label}
    </button>
  );
}

/**
 * Uitdraai van de pagina: PDF (afdrukken), Excel of Word, steeds met het logo van Rouwmaat Groep.
 * Excel en Word worden in de browser gemaakt uit de getoonde koppen, tekst en tabellen.
 */
export function ExportButtons() {
  const [busy, setBusy] = useState<"xlsx" | "docx" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "xlsx" | "docx") {
    setError(null);
    const main = document.querySelector("main");
    if (!main) return;
    if (document.querySelector('nav[aria-label="Pagina\'s"]') && !location.search.includes("pagina=alle")) {
      if (
        !confirm(
          "Deze lijst staat verdeeld over pagina's; alleen de getoonde regels worden meegenomen. Kies eerst 'Alles tonen' voor de volledige lijst.\n\nToch doorgaan?",
        )
      )
        return;
    }
    setBusy(kind);
    try {
      const { collectBlocks, pageTitle, fileName, download, loadLogo, blocksToSheets } = await import("@/lib/page-export");
      const title = pageTitle(main);
      const who = main.getAttribute("data-user-name");
      const when = new Date().toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Amsterdam" });
      const subtitle = `Rouwmaat Groep · Integraal managementsysteem · uitgedraaid op ${when}${who ? ` door ${who}` : ""}`;
      const blocks = collectBlocks(main);
      const logo = await loadLogo("/brand/logo-kleur.png");
      if (kind === "xlsx") {
        const { buildXlsx } = await import("@/lib/xlsx-writer");
        const bytes = await buildXlsx(blocksToSheets(title, subtitle, blocks), logo);
        download(bytes, fileName(title, "xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      } else {
        const { buildDocx } = await import("@/lib/page-docx");
        const blob = await buildDocx({ title, subtitle, blocks, logo });
        download(blob, fileName(title, "docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      }
    } catch (e) {
      console.error("[uitdraai]", e);
      setError("Uitdraai maken is mislukt.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden" role="group" aria-label="Uitdraai">
      <PrintButton />
      <button
        type="button"
        onClick={() => run("xlsx")}
        disabled={busy !== null}
        className="btn-secondary"
        title="Tabellen van deze pagina als Excel-bestand, met logo"
      >
        {busy === "xlsx" ? "Bezig…" : "Excel"}
      </button>
      <button type="button" onClick={() => run("docx")} disabled={busy !== null} className="btn-secondary" title="Deze pagina als Word-document, met logo">
        {busy === "docx" ? "Bezig…" : "Word"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-brand-red">
          {error}
        </span>
      )}
    </div>
  );
}
