"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { brand } from "@/theme/brand";

type NavItem = { href: string; label: string; soon?: boolean };

const NAV: { title?: string; items: NavItem[] }[] = [
  { items: [{ href: "/", label: "Dashboard" }] },
  {
    title: "Systeem",
    items: [
      { href: "/normen", label: "Normenbeheer" },
      { href: "/processen", label: "Processen" },
      { href: "/documenten", label: "Documentbeheer" },
      { href: "/risicos", label: "Risico's en kansen" },
      { href: "/audits", label: "Audits" },
      { href: "/wetgeving", label: "Wet- en regelgeving" },
      { href: "/milieuaspecten", label: "Milieuaspecten" },
      { href: "/acties", label: "Acties" },
    ],
  },
  {
    title: "Binnenkort",
    items: [
      { href: "#", label: "CO2", soon: true },
      { href: "#", label: "Directiebeoordeling", soon: true },
    ],
  },
  { title: "Instellingen", items: [{ href: "/beheer", label: "Stamgegevens" }] },
];

export function Sidebar({ user }: { user: { name: string; roleLabel: string } }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <Link href="/" aria-label="Naar dashboard">
          <Image src={brand.logo.color} alt={brand.companyName} width={180} height={40} priority className="h-auto w-[180px]" />
        </Link>
        <div className="mt-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">Integraal managementsysteem</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 text-sm">
        {NAV.map((group, gi) => (
          <div key={gi} className="mb-4">
            {group.title && <div className="mb-1 px-2 text-xs font-semibold tracking-wide text-neutral-400 uppercase">{group.title}</div>}
            <ul>
              {group.items.map((item) =>
                item.soon ? (
                  <li key={item.label} className="cursor-default px-2 py-1.5 text-neutral-400" title="Volgt in een volgende fase">
                    {item.label}
                  </li>
                ) : (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block rounded-md px-2 py-1.5 no-underline hover:no-underline ${
                        isActive(item.href) ? "bg-brand-red font-medium text-white" : "text-neutral-800 hover:bg-neutral-100"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-neutral-200 px-5 py-3 text-sm">
        <div className="font-medium">{user.name}</div>
        <div className="text-xs text-neutral-500">{user.roleLabel}</div>
        <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="btn-link mt-1 text-xs">
          Uitloggen
        </button>
      </div>
    </aside>
  );
}
