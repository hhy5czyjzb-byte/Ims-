"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/wetgeving", label: "Register" },
  { href: "/wetgeving/vestigingen", label: "Compliance-audit per vestiging" },
  { href: "/wetgeving/vestigingen/vragen", label: "Auditvragen" },
];

/** Tabbladen binnen wet- en regelgeving. */
export function LegalNav() {
  const pathname = usePathname();
  const active = (href: string) => {
    if (href === "/wetgeving") return !pathname.startsWith("/wetgeving/vestigingen");
    if (href === "/wetgeving/vestigingen") return pathname.startsWith(href) && !pathname.startsWith("/wetgeving/vestigingen/vragen");
    return pathname.startsWith(href);
  };
  return (
    <nav className="tabs mb-6 flex gap-1 border-b border-neutral-200" aria-label="Wet- en regelgeving">
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
