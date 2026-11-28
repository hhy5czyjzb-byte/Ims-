import Link from "next/link";
import type { ReactNode } from "react";
import { ExportButtons } from "@/components/print-button";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  print = true,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: { href: string; label: string }[];
  /** Knoppen "Afdrukken / PDF", "Excel" en "Word" tonen (standaard op elke pagina). */
  print?: boolean;
}) {
  return (
    <div className="mb-6">
      {breadcrumb && (
        <nav className="mb-2 text-sm text-neutral-500" aria-label="Kruimelpad">
          {breadcrumb.map((b, i) => (
            <span key={b.href}>
              {i > 0 && " / "}
              <Link href={b.href} className="text-neutral-500">
                {b.label}
              </Link>
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-neutral-600">{description}</p>}
        </div>
        {(actions || print) && (
          <div className="flex flex-wrap gap-2 print:hidden">
            {actions}
            {print && <ExportButtons />}
          </div>
        )}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, className, group }: { label: string; children: ReactNode; hint?: string; className?: string; group?: boolean }) {
  // `group` voor samengestelde invoer (bijv. CheckboxPicker): geen <label>, want labels mogen niet genest worden.
  const Tag = group ? "div" : "label";
  return (
    <Tag className={`block ${className ?? ""}`} {...(group ? { role: "group", "aria-label": label } : {})}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </Tag>
  );
}

export function Select({
  name,
  options,
  defaultValue,
  placeholder,
  required,
  className,
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string | null;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} required={required} className={`input ${className ?? ""}`}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`badge ${className ?? "bg-neutral-100 text-neutral-700"}`}>{children}</span>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-neutral-300 bg-white px-6 py-10 text-center text-sm text-neutral-500">{children}</div>;
}

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "default" | "alert" | "ok";
}) {
  const toneClass = tone === "alert" ? "text-brand-red" : tone === "ok" ? "text-green-700" : "text-neutral-900";
  const body = (
    <div className="card h-full transition hover:border-neutral-300">
      <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-500">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block text-inherit no-underline hover:no-underline">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Voortgangsbalk; kleur naar percentage, of expliciet met `tone` (bijv. op koers = good, ook als het doel nog ver weg is). */
export function ProgressBar({ value, tone }: { value: number; tone?: "good" | "warn" | "bad" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const t = tone ?? (pct >= 80 ? "good" : pct >= 50 ? "warn" : "bad");
  const color = t === "good" ? "bg-green-600" : t === "warn" ? "bg-amber-500" : "bg-brand-red";
  return (
    <div className="flex items-center gap-2" title={`${pct}%`}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-neutral-600">{pct}%</span>
    </div>
  );
}

/** Uitklapbaar formulier zonder JavaScript (details/summary). */
export function Disclosure({ summary, children, open, compact }: { summary: ReactNode; children: ReactNode; open?: boolean; compact?: boolean }) {
  if (compact) {
    // Klein tekstlinkje (bijv. "Wijzigen" in een tabelregel); het formulier klapt eronder uit.
    return (
      <details className="group" open={open}>
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-neutral-500 select-none hover:text-brand-red-dark">
          <span className="inline-block transition group-open:rotate-90">▸</span>
          {summary}
        </summary>
        <div className="mt-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">{children}</div>
      </details>
    );
  }
  return (
    <details className="group card" open={open}>
      <summary className="cursor-pointer list-none font-medium text-brand-red-dark select-none">
        <span className="mr-1 inline-block transition group-open:rotate-90">▸</span>
        {summary}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

/** Paginanavigatie onder een lange lijst; behoudt de filters in de URL. */
export function Pager({
  total,
  paging,
  params,
}: {
  total: number;
  paging: { page: number; pages: number; all: boolean; from: number; to: number };
  params: Record<string, string | undefined>;
}) {
  if (paging.pages <= 1) return null;
  const href = (pagina: string | undefined) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "pagina") q.set(k, v);
    if (pagina) q.set("pagina", pagina);
    const s = q.toString();
    return s ? `?${s}` : "?";
  };
  const nums = Array.from({ length: paging.pages }, (_, i) => i + 1);
  return (
    <nav className="mt-3 flex flex-wrap items-center gap-1 text-sm print:hidden" aria-label="Pagina's">
      <span className="mr-2 text-neutral-500">
        {paging.from}–{paging.to} van {total}
      </span>
      {nums.map((n) => (
        <a
          key={n}
          href={href(n === 1 ? undefined : String(n))}
          aria-current={n === paging.page ? "page" : undefined}
          className={`rounded px-2 py-1 no-underline hover:no-underline ${n === paging.page ? "bg-brand-red text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
        >
          {n}
        </a>
      ))}
      <a href={href(paging.all ? undefined : "alle")} className="ml-2 text-xs">
        {paging.all ? "Per 100 tonen" : "Alles tonen"}
      </a>
    </nav>
  );
}
