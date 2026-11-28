"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Twee tabbladen zoals in het CO2-dashboard: "Plan van aanpak" en "PVA - berekening doelstelling". */
export function PlanTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/co2/plan", label: "Plan van aanpak" },
    { href: "/co2/plan/berekening", label: "Berekening doelstelling" },
  ];
  return (
    <nav className="mb-5 flex gap-1 print:hidden" aria-label="Plan van aanpak">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm no-underline hover:no-underline ${active ? "bg-neutral-800 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
