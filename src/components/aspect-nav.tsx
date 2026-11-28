"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/milieuaspecten", label: "Register" },
  { href: "/milieuaspecten/overzicht", label: "Overzicht" },
];

/** Tabbladen binnen de milieuaspecten. */
export function AspectNav() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/milieuaspecten" ? pathname === href : pathname.startsWith(href));
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-neutral-200" aria-label="Milieuaspecten">
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
