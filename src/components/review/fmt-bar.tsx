"use client";

import { useState, type ReactNode } from "react";
import { COLOR_CHOICES, FONT_CHOICES, type FmtMap, type TextFmt } from "@/lib/review-model";
import { hasFmt } from "@/lib/review-fmt";

/**
 * Opmaak van een titel of tekst in de directiebeoordeling: lettertype, grootte, kleur, vet/cursief/onderstreept
 * en uitlijning. Leeg = zoals in het template. Klapt open via de knop "Aa" naast het veld.
 */

const EXTRA_COLORS = [
  { value: "FFFFFF", label: "Wit" },
  { value: "D9D9D9", label: "Lichtgrijs (op foto)" },
  { value: "257DE0", label: "Blauw" },
];

/** Veld met label en de knop "Aa" om de opmaak te wijzigen. */
export function Styled({
  label,
  fmt,
  onFmt,
  defaults,
  children,
  className,
}: {
  label: string;
  fmt: TextFmt | undefined;
  onFmt: (f: TextFmt | undefined) => void;
  /** Hoe het veld in het template staat (voor de knoppen vet/cursief). */
  defaults?: { bold?: boolean; size?: number };
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <div className="flex items-end justify-between gap-2">
        <span className="label">{label}</span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          title="Lettertype, grootte, kleur en stijl"
          className={`mb-1 rounded border px-1.5 text-xs leading-5 ${open || hasFmt(fmt) ? "border-[#257de0] bg-blue-50 text-blue-800" : "border-neutral-300 text-neutral-600 hover:bg-neutral-100"}`}
        >
          <span className="font-serif font-bold">A</span>a{hasFmt(fmt) ? " •" : ""}
        </button>
      </div>
      {open && <FmtBar value={fmt} onChange={onFmt} defaults={defaults} />}
      {children}
    </div>
  );
}

function Toggle({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      onClick={onClick}
      className={`h-7 min-w-7 rounded border px-1.5 text-sm ${on ? "border-neutral-700 bg-neutral-800 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100"}`}
    >
      {children}
    </button>
  );
}

/** De opmaakbalk zelf (ook los te gebruiken, bijv. per alinea). */
export function FmtBar({
  value,
  onChange,
  defaults,
  allowAlign = true,
}: {
  value: TextFmt | undefined;
  onChange: (f: TextFmt | undefined) => void;
  defaults?: { bold?: boolean; size?: number };
  allowAlign?: boolean;
}) {
  const v = value ?? {};
  const set = (p: Partial<TextFmt>) => {
    const next = { ...v, ...p };
    for (const k of Object.keys(next) as (keyof TextFmt)[]) if (next[k] === undefined || (next[k] as unknown) === "") delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  const bold = v.bold ?? !!defaults?.bold;
  const colors = [...COLOR_CHOICES, ...EXTRA_COLORS];
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded border border-blue-200 bg-blue-50/50 p-2 text-xs">
      <select
        className="h-7 rounded border border-neutral-300 bg-white px-1"
        value={v.font ?? ""}
        onChange={(e) => set({ font: (e.target.value || undefined) as TextFmt["font"] })}
        aria-label="Lettertype"
        title="Lettertype"
      >
        <option value="">Lettertype: standaard</option>
        {FONT_CHOICES.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>
            {f}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1" title="Grootte in punten">
        <input
          className="h-7 w-14 rounded border border-neutral-300 bg-white px-1"
          type="number"
          min={5}
          max={120}
          step={0.5}
          placeholder={defaults?.size ? String(defaults.size) : "std"}
          value={v.size ?? ""}
          onChange={(e) => set({ size: e.target.value ? Math.min(120, Math.max(5, Number(e.target.value))) : undefined })}
          aria-label="Grootte (pt)"
        />
        pt
      </label>
      <span className="flex items-center gap-1" title="Kleur">
        <select
          className="h-7 rounded border border-neutral-300 bg-white px-1"
          value={v.color && colors.some((c) => c.value === v.color) ? v.color : v.color ? "eigen" : ""}
          onChange={(e) => e.target.value !== "eigen" && set({ color: e.target.value || undefined })}
          aria-label="Kleur"
        >
          <option value="">Kleur: standaard</option>
          {colors.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
          {v.color && !colors.some((c) => c.value === v.color) && <option value="eigen">Eigen kleur #{v.color}</option>}
        </select>
        <input
          type="color"
          className="h-7 w-8 cursor-pointer rounded border border-neutral-300 bg-white p-0.5"
          value={`#${v.color ?? "1A1A1A"}`}
          onChange={(e) => set({ color: e.target.value.slice(1).toUpperCase() })}
          aria-label="Eigen kleur kiezen"
          title="Eigen kleur kiezen"
        />
      </span>
      <Toggle on={bold} onClick={() => set({ bold: !bold === !!defaults?.bold ? undefined : !bold })} title="Vet">
        <b>B</b>
      </Toggle>
      <Toggle on={!!v.italic} onClick={() => set({ italic: v.italic ? undefined : true })} title="Cursief">
        <i className="font-serif">I</i>
      </Toggle>
      <Toggle on={!!v.underline} onClick={() => set({ underline: v.underline ? undefined : true })} title="Onderstreept">
        <span className="underline">U</span>
      </Toggle>
      {allowAlign && (
        <span className="flex gap-0.5" role="group" aria-label="Uitlijning">
          {(
            [
              ["left", "Links uitlijnen", "Links"],
              ["center", "Centreren", "Midden"],
              ["right", "Rechts uitlijnen", "Rechts"],
            ] as const
          ).map(([a, t, icon]) => (
            <Toggle key={a} on={v.align === a} onClick={() => set({ align: v.align === a ? undefined : a })} title={t}>
              <span aria-hidden>{icon}</span>
            </Toggle>
          ))}
        </span>
      )}
      {hasFmt(value) && (
        <button type="button" className="btn-link ml-1 text-xs" onClick={() => onChange(undefined)}>
          Standaard
        </button>
      )}
    </div>
  );
}

/** Opmaak van één veld in een `fmt`-map zetten (leeg = weghalen). */
export function setFmt(map: FmtMap | undefined, key: string, f: TextFmt | undefined): FmtMap | undefined {
  const next = { ...(map ?? {}) };
  if (f) next[key] = f;
  else delete next[key];
  return Object.keys(next).length ? next : undefined;
}
