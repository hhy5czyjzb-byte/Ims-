"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { saveSlide, uploadReviewImage } from "@/app/(app)/directiebeoordeling/actions";
import { SlidePreview, reviewImageSrc, type PreviewReview } from "@/components/review/slide-preview";
import { shrink } from "@/components/review/image-shrink";
import {
  COLOR_CHOICES,
  ELEMENT_LABEL,
  REVIEW_THEME as T,
  elementId,
  safeSlideData,
  type Cell,
  type ChapterData,
  type ConclusionData,
  type ContentData,
  type ElementType,
  type Para,
  type SlideElement,
  type TitleData,
} from "@/lib/review-model";
import { FmtBar, Styled, setFmt } from "@/components/review/fmt-bar";
import { chart as chartPreset, judgment as judgmentPreset, kpiRow, cardGrid, table as tablePreset } from "@/lib/review-presets";

export type EditorImage = { id: string; role: string; name: string | null };
export type EditorSlide = {
  id: string;
  layout: string;
  kicker: string | null;
  title: string;
  imageId: string | null;
  hidden: boolean;
  data: unknown;
  updatedAt: string;
};

const SOURCE_NAMES: Record<string, string> = {
  "co2-years": "CO2-uitstoot per jaar",
  "actions-open": "openstaande acties",
  "risks-top": "belangrijkste risico's en kansen",
  "reports-year": "ongevallen en incidenten per soort",
  "reports-total": "aantal meldingen",
  "audit-findings": "auditbevindingen",
  "legal-open": "wettelijke eisen die niet voldoen",
  "kpi-actions-overdue": "acties te laat",
  "kpi-compliance": "compliancegraad",
  "kpi-reports": "ongevallen en incidenten in het jaar",
  "kpi-absence": "ongevallen met verzuim",
  "objectives-status": "doelstellingen met status",
  "objectives-smart": "doelstellingen (SMART)",
  "kpi-objectives": "doelstellingen op koers of behaald",
  "kpi-co2": "CO2 t.o.v. vorig jaar",
};

// ── Kleine invoerbouwstenen ───────────────────────────────────

function L({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function Txt({ value, onChange, rows, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return rows ? (
    <textarea className="input" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
}

function Num({ value, onChange, step = 0.05, min, max }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <input
      className="input"
      type="number"
      step={step}
      min={min}
      max={max}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Number(e.target.value.replace(",", ".")) || 0)}
    />
  );
}

function ColorSelect({ value, onChange, allowEmpty }: { value?: string; onChange: (v: string | undefined) => void; allowEmpty?: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="inline-block size-5 shrink-0 rounded border border-neutral-300" style={{ background: value ? `#${value}` : "transparent" }} />
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
        {COLOR_CHOICES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
        <option value="C9C9C9">Grijs licht (grafiek)</option>
        <option value="8C8C8C">Grijs donker (grafiek)</option>
        {value && ![...COLOR_CHOICES.map((c) => c.value), "C9C9C9", "8C8C8C"].includes(value) && <option value={value}>#{value}</option>}
      </select>
    </span>
  );
}

const linesOf = (s: string) => s.split("\n");

// ── Afbeeldingskiezer ─────────────────────────────────────────

function ImagePicker({
  images,
  value,
  onChange,
  role,
  onUploaded,
  allowEmpty = "Geen",
}: {
  images: EditorImage[];
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  role: "photo" | "strip" | "icon" | "logo";
  onUploaded: (img: EditorImage) => void;
  allowEmpty?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const list = images.filter((i) => (role === "photo" || role === "strip" ? i.role === "photo" || i.role === "strip" : i.role === role));
  async function upload(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setErr(null);
    const { file, width, height } = await shrink(f, role, f.name);
    const fd = new FormData();
    fd.set("image", new File([file], f.name, { type: file.type || f.type }));
    fd.set("role", role);
    fd.set("name", f.name);
    fd.set("width", String(width));
    fd.set("height", String(height));
    const res = await uploadReviewImage(fd);
    setBusy(false);
    if (res.error || !res.id) return setErr(res.error ?? "Uploaden mislukt.");
    onUploaded({ id: res.id, role, name: f.name });
    onChange(res.id);
  }
  return (
    <div>
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={reviewImageSrc(value)}
            alt=""
            className={`rounded border border-neutral-200 object-cover ${role === "icon" ? "size-8 bg-brand-red p-1" : "h-12 w-20"}`}
          />
        ) : (
          <span className="text-sm text-neutral-500">{allowEmpty}</span>
        )}
        <button type="button" className="btn-link text-sm" onClick={() => setOpen(!open)}>
          {open ? "Sluiten" : "Kiezen…"}
        </button>
        {value && (
          <button type="button" className="btn-link text-sm" onClick={() => onChange(null)}>
            Weghalen
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 rounded border border-neutral-200 p-2">
          <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
            {list.map((i) => (
              <button
                key={i.id}
                type="button"
                title={i.name ?? ""}
                onClick={() => {
                  onChange(i.id);
                  setOpen(false);
                }}
                className={`overflow-hidden rounded border ${i.id === value ? "border-brand-red ring-2 ring-brand-red" : "border-neutral-200"} ${role === "icon" ? "bg-brand-red p-2" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={reviewImageSrc(i.id)} alt="" className={role === "icon" ? "mx-auto size-6" : "h-14 w-full object-cover"} loading="lazy" />
              </button>
            ))}
          </div>
          <label className="mt-2 block text-sm">
            <span className="text-neutral-600">Nieuwe afbeelding uploaden: </span>
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          {busy && <p className="text-xs text-neutral-500">Uploaden…</p>}
          {err && <p className="text-xs text-brand-red">{err}</p>}
        </div>
      )}
    </div>
  );
}

// ── Editors per element ───────────────────────────────────────

function TableEditor({ e, set }: { e: Extract<SlideElement, { type: "table" }>; set: (p: Partial<typeof e>) => void }) {
  const cols = e.colW.length;
  const setCell = (ri: number, ci: number, p: Partial<Cell>) =>
    set({ rows: e.rows.map((r, i) => (i === ri ? e.colW.map((_, j) => (j === ci ? { ...(r[j] ?? { text: "" }), ...p } : (r[j] ?? { text: "" }))) : r)) });
  const STATUS: { label: string; color?: string; bold?: boolean; prefix?: string }[] = [
    { label: "Normaal" },
    { label: "● Groen", color: T.green, bold: true, prefix: "● " },
    { label: "● Oranje", color: T.amber, bold: true, prefix: "● " },
    { label: "● Rood", color: T.redDark, bold: true, prefix: "● " },
    { label: "Vet", bold: true },
    { label: "Grijs", color: T.faint },
  ];
  const styleIdx = (c: Cell) => {
    const i = STATUS.findIndex((s) => s.color === c.color && !!s.bold === !!c.bold);
    return i < 0 ? 0 : i;
  };
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {e.colW.map((w, ci) => (
                <th key={ci} className="p-1 align-bottom">
                  <input
                    className="input font-semibold uppercase"
                    value={e.header[ci] ?? ""}
                    onChange={(ev) => set({ header: e.colW.map((_, j) => (j === ci ? ev.target.value : (e.header[j] ?? ""))) })}
                  />
                  <span className="mt-1 flex items-center gap-1 text-xs font-normal text-neutral-500">
                    breedte
                    <input
                      className="input w-16 py-0.5 text-xs"
                      type="number"
                      step={0.05}
                      value={w}
                      onChange={(ev) => set({ colW: e.colW.map((x, j) => (j === ci ? Number(ev.target.value) || 0.5 : x)) })}
                    />
                    {cols > 1 && (
                      <button
                        type="button"
                        className="btn-link text-xs"
                        title="Kolom verwijderen"
                        onClick={() =>
                          set({
                            colW: e.colW.filter((_, j) => j !== ci),
                            header: e.header.filter((_, j) => j !== ci),
                            rows: e.rows.map((r) => r.filter((_, j) => j !== ci)),
                          })
                        }
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {e.rows.map((r, ri) => (
              <tr key={ri} className="align-top">
                {e.colW.map((_, ci) => {
                  const c = r[ci] ?? { text: "" };
                  return (
                    <td key={ci} className="p-1">
                      <textarea
                        className="input min-h-[2.4rem] text-sm"
                        rows={Math.min(4, Math.max(1, Math.ceil(c.text.length / 40)))}
                        value={c.text}
                        style={{ color: c.color ? `#${c.color}` : undefined, fontWeight: c.bold ? 700 : 400 }}
                        onChange={(ev) => setCell(ri, ci, { text: ev.target.value })}
                      />
                      <select
                        className="mt-0.5 w-full rounded border border-neutral-200 bg-white text-xs text-neutral-600"
                        value={styleIdx(c)}
                        onChange={(ev) => {
                          const s = STATUS[Number(ev.target.value)];
                          let text = c.text.replace(/^●\s*/, "");
                          if (s.prefix) text = s.prefix + text;
                          setCell(ri, ci, { text, color: s.color, bold: s.bold });
                        }}
                      >
                        {STATUS.map((s, i) => (
                          <option key={s.label} value={i}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
                <td className="p-1 text-xs whitespace-nowrap">
                  <button
                    type="button"
                    className="btn-link"
                    title="Omhoog"
                    disabled={ri === 0}
                    onClick={() => set({ rows: e.rows.map((x, i) => (i === ri - 1 ? e.rows[ri] : i === ri ? e.rows[ri - 1] : x)) })}
                  >
                    ↑
                  </button>{" "}
                  <button type="button" className="btn-link" title="Rij verwijderen" onClick={() => set({ rows: e.rows.filter((_, i) => i !== ri) })}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <button type="button" className="btn-secondary" onClick={() => set({ rows: [...e.rows, e.colW.map(() => ({ text: "" }))] })}>
          + Rij
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            const w = 1.5;
            set({ colW: [...e.colW, w], header: [...e.header, ""], rows: e.rows.map((r) => [...r, { text: "" }]), w: e.w + w });
          }}
        >
          + Kolom
        </button>
        <L label="Rijhoogte (inch)">
          <Num value={e.rowH} step={0.02} onChange={(v) => set({ rowH: v })} />
        </L>
        <L label="Lettergrootte (pt)">
          <Num value={e.fontSize ?? 10.5} step={0.5} onChange={(v) => set({ fontSize: v })} />
        </L>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Styled label="Opmaak kopregel" fmt={e.fmt?.header} onFmt={(v) => set({ fmt: setFmt(e.fmt, "header", v) })} defaults={{ bold: true, size: 8.5 }}>
          <span />
        </Styled>
        <Styled
          label="Opmaak tekst in de tabel"
          fmt={e.fmt?.body}
          onFmt={(v) => set({ fmt: setFmt(e.fmt, "body", v) })}
          defaults={{ size: e.fontSize ?? 10.5 }}
        >
          <span className="text-xs text-neutral-500">Status en vet per cel (keuzelijst onder elke cel) gaan voor.</span>
        </Styled>
        <span className="text-xs text-neutral-500">
          Totale breedte:{" "}
          {e.colW
            .reduce((n, v) => n + v, 0)
            .toFixed(2)
            .replace(".", ",")}{" "}
          inch (inhoudsvlak 9,5)
        </span>
      </div>
    </div>
  );
}

function ChartEditor({ e, set }: { e: Extract<SlideElement, { type: "chart" }>; set: (p: Partial<typeof e>) => void }) {
  const multi = e.series.length > 1;
  const setValue = (si: number, ci: number, v: number) =>
    set({ series: e.series.map((s, i) => (i === si ? { ...s, values: e.categories.map((_, j) => (j === ci ? v : (s.values[j] ?? 0))) } : s)) });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <L label="Soort">
          <select className="input" value={e.kind} onChange={(ev) => set({ kind: ev.target.value as "col" | "bar" })}>
            <option value="col">Kolommen (verticaal)</option>
            <option value="bar">Staven (horizontaal)</option>
          </select>
        </L>
        <Styled
          label="Titel boven de grafiek"
          className="sm:col-span-2"
          fmt={e.fmt?.title}
          onFmt={(v) => set({ fmt: setFmt(e.fmt, "title", v) })}
          defaults={{ size: 11 }}
        >
          <Txt value={e.title ?? ""} onChange={(v) => set({ title: v || undefined })} />
        </Styled>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="p-1 text-left text-xs text-neutral-500">Categorie</th>
            {e.series.map((s, si) => (
              <th key={si} className="p-1">
                <input
                  className="input text-xs"
                  value={s.name}
                  onChange={(ev) => set({ series: e.series.map((x, i) => (i === si ? { ...x, name: ev.target.value } : x)) })}
                />
                {multi && (
                  <span className="mt-1 block">
                    <ColorSelect
                      value={e.colors[si]}
                      onChange={(v) => set({ colors: e.series.map((_, i) => (i === si ? (v ?? "C9C9C9") : (e.colors[i] ?? "C9C9C9"))) })}
                    />
                  </span>
                )}
              </th>
            ))}
            {!multi && <th className="p-1 text-left text-xs text-neutral-500">Kleur</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {e.categories.map((cat, ci) => (
            <tr key={ci}>
              <td className="p-1">
                <input className="input" value={cat} onChange={(ev) => set({ categories: e.categories.map((c, j) => (j === ci ? ev.target.value : c)) })} />
              </td>
              {e.series.map((s, si) => (
                <td key={si} className="p-1">
                  <Num value={s.values[ci] ?? 0} step={0.01} onChange={(v) => setValue(si, ci, v)} />
                </td>
              ))}
              {!multi && (
                <td className="p-1">
                  <ColorSelect
                    value={e.colors[ci]}
                    onChange={(v) => set({ colors: e.categories.map((_, j) => (j === ci ? (v ?? "C9C9C9") : (e.colors[j] ?? "C9C9C9"))) })}
                  />
                </td>
              )}
              <td className="p-1">
                <button
                  type="button"
                  className="btn-link text-xs"
                  onClick={() =>
                    set({
                      categories: e.categories.filter((_, j) => j !== ci),
                      series: e.series.map((s) => ({ ...s, values: s.values.filter((_, j) => j !== ci) })),
                      colors: multi ? e.colors : e.colors.filter((_, j) => j !== ci),
                    })
                  }
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            set({
              categories: [...e.categories, ""],
              series: e.series.map((s) => ({ ...s, values: [...s.values, 0] })),
              colors: multi ? e.colors : [...e.colors, T.redDark],
            })
          }
        >
          + Categorie
        </button>
        {e.series.length < 4 && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              set({
                series: [...e.series, { name: `Reeks ${e.series.length + 1}`, values: e.categories.map(() => 0) }],
                colors: [...e.series.map((_, i) => e.colors[i] ?? "C9C9C9"), T.redDark],
              })
            }
          >
            + Reeks
          </button>
        )}
        {multi && (
          <button type="button" className="btn-link text-sm" onClick={() => set({ series: e.series.slice(0, -1) })}>
            Laatste reeks verwijderen
          </button>
        )}
        <L label="Decimalen">
          <Num value={e.decimals ?? 0} step={1} min={0} max={3} onChange={(v) => set({ decimals: Math.max(0, Math.min(3, Math.round(v))) })} />
        </L>
      </div>
    </div>
  );
}

function ParasEditor({ paras, set }: { paras: Para[]; set: (p: Para[]) => void }) {
  return (
    <div className="space-y-2">
      {paras.map((p, i) => (
        <div key={i} className="rounded border border-neutral-200 p-2">
          <Txt
            value={p.text}
            rows={Math.min(5, Math.max(1, Math.ceil(p.text.length / 70)))}
            onChange={(v) => set(paras.map((x, j) => (j === i ? { ...x, text: v } : x)))}
          />
          <div className="mt-1">
            <FmtBar
              value={{ bold: p.bold, size: p.size, color: p.color, font: p.font, italic: p.italic, underline: p.underline, align: p.align }}
              defaults={{ size: 11 }}
              onChange={(v) =>
                set(
                  paras.map((x, j) =>
                    j === i
                      ? {
                          text: x.text,
                          bullet: x.bullet,
                          bold: v?.bold,
                          size: v?.size,
                          color: v?.color,
                          font: v?.font,
                          italic: v?.italic,
                          underline: v?.underline,
                          align: v?.align,
                        }
                      : x,
                  ),
                )
              }
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={!!p.bullet}
                onChange={(ev) => set(paras.map((x, j) => (j === i ? { ...x, bullet: ev.target.checked || undefined } : x)))}
              />{" "}
              opsommingsteken
            </label>
            <button type="button" className="btn-link" onClick={() => set(paras.filter((_, j) => j !== i))}>
              Verwijderen
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={() => set([...paras, { text: "" }])}>
        + Alinea
      </button>
    </div>
  );
}

function ElementFields({
  e,
  set,
  images,
  onUploaded,
}: {
  e: SlideElement;
  set: (p: Partial<SlideElement>) => void;
  images: EditorImage[];
  onUploaded: (i: EditorImage) => void;
}) {
  const s = set as (p: Record<string, unknown>) => void;
  /** Opmaak van een veld van dit element. */
  const f = (k: string) => ({ fmt: e.fmt?.[k], onFmt: (v: Parameters<typeof setFmt>[2]) => s({ fmt: setFmt(e.fmt, k, v) }) });
  switch (e.type) {
    case "kpi":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Styled label="Waarde (groot)" {...f("value")} defaults={{ bold: true, size: e.caption ? 30 : 28 }}>
            <Txt value={e.value} onChange={(v) => s({ value: v })} />
          </Styled>
          <L label="Kleur van de waarde">
            <ColorSelect value={e.color} allowEmpty="Zwart" onChange={(v) => s({ color: v })} />
          </L>
          <Styled label="Toelichting" className="sm:col-span-2" {...f("label")} defaults={{ size: e.caption ? 11 : 10.5 }}>
            <Txt value={e.label} onChange={(v) => s({ label: v })} />
          </Styled>
          <Styled label="Kopje boven de waarde (optioneel)" className="sm:col-span-2" {...f("caption")} defaults={{ bold: true, size: 9 }}>
            <Txt value={e.caption ?? ""} onChange={(v) => s({ caption: v || undefined })} />
          </Styled>
        </div>
      );
    case "card":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Styled label="Titel" className="sm:col-span-2" {...f("title")} defaults={{ bold: true, size: 13 }}>
            <Txt value={e.title} onChange={(v) => s({ title: v })} />
          </Styled>
          <Styled label="Tekst (elke regel een punt)" className="sm:col-span-2" {...f("body")} defaults={{ size: e.bodySize ?? 12 }}>
            <Txt value={e.body} rows={5} onChange={(v) => s({ body: v })} />
          </Styled>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!e.bullets} onChange={(ev) => s({ bullets: ev.target.checked })} /> Opsommingstekens
          </label>
          <L label="Lettergrootte tekst (pt)">
            <Num value={e.bodySize ?? 12} step={0.5} onChange={(v) => s({ bodySize: v })} />
          </L>
          <L label="Kleur icooncirkel">
            <ColorSelect value={e.iconColor ?? T.red} onChange={(v) => s({ iconColor: v })} />
          </L>
          <div>
            <span className="label">Icoon</span>
            <ImagePicker images={images} value={e.iconId} role="icon" onChange={(id) => s({ iconId: id })} onUploaded={onUploaded} />
          </div>
        </div>
      );
    case "judgment":
      return (
        <div className="grid gap-3">
          <Styled label="Kopje" {...f("label")} defaults={{ bold: true, size: e.stacked ? 10.5 : 12.5 }}>
            <Txt value={e.label} onChange={(v) => s({ label: v })} />
          </Styled>
          <Styled label="Tekst" {...f("text")} defaults={{ size: e.stacked ? 10.5 : 12.5 }}>
            <Txt value={e.text} rows={3} onChange={(v) => s({ text: v })} />
          </Styled>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!e.stacked} onChange={(ev) => s({ stacked: ev.target.checked })} /> Kopje boven de tekst (smal vak)
          </label>
        </div>
      );
    case "decisions":
      return (
        <div className="grid gap-3">
          <Styled label="Kopje" {...f("heading")} defaults={{ bold: true, size: 11 }}>
            <Txt value={e.heading} onChange={(v) => s({ heading: v })} />
          </Styled>
          <Styled label="Besluiten (elke regel een besluit)" {...f("items")} defaults={{ size: 13 }}>
            <Txt value={e.items.join("\n")} rows={6} onChange={(v) => s({ items: linesOf(v) })} />
          </Styled>
        </div>
      );
    case "check":
      return (
        <Styled label="Actie" {...f("text")} defaults={{ size: 12 }}>
          <Txt value={e.text} rows={2} onChange={(v) => s({ text: v })} />
        </Styled>
      );
    case "text":
      return <ParasEditor paras={e.paras} set={(paras) => s({ paras })} />;
    case "table":
      return <TableEditor e={e} set={s} />;
    case "chart":
      return <ChartEditor e={e} set={s} />;
  }
}

function newElement(type: ElementType, below: number): SlideElement {
  const y = Math.min(Math.max(1.75, below + 0.15), 6.2);
  switch (type) {
    case "kpi":
      return { ...kpiRow(4, y)[0] };
    case "card":
      return { ...cardGrid(2, 1, y, 1.95)[0] };
    case "judgment":
      return { ...judgmentPreset(Math.min(y, 6.05)) };
    case "decisions":
      return { id: elementId(), type: "decisions", x: 8.21, y: 1.75, w: 4.64, h: 4.95, heading: "BESLUITEN DIRECTIE", items: ["Besluit"] };
    case "check":
      return { id: elementId(), type: "check", x: 3.35, y, w: 9.5, h: 0.68, text: "Actie" };
    case "text":
      return { id: elementId(), type: "text", x: 3.35, y, w: 9.5, h: 0.8, paras: [{ text: "Tekst" }] };
    case "table":
      return tablePreset(["KOLOM 1", "KOLOM 2", "KOLOM 3"], 3, y);
    case "chart":
      return chartPreset(3.35, y, 6, Math.max(2, 6.7 - y));
  }
}

const summary = (e: SlideElement): string => {
  switch (e.type) {
    case "kpi":
      return `${e.value} ${e.label}`;
    case "card":
      return e.title;
    case "judgment":
      return e.text;
    case "decisions":
      return e.items[0] ?? "";
    case "check":
      return e.text;
    case "text":
      return e.paras[0]?.text ?? "";
    case "table":
      return `${e.rows.length} rijen × ${e.colW.length} kolommen`;
    case "chart":
      return e.title ?? e.series[0]?.name ?? "";
  }
};

// ── Editor ────────────────────────────────────────────────────

export function SlideEditor({
  slide: initial,
  review,
  images: initialImages,
  number,
  prevHref,
  nextHref,
  backHref,
}: {
  slide: EditorSlide;
  review: PreviewReview;
  images: EditorImage[];
  number: number;
  prevHref: string | null;
  nextHref: string | null;
  backHref: string;
}) {
  const router = useRouter();
  const [kicker, setKicker] = useState(initial.kicker ?? "");
  const [title, setTitle] = useState(initial.title);
  const [imageId, setImageId] = useState<string | null>(initial.imageId);
  const [hidden, setHidden] = useState(initial.hidden);
  const [data, setData] = useState(() => safeSlideData(initial.layout, initial.data));
  const [images, setImages] = useState(initialImages);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const layout = initial.layout;

  const touch = () => {
    setDirty(true);
    setMessage(null);
  };
  const update = <D,>(fn: (d: D) => D) => {
    setData((d) => fn(d as unknown as D) as unknown as typeof d);
    touch();
  };
  const onUploaded = (img: EditorImage) => setImages((l) => [img, ...l.filter((x) => x.id !== img.id)]);

  const save = useCallback(
    (then?: string | null) =>
      start(async () => {
        const res = await saveSlide(initial.id, { kicker: kicker || null, title, imageId, hidden, data });
        if (res.error) return setMessage({ ok: false, text: res.error });
        setDirty(false);
        setMessage({ ok: true, text: "Opgeslagen." });
        if (then) router.push(then);
        else router.refresh();
      }),
    [initial.id, kicker, title, imageId, hidden, data, router],
  );

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        save();
      }
    };
    const onLeave = (ev: BeforeUnloadEvent) => {
      if (dirty) ev.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [save, dirty]);

  /** Opmaak van een veld op dia-niveau (titel, kopregel, velden van titel-/hoofdstuk-/conclusiedia). */
  const sf = (k: string) => ({
    fmt: (data as { fmt?: Record<string, Parameters<typeof setFmt>[2]> }).fmt?.[k],
    onFmt: (v: Parameters<typeof setFmt>[2]) => update<{ fmt?: Parameters<typeof setFmt>[0] }>((d) => ({ ...d, fmt: setFmt(d.fmt, k, v) })),
  });
  const previewSlide = useMemo(() => ({ layout, kicker: kicker || null, title, imageId, data }), [layout, kicker, title, imageId, data]);
  const content = layout === "CONTENT" ? (data as ContentData) : null;

  const setEl = (id: string, p: Partial<SlideElement>) =>
    update<ContentData>((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? ({ ...e, ...p } as SlideElement) : e)) }));
  const moveEl = (i: number, dir: -1 | 1) =>
    update<ContentData>((d) => {
      const els = [...d.elements];
      const j = i + dir;
      if (j < 0 || j >= els.length) return d;
      [els[i], els[j]] = [els[j], els[i]];
      return { ...d, elements: els };
    });

  const nav = (href: string | null, label: string) =>
    href ? (
      <button type="button" className="btn-secondary" disabled={pending} onClick={() => (dirty ? save(href) : router.push(href))}>
        {label}
      </button>
    ) : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="xl:sticky xl:top-4 xl:self-start">
        <div className="overflow-hidden rounded border border-neutral-300 shadow-sm">
          <SlidePreview slide={previewSlide} review={review} number={number} selectedId={selected} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn" disabled={pending || !dirty} onClick={() => save()}>
            {pending ? "Opslaan…" : dirty ? "Opslaan" : "Opgeslagen"}
          </button>
          {nav(prevHref, "← Vorige dia")}
          {nav(nextHref, "Volgende dia →")}
          <Link
            href={backHref}
            className="btn-link text-sm"
            onClick={(ev) => dirty && !confirm("Niet opgeslagen wijzigingen gaan verloren. Doorgaan?") && ev.preventDefault()}
          >
            Terug naar overzicht
          </Link>
          {message && <span className={`text-sm ${message.ok ? "text-green-700" : "text-brand-red"}`}>{message.text}</span>}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Voorbeeld op schaal; in PowerPoint wordt het lettertype Trade Gothic Next gebruikt (op deze pagina Fira Sans). Tip: Ctrl+S slaat op.
        </p>
      </div>

      <div className="space-y-4">
        <section className="card space-y-3">
          {layout === "CONTENT" && (
            <Styled label="Kopregel (rood, boven de titel)" {...sf("kicker")} defaults={{ bold: true, size: 10 }}>
              <Txt value={kicker} onChange={(v) => (setKicker(v), touch())} placeholder="01  ·  RESULTATEN VOORGAANDE DOELSTELLINGEN" />
            </Styled>
          )}
          {layout === "CONCLUSION" && (
            <Styled label="Kopregel (rood)" {...sf("kicker")} defaults={{ bold: true, size: 12 }}>
              <Txt value={kicker} onChange={(v) => (setKicker(v), touch())} placeholder="CONCLUSIE" />
            </Styled>
          )}
          {layout === "CONCLUSION" ? (
            <L label="Naam van de dia (alleen in de app)">
              <Txt value={title} onChange={(v) => (setTitle(v), touch())} />
            </L>
          ) : (
            <Styled label="Titel" {...sf("title")} defaults={{ bold: true, size: layout === "TITLE" ? 44 : layout === "CHAPTER" ? 38 : 26 }}>
              <Txt value={title} onChange={(v) => (setTitle(v), touch())} />
            </Styled>
          )}
          <div>
            <span className="label">{layout === "CONTENT" ? "Fotostrook links" : "Foto"}</span>
            <ImagePicker
              images={images}
              value={imageId}
              role={layout === "CONTENT" ? "strip" : "photo"}
              allowEmpty={layout === "CONTENT" ? "Standaard fotostrook" : "Geen foto"}
              onChange={(id) => (setImageId(id), touch())}
              onUploaded={onUploaded}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hidden} onChange={(e) => (setHidden(e.target.checked), touch())} /> Verbergen (niet in de PowerPoint)
          </label>
        </section>

        {layout === "TITLE" && (
          <section className="card grid gap-3 sm:grid-cols-2">
            {(
              [
                ["brand", "Bovenregel (rood)"],
                ["subtitle", "Ondertitel"],
                ["normsLine", "Normen"],
                ["tagline", "Slogan"],
                ["dateText", "Datum"],
              ] as const
            ).map(([k, label]) => (
              <Styled
                key={k}
                label={label}
                className={k === "normsLine" || k === "subtitle" ? "sm:col-span-2" : ""}
                {...sf(k)}
                defaults={{ bold: k === "brand" || k === "tagline", size: { brand: 12, subtitle: 22, normsLine: 12, tagline: 13, dateText: 12 }[k] }}
              >
                <Txt value={(data as TitleData)[k]} onChange={(v) => update<TitleData>((d) => ({ ...d, [k]: v }))} />
              </Styled>
            ))}
          </section>
        )}

        {layout === "CHAPTER" && (
          <section className="card grid gap-3">
            <Styled label="Hoofdstuknummer" {...sf("number")} defaults={{ bold: true, size: 96 }}>
              <Txt value={(data as ChapterData).number} onChange={(v) => update<ChapterData>((d) => ({ ...d, number: v }))} />
            </Styled>
            <Styled label="Onderwerpen (elke regel één)" {...sf("items")} defaults={{ size: 14 }}>
              <Txt value={(data as ChapterData).items.join("\n")} rows={6} onChange={(v) => update<ChapterData>((d) => ({ ...d, items: linesOf(v) }))} />
            </Styled>
          </section>
        )}

        {layout === "CONCLUSION" && (
          <section className="card space-y-3">
            {(data as ConclusionData).columns.map((col, i) => (
              <div key={i} className="rounded border border-neutral-200 p-3">
                <Styled label={`Kolom ${i + 1}: titel`} {...sf("colTitle")} defaults={{ bold: true, size: 20 }}>
                  <Txt
                    value={col.title}
                    onChange={(v) => update<ConclusionData>((d) => ({ ...d, columns: d.columns.map((c, j) => (j === i ? { ...c, title: v } : c)) }))}
                  />
                </Styled>
                <Styled label="Tekst" className="mt-2" {...sf("colText")} defaults={{ size: 14 }}>
                  <Txt
                    value={col.text}
                    rows={3}
                    onChange={(v) => update<ConclusionData>((d) => ({ ...d, columns: d.columns.map((c, j) => (j === i ? { ...c, text: v } : c)) }))}
                  />
                </Styled>
                <button
                  type="button"
                  className="btn-link mt-1 text-sm"
                  onClick={() => update<ConclusionData>((d) => ({ ...d, columns: d.columns.filter((_, j) => j !== i) }))}
                >
                  Kolom verwijderen
                </button>
              </div>
            ))}
            {(data as ConclusionData).columns.length < 3 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => update<ConclusionData>((d) => ({ ...d, columns: [...d.columns, { title: "", text: "" }] }))}
              >
                + Kolom
              </button>
            )}
          </section>
        )}

        {content && (
          <section className="space-y-2">
            {content.elements.map((e, i) => {
              const open = selected === e.id;
              const source = "source" in e ? e.source : undefined;
              return (
                <div key={e.id} className={`card p-0 ${open ? "ring-2 ring-[#257de0]" : ""}`}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
                    onClick={() => setSelected(open ? null : e.id)}
                  >
                    <span className="min-w-0">
                      <span className="text-sm font-semibold">{ELEMENT_LABEL[e.type]}</span>
                      <span className="ml-2 truncate text-sm text-neutral-500">{summary(e).slice(0, 70)}</span>
                      {source && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-800">IMS</span>}
                    </span>
                    <span className="text-neutral-400">{open ? "▾" : "▸"}</span>
                  </button>
                  {open && (
                    <div className="space-y-4 border-t border-neutral-100 px-4 py-3">
                      {source && (
                        <p className="rounded bg-blue-50 px-3 py-2 text-xs text-blue-900">
                          Gevuld uit het IMS ({SOURCE_NAMES[source] ?? source}). &lsquo;Cijfers bijwerken uit IMS&rsquo; op het overzicht overschrijft de
                          gegevens.{" "}
                          <button type="button" className="btn-link text-xs" onClick={() => setEl(e.id, { source: undefined } as Partial<SlideElement>)}>
                            Loskoppelen
                          </button>
                        </p>
                      )}
                      <ElementFields e={e} set={(p) => setEl(e.id, p)} images={images} onUploaded={onUploaded} />
                      <details className="text-sm">
                        <summary className="cursor-pointer text-neutral-600">Positie en maat (inch)</summary>
                        <div className="mt-2 grid grid-cols-4 gap-2">
                          {(["x", "y", "w", "h"] as const).map((k) => (
                            <L key={k} label={{ x: "Links", y: "Boven", w: "Breedte", h: "Hoogte" }[k]}>
                              <Num value={e[k]} onChange={(v) => setEl(e.id, { [k]: v } as Partial<SlideElement>)} />
                            </L>
                          ))}
                        </div>
                      </details>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <button type="button" className="btn-link" disabled={i === 0} onClick={() => moveEl(i, -1)}>
                          Naar voren
                        </button>
                        <button type="button" className="btn-link" disabled={i === content.elements.length - 1} onClick={() => moveEl(i, 1)}>
                          Naar achteren
                        </button>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() =>
                            update<ContentData>((d) => ({
                              ...d,
                              elements: [...d.elements.slice(0, i + 1), { ...structuredClone(e), id: elementId(), y: e.y + 0.2 }, ...d.elements.slice(i + 1)],
                            }))
                          }
                        >
                          Kopiëren
                        </button>
                        <button
                          type="button"
                          className="btn-link text-brand-red"
                          onClick={() =>
                            confirm(`${ELEMENT_LABEL[e.type]} verwijderen?`) &&
                            update<ContentData>((d) => ({ ...d, elements: d.elements.filter((x) => x.id !== e.id) }))
                          }
                        >
                          Verwijderen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="card flex flex-wrap items-center gap-2">
              <span className="text-sm text-neutral-600">Element toevoegen:</span>
              {(Object.keys(ELEMENT_LABEL) as ElementType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => {
                    const below = Math.max(1.6, ...content.elements.map((x) => x.y + x.h));
                    const el = newElement(t, below);
                    update<ContentData>((d) => ({ ...d, elements: [...d.elements, el] }));
                    setSelected(el.id);
                  }}
                >
                  {ELEMENT_LABEL[t]}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
