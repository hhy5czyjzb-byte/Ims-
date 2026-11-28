import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Eenvoudige grafieken (server-side, zonder bibliotheek), volgens vaste regels:
 * dunne balken (max. 24px) met 4px afgeronde uiteinden vanaf één basislijn, 2px tussenruimte tussen segmenten,
 * waarden als tekst (niet in de reekskleur), legenda bij 2+ reeksen, tooltip bij aanwijzen.
 * Kleuren: gevalideerd categorisch palet (kleurenblind-veilig voor max. 3 reeksen); status-kleuren blijven voor status.
 */
export const SERIES = ["#257de0", "#f47230", "#00b894"] as const;
/**
 * Volledig categorisch palet (8 kleuren, vaste volgorde): gevalideerd voor naast elkaar liggende vlakken
 * (gestapelde balken, ringsegmenten). Gebruik het in deze volgorde en koppel kleuren aan de categorie,
 * niet aan de rangorde; altijd met zichtbare labels/waarden (een aantal kleuren heeft < 3:1 contrast).
 */
export const CATEGORICAL = ["#257de0", "#f47230", "#00b894", "#f2a600", "#ee7fac", "#008a17", "#6a4ce2", "#ec4647"] as const;

function Tip({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded bg-neutral-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow group-hover:block">
      {children}
    </span>
  );
}

export function ChartCard({ title, subtitle, children, className }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card break-inside-avoid ${className ?? ""}`}>
      <h2 className="text-base">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Horizontale balken: één reeks, gesorteerd; label links, waarde rechts. */
export function BarList({
  items,
  unit = "",
  empty = "Geen gegevens.",
  max: fixedMax,
}: {
  items: { label: string; value: number; href?: string }[];
  unit?: string;
  empty?: string;
  /** Vaste schaal (bijv. 100 bij percentages), anders de grootste waarde. */
  max?: number;
}) {
  const max = fixedMax ?? Math.max(0, ...items.map((i) => i.value));
  if (!items.length || max === 0) return <p className="text-sm text-neutral-500">{empty}</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((i) => {
        const pct = (i.value / max) * 100;
        const label = i.href ? (
          <Link href={i.href} className="text-neutral-800 no-underline hover:underline">
            {i.label}
          </Link>
        ) : (
          i.label
        );
        return (
          <li key={i.label} className="grid grid-cols-[minmax(0,11rem)_1fr_3rem] items-center gap-2">
            <span className="truncate text-neutral-700" title={i.label}>
              {label}
            </span>
            <span className="group relative block h-3">
              <span className="block h-3 rounded-r-[4px]" style={{ width: `${Math.max(pct, 1.5)}%`, background: SERIES[0] }} />
              <Tip>
                {i.label}: {i.value.toLocaleString("nl-NL")}
                {unit}
              </Tip>
            </span>
            <span className="text-right text-neutral-700 tabular-nums">
              {i.value.toLocaleString("nl-NL")}
              {unit === "%" ? "%" : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Kolommen per periode (bijv. maand), optioneel gestapeld met max. 3 reeksen. */
export function Columns({
  periods,
  series,
  height = 140,
}: {
  periods: { label: string; title?: string }[];
  series: { name: string; values: number[] }[];
  height?: number;
}) {
  const totals = periods.map((_, i) => series.reduce((n, s) => n + (s.values[i] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const step = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const plot = height - 14; // ruimte boven de hoogste kolom voor het totaal
  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
          {series.map((s, i) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: SERIES[i] }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[3rem_1fr] gap-1">
        <div className="relative text-right text-[10px] text-neutral-400" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 tabular-nums" style={{ top: height - (t / top) * plot }}>
              {t}
            </span>
          ))}
        </div>
        <div>
          <div className="relative flex items-end gap-1 border-b border-neutral-300" style={{ height }}>
            {ticks.slice(1).map((t) => (
              <span
                key={t}
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-neutral-200"
                style={{ top: height - (t / top) * plot }}
              />
            ))}
            {periods.map((p, i) => (
              <div key={p.label} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                {totals[i] > 0 && <span className="mb-0.5 text-[10px] text-neutral-600 tabular-nums">{totals[i]}</span>}
                <div className="flex w-full max-w-6 flex-col-reverse gap-[2px]">
                  {series.map((s, si) => {
                    const v = s.values[i] ?? 0;
                    if (!v) return null;
                    const isTop = series.slice(si + 1).every((x) => !(x.values[i] ?? 0));
                    return (
                      <span
                        key={s.name}
                        className={isTop ? "rounded-t-[4px]" : ""}
                        style={{ height: Math.max((v / top) * plot - 2, 2), background: SERIES[si] }}
                      />
                    );
                  })}
                </div>
                <Tip>
                  {p.title ?? p.label}: {series.map((s) => (series.length > 1 ? `${s.name} ${s.values[i] ?? 0}` : `${s.values[i] ?? 0}`)).join(" · ")}
                </Tip>
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1 text-center text-[10px] text-neutral-500">
            {periods.map((p) => (
              <span key={p.label} className="flex-1 truncate">
                {p.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Gesegmenteerde balk (aandelen van een geheel), met legenda en aantallen. */
export function SegmentBar({ parts }: { parts: { label: string; value: number; color: string; href?: string }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (!total) return <p className="text-sm text-neutral-500">Geen gegevens.</p>;
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[4px]">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span key={p.label} className="group relative block h-full" style={{ width: `${(p.value / total) * 100}%`, background: p.color }}>
              <Tip>
                {p.label}: {p.value} ({Math.round((p.value / total) * 100)}%)
              </Tip>
            </span>
          ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-700">
        {parts.map((p) => (
          <li key={p.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: p.color }} />
            {p.href ? <Link href={p.href}>{p.label}</Link> : p.label} <span className="tabular-nums">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Laatste n maanden (UTC) als periodes, voor Columns. */
export function lastMonths(n: number, now = new Date()): { key: string; label: string; title: string }[] {
  const out: { key: string; label: string; title: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("nl-NL", { month: "short", timeZone: "UTC" }).replace(".", ""),
      title: d.toLocaleDateString("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" }),
    });
  }
  return out;
}
export const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Opeenvolgende reeksen (bijv. jaren): één tint van licht naar donker, de laatste het donkerst. */
export function sequentialRamp(n: number): string[] {
  const from = [198, 219, 247];
  const to = [11, 78, 162];
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 1 : 0.15 + (0.85 * i) / (n - 1);
    const c = from.map((f, k) => Math.round(f + (to[k] - f) * t));
    return `rgb(${c.join(",")})`;
  });
}

/**
 * Gegroepeerde kolommen: per groep (bijv. brandstoftype) een kolom per reeks (bijv. jaar), naast elkaar.
 * Kolommen max. 24px met 4px afgeronde bovenkant, 2px tussenruimte, waarde boven de kolom, legenda en tooltip.
 */
/** Afgeronde stapgrootte voor een as (1, 2, 2,5 of 5 × 10^n). */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}

const nfCompact = new Intl.NumberFormat("nl-NL", { notation: "compact", maximumFractionDigits: 1 });
/** Kort getal voor assen en labels: 1.556.388 → "1,6 mln.", 56.474 → "56K"; kleine getallen volledig. */
function compact(v: number): string {
  return Math.abs(v) < 100000 ? v.toLocaleString("nl-NL", { maximumFractionDigits: 1 }) : nfCompact.format(v);
}

export function GroupedColumns({
  groups,
  series,
  colors,
  height = 200,
  unit = "",
}: {
  groups: string[];
  series: { name: string; values: number[] }[];
  colors?: string[];
  height?: number;
  unit?: string;
}) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const step = niceStep(max / 5);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const plot = height - 16;
  const palette = colors ?? sequentialRamp(series.length);
  // Bij veel kolommen alleen de laatste reeks (bijv. het laatste jaar) als tekst; de rest via de tooltip.
  const crowded = groups.length * series.length > 24;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
        {series.map((s, i) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: palette[i] }} />
            {s.name}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[3rem_1fr] gap-1">
        <div className="relative text-right text-[10px] text-neutral-400" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 tabular-nums" style={{ top: height - (t / top) * plot }}>
              {compact(t)}
            </span>
          ))}
        </div>
        <div>
          <div className="relative flex items-end gap-4 border-b border-neutral-300" style={{ height }}>
            {ticks.slice(1).map((t) => (
              <span
                key={t}
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-neutral-200"
                style={{ top: height - (t / top) * plot }}
              />
            ))}
            {groups.map((g, gi) => (
              <div key={g} className="relative flex h-full flex-1 items-end justify-center gap-[2px]">
                {series.map((s, si) => {
                  const v = s.values[gi] ?? 0;
                  return (
                    <div key={s.name} className="group relative flex h-full max-w-6 flex-1 flex-col items-center justify-end">
                      {v > 0 && (!crowded || si === series.length - 1) && (
                        <span className="mb-0.5 text-[9px] leading-none whitespace-nowrap text-neutral-600 tabular-nums">{compact(v)}</span>
                      )}
                      <span className="w-full rounded-t-[4px]" style={{ height: v > 0 ? Math.max((v / top) * plot - 2, 2) : 0, background: palette[si] }} />
                      <Tip>
                        {g} · {s.name}: {v.toLocaleString("nl-NL")}
                        {unit}
                      </Tip>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-4 text-center text-xs text-neutral-600">
            {groups.map((g) => (
              <span key={g} className="line-clamp-2 flex-1 leading-tight" title={g}>
                {g}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Ringgrafiek ("taartgrafiek" met gat): segmenten in de opgegeven (vaste) volgorde, 2px witte naad,
 * totaal in het midden, legenda met waarde en aandeel. Negatieve waarden tellen niet mee in de ring.
 */
export function Donut({
  parts,
  unit = "",
  centerLabel,
  decimals = 0,
  size = 180,
}: {
  parts: { label: string; value: number; color: string }[];
  unit?: string;
  centerLabel?: string;
  decimals?: number;
  size?: number;
}) {
  const pos = parts.filter((p) => p.value > 0);
  const total = pos.reduce((n, p) => n + p.value, 0);
  const fmt = (v: number) => v.toLocaleString("nl-NL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (!total) return <p className="text-sm text-neutral-500">Geen gegevens.</p>;
  const r = 42;
  const w = 16;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-label={`Verdeling: ${pos.map((p) => `${p.label} ${fmt(p.value)}${unit}`).join(", ")}`}
        className="shrink-0"
      >
        <g transform="rotate(-90 50 50)">
          {pos.map((p) => {
            const len = (p.value / total) * C;
            const seg = (
              <circle
                key={p.label}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth={w}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
              >
                <title>{`${p.label}: ${fmt(p.value)} ${unit} (${((p.value / total) * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%)`}</title>
              </circle>
            );
            offset += len;
            return seg;
          })}
          {/* Naden van 2px tussen de segmenten */}
          {pos.length > 1 &&
            pos.reduce<{ at: number; lines: ReactNode[] }>(
              (acc, p, i) => {
                const angle = (acc.at / total) * 2 * Math.PI;
                acc.lines.push(
                  <line
                    key={i}
                    x1={50 + (r - w / 2 - 1) * Math.cos(angle)}
                    y1={50 + (r - w / 2 - 1) * Math.sin(angle)}
                    x2={50 + (r + w / 2 + 1) * Math.cos(angle)}
                    y2={50 + (r + w / 2 + 1) * Math.sin(angle)}
                    stroke="#fff"
                    strokeWidth="1.2"
                  />,
                );
                acc.at += p.value;
                return acc;
              },
              { at: 0, lines: [] },
            ).lines}
        </g>
        <g>
          <text x="50" y="48" textAnchor="middle" className="fill-neutral-900" style={{ fontSize: 11, fontWeight: 700 }}>
            {fmt(total)}
          </text>
          <text x="50" y="60" textAnchor="middle" className="fill-neutral-500" style={{ fontSize: 6 }}>
            {centerLabel ?? unit.trim()}
          </text>
        </g>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-start gap-2 leading-snug">
            <span className="mt-1 inline-block size-3 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden />
            <span className="min-w-0 flex-1 text-neutral-700">{p.label}</span>
            <span className="whitespace-nowrap text-neutral-900 tabular-nums">
              {fmt(p.value)}
              {unit}
            </span>
            <span className="w-12 text-right text-neutral-500 tabular-nums">
              {total ? `${((Math.max(0, p.value) / total) * 100).toLocaleString("nl-NL", { maximumFractionDigits: p.value / total < 0.01 ? 1 : 0 })}%` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
