"use client";

import { useEffect, useState } from "react";

const fmt = () => new Date().toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Amsterdam" });

/** Datum en tijd van afdrukken (bijgewerkt vlak voor het afdrukken, niet het moment van laden). */
export function PrintDate() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    setNow(fmt());
    const update = () => setNow(fmt());
    window.addEventListener("beforeprint", update);
    return () => window.removeEventListener("beforeprint", update);
  }, []);
  return <span suppressHydrationWarning>{now}</span>;
}
