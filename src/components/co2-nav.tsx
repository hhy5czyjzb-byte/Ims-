"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/co2", label: "Footprint" },
  { href: "/co2/inventaris", label: "Emissie-inventaris" },
  { href: "/co2/voortgang", label: "Voortgang" },
  { href: "/co2/energie", label: "Energie" },
  { href: "/co2/wagenpark", label: "Wagenpark" },
  { href: "/co2/plan", label: "Plan van aanpak" },
  { href: "/co2/doelstellingen", label: "Doelstellingen" },
  { href: "/co2/rapportage", label: "Jaarverslag" },
  // Gegevens en beheer
  { href: "/co2/verbruik", label: "Verbruik", data: true },
  { href: "/co2/materieel", label: "Voertuigen", data: true },
  { href: "/co2/factoren", label: "Emissiefactoren", data: true },
  { href: "/co2/dkmp", label: "DKMP", data: true },
  { href: "/co2/instellingen", label: "Instellingen", data: true },
  { href: "/co2/logboek", label: "Logboek", data: true },
  { href: "/co2/dashboard-import", label: "Inlezen", data: true },
];

/** Tabbladen binnen de CO2-module. */
export function Co2Nav() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/co2" ? pathname === "/co2" : pathname.startsWith(href));
  return (
    <nav className="tabs mb-6 flex gap-1 border-b border-neutral-200" aria-label="CO2-module">
      {TABS.map((t, i) => (
        <span key={t.href} className="contents">
          {t.data && !TABS[i - 1]?.data && <span className="mx-2 my-2 w-px self-stretch bg-neutral-200" aria-hidden />}
          <Link
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm no-underline hover:no-underline ${
              active(t.href)
                ? "border-brand-red font-medium text-brand-red-dark"
                : `border-transparent ${t.data ? "text-neutral-500" : "text-neutral-600"} hover:text-neutral-900`
            }`}
          >
            {t.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
