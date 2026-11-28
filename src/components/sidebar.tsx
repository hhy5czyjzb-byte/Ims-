"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState, useTransition } from "react";
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
      { href: "/doelstellingen", label: "Doelstellingen" },
      { href: "/audits", label: "Audits" },
      { href: "/wetgeving", label: "Wet- en regelgeving" },
      { href: "/milieuaspecten", label: "Milieuaspecten" },
      { href: "/co2", label: "CO2-prestatieladder" },
      { href: "/meldingen", label: "Meldingen" },
      { href: "/acties", label: "Actielijst" },
      { href: "/directiebeoordeling", label: "Directiebeoordeling" },
    ],
  },
  { title: "Instellingen", items: [{ href: "/beheer", label: "Stamgegevens" }] },
];

type ViewAs = { currentId: string; users: { id: string; label: string; isSelf: boolean; realId: string }[] } | null;

export function Sidebar({ user, viewAs }: { user: { name: string; roleLabel: string }; viewAs: ViewAs }) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  // Telefoon/tablet: menu als lade achter de knop ☰; sluit bij het kiezen van een pagina.
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);
  const current = NAV.flatMap((g) => g.items).find((i) => isActive(i.href));

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2 lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menu openen"
          aria-expanded={open}
          aria-controls="hoofdmenu"
          className="-ml-1 inline-flex size-10 items-center justify-center rounded-md text-neutral-800 hover:bg-neutral-100"
        >
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/" aria-label="Naar dashboard" className="shrink-0">
          <Image src={brand.logo.color} alt={brand.companyName} width={120} height={27} priority className="h-auto w-[110px]" />
        </Link>
        <span className="ml-auto truncate text-sm font-medium text-neutral-600">{current?.label}</span>
      </header>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden print:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside
        id="hoofdmenu"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] shrink-0 flex-col border-r border-neutral-200 bg-white shadow-xl transition-transform duration-200 lg:static lg:z-auto lg:w-60 lg:translate-x-0 lg:shadow-none print:hidden ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Menu sluiten"
          className="absolute top-3 right-3 inline-flex size-9 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 lg:hidden"
        >
          ✕
        </button>
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
                        className={`block rounded-md px-2 py-2 no-underline lg:py-1.5 hover:no-underline ${
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
    </>
  );
}
