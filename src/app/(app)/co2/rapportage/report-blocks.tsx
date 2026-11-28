import Link from "next/link";
import type { ReactNode } from "react";
import { richBlocks } from "@/lib/co2-report";

/** Kop van een invalshoek, met een gekleurde band (in de PDF op een nieuwe pagina). */
export function Invalshoek({ id, letter, title, subtitle }: { id: string; letter: string; title: string; subtitle: string }) {
  return (
    <div id={id} className="mt-10 mb-4 rounded-xl bg-gradient-to-r from-brand-red to-brand-red-dark px-6 py-5 text-white print:break-before-page">
      <div className="text-xs font-semibold tracking-widest uppercase opacity-80">Invalshoek {letter}</div>
      <h2 className="text-2xl font-bold text-white">{title}</h2>
      <p className="mt-1 text-sm opacity-90">{subtitle}</p>
    </div>
  );
}

/** Hoofdstuk buiten de invalshoeken (leeswijzer, management statement, algemene eisen): kop met rode streep. */
export function Chapter({ id, title, kicker, newPage = true }: { id?: string; title: string; kicker?: string; newPage?: boolean }) {
  return (
    <div id={id} className={`mt-8 mb-4 border-l-4 border-brand-red pl-4 ${newPage ? "print:break-before-page" : ""}`}>
      {kicker && <div className="text-xs font-semibold tracking-widest text-brand-red-dark uppercase">{kicker}</div>}
      <h2 className="text-2xl font-bold text-neutral-900">{title}</h2>
    </div>
  );
}

export function Section({ title, children, id, className = "" }: { title?: string; children: ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`card mb-4 ${className}`}>
      {title && <h3 className="mb-2 text-lg font-semibold text-brand-red-dark">{title}</h3>}
      {children}
    </section>
  );
}

/** Lege tekst: uitnodiging om in te vullen (alleen op het scherm). */
export function Empty({ text, canEdit }: { text: string; canEdit: boolean }) {
  return (
    <p className="rounded border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-500 print:hidden">
      {text}{" "}
      {canEdit && (
        <Link href="/co2/rapportage/teksten" className="text-xs">
          Tekst invullen →
        </Link>
      )}
    </p>
  );
}

/**
 * Verslagtekst met eenvoudige opmaak (zie `richBlocks`): alinea's, koppen, opsommingen en tabellen.
 * Leeg = uitnodiging om in te vullen (alleen op het scherm), of niets als `empty` ontbreekt.
 */
export function Rich({ value, empty, canEdit = false, className = "" }: { value: string; empty?: string; canEdit?: boolean; className?: string }) {
  if (!value.trim()) return empty ? <Empty text={empty} canEdit={canEdit} /> : null;
  return (
    <div className={`space-y-3 text-sm leading-relaxed text-neutral-800 ${className}`}>
      {richBlocks(value).map((b, i) => {
        if (b.kind === "h")
          return b.level === 2 ? (
            <h4 key={i} className="pt-1 text-base font-semibold text-neutral-900">
              {b.text}
            </h4>
          ) : (
            <h5 key={i} className="font-semibold text-brand-red-dark">
              {b.text}
            </h5>
          );
        if (b.kind === "ul")
          return (
            <ul key={i} className="space-y-1 pl-1">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2">
                  <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-brand-red" aria-hidden />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          );
        if (b.kind === "table")
          return (
            <div key={i} className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    {b.head.map((h, j) => (
                      <th key={j}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) =>
                    r.group ? (
                      <tr key={j} className="bg-neutral-50">
                        <td colSpan={b.head.length} className="font-semibold text-brand-red-dark">
                          {r.cells[0]}
                        </td>
                      </tr>
                    ) : (
                      <tr key={j} className="align-top">
                        {r.cells.map((c, k) => (
                          <td key={k} className={k === 0 && !b.head[0] ? "font-medium" : undefined}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          );
        return (
          <p key={i} className="whitespace-pre-line">
            {b.text}
          </p>
        );
      })}
    </div>
  );
}

/** PDCA-figuur zoals in het jaarverslag: vier kwarten (Plan, Do, Check, Act) met korte teksten. */
export function PdcaFigure({ plan, doText, check, act }: { plan: string; doText: string; check: string; act: string }) {
  const q = [
    { k: "Act", text: act, cls: "rounded-tl-[999px] bg-brand-grey-light/70 text-neutral-900", pos: "items-end justify-end text-right" },
    { k: "Plan", text: plan, cls: "rounded-tr-[999px] bg-brand-red text-white", pos: "items-end justify-start" },
    { k: "Check", text: check, cls: "rounded-bl-[999px] bg-brand-grey-dark/70 text-neutral-900", pos: "items-start justify-end text-right" },
    { k: "Do", text: doText, cls: "rounded-br-[999px] bg-brand-red-dark text-white", pos: "items-start justify-start" },
  ];
  return (
    <figure className="mx-auto my-4 grid max-w-md grid-cols-2 gap-1.5 break-inside-avoid print:max-w-[95mm]" aria-label="PDCA-cyclus">
      {q.map((x) => (
        <div key={x.k} className={`flex aspect-square p-4 sm:p-6 print:p-3 ${x.cls} ${x.pos}`}>
          <div className="max-w-[85%]">
            <div className="text-xl font-bold">{x.k}</div>
            {x.text && <div className="mt-1 text-xs leading-snug whitespace-pre-line opacity-90">{x.text}</div>}
          </div>
        </div>
      ))}
    </figure>
  );
}
