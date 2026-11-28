"use client";

/** Afdrukken of opslaan als PDF via de browser (menu, navigatie en knoppen worden verborgen). */
export function PrintButton({ label = "Afdrukken / PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary print:hidden">
      {label}
    </button>
  );
}
