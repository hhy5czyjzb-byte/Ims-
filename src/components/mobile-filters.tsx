"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

const NOT_FILTERS = new Set(["pagina", "tab", "groep", "wijzig", "invoer"]);

/**
 * Filters boven een lijst. Op een breed scherm altijd zichtbaar; op een telefoon achter de knop
 * "Filters" (met het aantal actieve filters), zodat de lijst zelf direct in beeld is.
 */
export function Filters({ children }: { children: ReactNode }) {
  const sp = useSearchParams();
  const active = [...sp.entries()].filter(([k, v]) => v && !NOT_FILTERS.has(k)).length;
  const [open, setOpen] = useState(false);
  return (
    <div className="print:hidden">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="btn-secondary mb-3 w-full justify-between md:hidden">
        <span>Filters{active ? ` (${active} actief)` : ""}</span>
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      <div className={open ? "" : "max-md:hidden"}>{children}</div>
    </div>
  );
}
