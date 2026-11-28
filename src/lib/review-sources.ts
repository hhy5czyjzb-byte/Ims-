import { prisma } from "@/lib/db";
import { REVIEW_THEME as T, type Cell, type SlideElement } from "@/lib/review-model";
import { yearlyTotals } from "@/lib/co2-data";
import { complianceSummary, legalDisplayCode } from "@/lib/compliance";
import { residual, riskDisplayCode, riskLevel } from "@/lib/risk";
import { findingCode, auditCode } from "@/lib/audit-plan";
import { actionOrigin } from "@/lib/action-origin";
import { actionOriginInclude } from "@/lib/action-filters";
import { formatDate } from "@/lib/format";
import { REPORT_GROUPS } from "@/lib/reports";
import {
  ACTION_STATUS_LABEL,
  COMPLIANCE_STATUS_LABEL,
  FINDING_CLASS_SHORT,
  FINDING_STATUS_LABEL,
  REPORT_TYPE_LABEL,
  TREATMENT_STATUS_LABEL,
  OBJECTIVE_STATUS_LABEL,
} from "@/lib/labels";

/**
 * Cijfers uit het IMS voor de directiebeoordeling. Elk element met `source` wordt bij "Cijfers bijwerken uit IMS"
 * opnieuw gevuld (alleen de gegevens; positie, maat en eigen titels blijven).
 */

export const SOURCE_LABEL: Record<string, string> = {
  "co2-years": "CO2-uitstoot per jaar",
  "actions-open": "Openstaande acties",
  "risks-top": "Belangrijkste risico's en kansen",
  "reports-year": "Ongevallen en incidenten per soort",
  "reports-total": "Aantal ongevallen en incidenten",
  "audit-findings": "Auditbevindingen",
  "legal-open": "Wettelijke eisen die niet voldoen",
  "kpi-actions-overdue": "Acties te laat",
  "kpi-compliance": "Compliancegraad",
  "kpi-reports": "Ongevallen en incidenten in het jaar",
  "kpi-absence": "Ongevallen met verzuim",
  "objectives-status": "Doelstellingen met status",
  "objectives-smart": "Doelstellingen (SMART)",
  "kpi-objectives": "Doelstellingen op koers of behaald",
  "kpi-co2": "CO2 t.o.v. vorig jaar",
};

const INCIDENT_TYPES = REPORT_GROUPS.find((g) => g.key === "incidenten")!.types;
const yearRange = (year: number) => ({ gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) });
const nl = (v: number, d = 0) => v.toLocaleString("nl-NL", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v: number, sign = true) => `${sign && v > 0 ? "+" : v < 0 ? "−" : ""}${nl(Math.abs(v), 1)}%`;
const greyRamp = (n: number) => Array.from({ length: n }, (_, i) => (i === n - 1 ? T.redDark : i === n - 2 ? "8C8C8C" : "C9C9C9"));
const status = (text: string, color: string): Cell => ({ text: `● ${text}`, bold: true, color });

type Ctx = { year: number; cache: Map<string, unknown> };

async function cached<V>(ctx: Ctx, key: string, fn: () => Promise<V>): Promise<V> {
  if (!ctx.cache.has(key)) ctx.cache.set(key, await fn());
  return ctx.cache.get(key) as V;
}

const co2 = (ctx: Ctx) => cached(ctx, "co2", () => yearlyTotals(ctx.year - 6, ctx.year));

async function tableRows(source: string, ctx: Ctx, max: number): Promise<Cell[][] | null> {
  if (source === "actions-open") {
    const now = new Date();
    const list = await prisma.action.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { number: "asc" }],
      take: max,
      include: { owner: { select: { name: true } }, ...actionOriginInclude },
    });
    return list.map((a) => [
      { text: `#${a.number} ${a.title}` },
      { text: actionOrigin(a)?.code ?? "—" },
      { text: a.owner?.name ?? a.ownerText ?? "—" },
      a.deadline && a.deadline < now
        ? { text: formatDate(a.deadline), bold: true, color: T.redDark }
        : { text: a.deadline ? formatDate(a.deadline) : ACTION_STATUS_LABEL[a.status] },
    ]);
  }
  if (source === "risks-top") {
    const risks = await prisma.risk.findMany({ where: { status: { not: "CLOSED" } }, orderBy: { number: "asc" } });
    const scored = risks
      .map((r) => ({ r, score: residual(r).score }))
      .filter(({ r, score }) => r.strategic || riskLevel(score) === "high")
      .sort((a, b) => Number(b.r.strategic) - Number(a.r.strategic) || b.score - a.score)
      .slice(0, max);
    return scored.map(({ r }) => [
      { text: `${riskDisplayCode(r)} ${r.title}` },
      r.type === "OPPORTUNITY" ? status("Kans", T.green) : status("Risico", T.redDark),
      { text: [r.measures?.split("\n")[0], TREATMENT_STATUS_LABEL[r.treatmentStatus]].filter(Boolean).join(" · ") },
    ]);
  }
  if (source === "audit-findings") {
    const findings = await prisma.auditFinding.findMany({
      where: { audit: { plannedDate: yearRange(ctx.year) } },
      include: { audit: { select: { number: true, title: true } } },
      orderBy: [{ audit: { number: "asc" } }, { number: "asc" }],
      take: max,
    });
    return findings.map((f) => [
      { text: `${auditCode(f.audit.number)} ${f.audit.title}` },
      { text: `${findingCode(f.audit.number, f.number)} ${f.description}`.slice(0, 160) },
      { text: FINDING_CLASS_SHORT[f.classification], bold: f.classification === "MAJOR", color: f.classification === "MAJOR" ? T.redDark : undefined },
      f.status === "CLOSED" ? status(FINDING_STATUS_LABEL[f.status], T.green) : status(FINDING_STATUS_LABEL[f.status], T.amber),
    ]);
  }
  if (source === "objectives-status" || source === "objectives-smart") {
    const list = await prisma.objective.findMany({
      where: { active: true, status: { not: "CANCELLED" } },
      orderBy: [{ category: "asc" }, { number: "asc" }],
      take: max,
      include: { owner: { select: { name: true } }, reviews: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1 } },
    });
    const color = (s: string) =>
      ["ACHIEVED", "ON_TRACK"].includes(s)
        ? T.green
        : ["PARTIAL", "AT_RISK"].includes(s)
          ? T.amber
          : ["OFF_TRACK", "NOT_ACHIEVED"].includes(s)
            ? T.redDark
            : T.faint;
    if (source === "objectives-status")
      return list.map((o) => [{ text: o.title }, status(OBJECTIVE_STATUS_LABEL[o.status], color(o.status)), { text: o.reviews[0]?.explanation ?? "" }]);
    return list.map((o) => [
      { text: o.title },
      { text: [o.indicator, [o.baselineText, o.targetText].filter(Boolean).join(" → ")].filter(Boolean).join(": ") },
      { text: o.owner?.name ?? o.ownerText ?? "" },
      { text: o.deadline ? formatDate(o.deadline) : (o.termText ?? "") },
    ]);
  }
  if (source === "legal-open") {
    const reqs = await prisma.legalRequirement.findMany({
      where: { active: true, status: { in: ["NON_COMPLIANT", "PARTIAL"] } },
      orderBy: [{ status: "asc" }, { number: "asc" }],
      take: max,
    });
    return reqs.map((r) => [
      { text: `${legalDisplayCode(r)} ${r.title}${r.article ? ` (${r.article})` : ""}` },
      r.status === "NON_COMPLIANT" ? status(COMPLIANCE_STATUS_LABEL[r.status], T.redDark) : status(COMPLIANCE_STATUS_LABEL[r.status], T.amber),
      { text: r.nextStep ?? r.explanation ?? "" },
    ]);
  }
  return null;
}

/** Element opnieuw vullen uit het IMS; geeft het element ongewijzigd terug als de bron onbekend is. */
export async function refreshElement(e: SlideElement, ctx: Ctx): Promise<SlideElement> {
  const source = "source" in e ? e.source : undefined;
  if (!source) return e;
  const y = ctx.year;

  if (e.type === "chart") {
    if (source === "co2-years") {
      const rows = (await co2(ctx)).filter((r) => r.kg > 0);
      return {
        ...e,
        kind: "col",
        categories: rows.map((r) => String(r.year)),
        series: [{ name: "ton CO2", values: rows.map((r) => Math.round(r.kg / 1000)) }],
        colors: greyRamp(rows.length),
        decimals: 0,
        title: e.title ?? "ton CO2",
      };
    }
    if (source === "reports-year") {
      const groups = await prisma.report.groupBy({ by: ["type"], where: { occurredAt: yearRange(y), type: { in: INCIDENT_TYPES } }, _count: true });
      const sorted = groups.sort((a, b) => a._count - b._count);
      return {
        ...e,
        kind: "bar",
        categories: sorted.map((g) => REPORT_TYPE_LABEL[g.type]),
        series: [{ name: `Ongevallen en incidenten ${y}`, values: sorted.map((g) => g._count) }],
        colors: sorted.map(() => T.redDark),
        decimals: 0,
        title: `Ongevallen en incidenten per soort (${y})`,
      };
    }
  }

  if (e.type === "table") {
    const max = Math.max(e.rows.length, 6);
    const rows = await tableRows(source, ctx, Math.min(max, 14));
    if (rows) return { ...e, rows: rows.map((r) => e.colW.map((_, i) => r[i] ?? { text: "" })) };
  }

  if (e.type === "kpi") {
    if (source === "reports-total" || source === "kpi-reports") {
      const [n, prev] = await Promise.all([
        prisma.report.count({ where: { occurredAt: yearRange(y), type: { in: INCIDENT_TYPES } } }),
        prisma.report.count({ where: { occurredAt: yearRange(y - 1), type: { in: INCIDENT_TYPES } } }),
      ]);
      const change = prev ? ((n - prev) / prev) * 100 : null;
      return { ...e, value: nl(n), label: `ongevallen en incidenten ${y}${change !== null ? ` (${pct(change)} t.o.v. ${y - 1})` : ""}`, color: T.ink };
    }
    if (source === "kpi-objectives") {
      const list = await prisma.objective.findMany({ where: { active: true, status: { notIn: ["CANCELLED", "NOT_ASSESSED"] } }, select: { status: true } });
      const good = list.filter((o) => o.status === "ON_TRACK" || o.status === "ACHIEVED").length;
      const p = list.length ? Math.round((good / list.length) * 100) : 0;
      return {
        ...e,
        value: list.length ? `${p}%` : "—",
        label: `doelstellingen op koers of behaald (${good} van ${list.length})`,
        color: p >= 80 ? T.green : p >= 60 ? T.amber : T.redDark,
      };
    }
    if (source === "kpi-absence") {
      const rows = await prisma.report.groupBy({ by: ["absence"], where: { occurredAt: yearRange(y), absence: { not: null } }, _count: true });
      const short = rows.find((r) => r.absence === "SHORT")?._count ?? 0;
      const long = rows.find((r) => r.absence === "LONG")?._count ?? 0;
      return {
        ...e,
        value: nl(short + long),
        label: `met verzuim ${y}: ${short}× 1–15 dagen, ${long}× meer dan 15 dagen`,
        color: long ? T.redDark : short ? T.amber : T.green,
      };
    }
    if (source === "kpi-actions-overdue") {
      const now = new Date();
      const [open, overdue] = await Promise.all([
        prisma.action.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
        prisma.action.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, deadline: { lt: now } } }),
      ]);
      return { ...e, value: nl(overdue), label: `van ${nl(open)} openstaande acties te laat`, color: overdue ? T.redDark : T.green };
    }
    if (source === "kpi-compliance") {
      const reqs = await prisma.legalRequirement.findMany({ where: { active: true }, select: { status: true } });
      const s = complianceSummary(reqs.map((r) => r.status));
      return {
        ...e,
        value: `${nl(s.pct, 0)}%`,
        label: `wettelijke eisen voldoet (${s.nonCompliant} voldoet niet)`,
        color: s.pct >= 90 ? T.green : s.pct >= 70 ? T.amber : T.redDark,
      };
    }
    if (source === "kpi-co2") {
      const rows = await co2(ctx);
      const cur = rows.find((r) => r.year === y)?.kg ?? 0;
      const prev = rows.find((r) => r.year === y - 1)?.kg ?? 0;
      if (!cur || !prev) return { ...e, value: "—", label: `CO2-uitstoot ${y} t.o.v. ${y - 1} (nog geen gegevens)`, color: T.faint };
      const change = ((cur - prev) / prev) * 100;
      return { ...e, value: pct(change), label: `CO2-uitstoot ${y} t.o.v. ${y - 1}`, color: change <= 0 ? T.green : T.redDark };
    }
  }
  return e;
}

/** Alle elementen met een bron in een lijst bijwerken. */
export async function refreshElements(
  elements: SlideElement[],
  year: number,
  cache = new Map<string, unknown>(),
): Promise<{ elements: SlideElement[]; changed: number }> {
  const ctx = { year, cache };
  let changed = 0;
  const out: SlideElement[] = [];
  for (const e of elements) {
    const next = await refreshElement(e, ctx);
    if (next !== e) changed++;
    out.push(next);
  }
  return { elements: out, changed };
}
