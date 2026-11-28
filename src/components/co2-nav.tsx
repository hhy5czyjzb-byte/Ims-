"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/co2", label: "Footprint" },
  { href: "/co2/inventaris", label: "Emissie-inventaris" },
  { href: "/co2/voortgang", label: "Voortgang" },
  { href: "/co2/energie", label: "Energie" },
  { href: "/co2/plan", label: "Plan van aanpak" },
  { href: "/co2/doelstellingen", label: "Doelstellingen" },
  { href: "/co2/verbruik", label: "Verbruik" },
  { href: "/co2/dkmp", label: "DKMP" },
  { href: "/co2/factoren", label: "Emissiefactoren" },
  { href: "/co2/instellingen", label: "Instellingen" },
  { href: "/co2/materieel", label: "Materieel" },
  { href: "/co2/dashboard-import", label: "Inlezen" },
];

/** Tabbladen binnen de CO2-module. */
export function Co2Nav() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/co2" ? pathname === "/co2" : pathname.startsWith(href));
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-neutral-200" aria-label="CO2-module">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm no-underline hover:no-underline ${
            active(t.href) ? "border-brand-red font-medium text-brand-red-dark" : "border-transparent text-neutral-600 hover:text-neutral-900"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
