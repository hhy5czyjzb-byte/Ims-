import Link from "next/link";

const TABS = [
  { href: "/beheer", label: "Overzicht" },
  { href: "/beheer/vestigingen", label: "Vestigingen" },
  { href: "/beheer/bedrijfsonderdelen", label: "Bedrijfsonderdelen" },
  { href: "/beheer/functies", label: "Functies" },
  { href: "/beheer/gebruikers", label: "Gebruikers" },
  { href: "/normen", label: "Normen" },
];

/** Tabbladen bovenaan de stamgegevens. */
export function BeheerNav({ active }: { active: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-neutral-200 print:hidden" aria-label="Stamgegevens">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm no-underline ${
            active === t.href ? "border-brand-red font-semibold text-brand-red-dark" : "border-transparent text-neutral-600 hover:text-neutral-900"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
