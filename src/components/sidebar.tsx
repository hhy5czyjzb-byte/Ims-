"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTransition } from "react";
import { setViewAs } from "@/app/(app)/view-as-actions";
import { brand } from "@/theme/brand";

type NavItem = { href: string; label: string; soon?: boolean };

const NAV: { title?: string; items: NavItem[] }[] = [
  { items: [{ href: "/", label: "Dashboard" }] },
  {
    title: "Systeem",
    items: [
      { href: "/normen", label: "Normenbeheer" },
      { href: "/context", label: "Context en stakeholders" },
      { href: "/processen", label: "Processen" },
      { href: "/documenten", label: "Documentbeheer" },
      { href: "/risicos", label: "Risico's en kansen" },
      { href: "/audits", label: "Audits" },
      { href: "/wetgeving", label: "Wet- en regelgeving" },
      { href: "/milieuaspecten", label: "Milieuaspecten" },
      { href: "/co2", label: "CO2-prestatieladder" },
      { href: "/acties", label: "Acties" },
    ],
  },
  {
    title: "Binnenkort",
    items: [{ href: "#", label: "Directiebeoordeling", soon: true }],
  },
  { title: "Instellingen", items: [{ href: "/beheer", label: "Stamgegevens" }] },
];

type ViewAs = { currentId: string; users: { id: string; label: string; isSelf: boolean; realId: string }[] } | null;

export function Sidebar({ user, viewAs }: { user: { name: string; roleLabel: string }; viewAs: ViewAs }) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
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
        {viewAs ? (
          <label className="mt-2 block">
            <span className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">Bekijken als</span>
            <select
              className="input mt-1 py-1 text-xs"
              aria-label="Bekijken als"
              disabled={pending}
              value={viewAs.users.find((u) => u.realId === viewAs.currentId)?.id ?? ""}
              onChange={(e) => startTransition(() => setViewAs(e.target.value))}
            >
              {viewAs.users.map((u) => (
                <option key={u.realId} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] leading-tight text-neutral-400">Lokale modus — zonder inloggen. Microsoft 365 volgt later.</span>
          </label>
        ) : (
          <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="btn-link mt-1 text-xs">
            Uitloggen
          </button>
        )}
      </div>
    </aside>
  );
}
