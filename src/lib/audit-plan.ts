import type { AuditStatus, ChecklistResult } from "@prisma/client";

/** Auditcode, bijv. AU-007. */
export function auditCode(number: number): string {
  return `AU-${String(number).padStart(3, "0")}`;
}

/** Bevindingscode binnen een audit, bijv. AU-007/2. */
export function findingCode(auditNumber: number, findingNumber: number): string {
  return `${auditCode(auditNumber)}/${findingNumber}`;
}

/** Een certificatiecyclus duurt 3 jaar (certificatie-audit + 2 controle-audits). */
export const CYCLE_YEARS = 3;

export type CycleCellState = "assessed" | "planned" | "none";

export type ChecklistHit = {
  result: ChecklistResult;
  audit: { id: string; number: number; status: AuditStatus; plannedDate: Date; completedDate: Date | null };
};

/**
 * Per normeis en per cyclusjaar: is de eis getoetst (afgeronde audit met een
 * resultaat), alleen gepland (geplande/lopende audit), of niet afgedekt?
 * Geannuleerde audits tellen niet mee.
 */
export function cycleCell(hits: ChecklistHit[], year: number): { state: CycleCellState; audits: ChecklistHit["audit"][] } {
  const inYear = hits.filter((h) => h.audit.status !== "CANCELLED" && (h.audit.completedDate ?? h.audit.plannedDate).getUTCFullYear() === year);
  const assessed = inYear.filter((h) => h.audit.status === "COMPLETED" && h.result !== "NOT_ASSESSED");
  if (assessed.length) return { state: "assessed", audits: unique(assessed.map((h) => h.audit)) };
  const planned = inYear.filter((h) => h.audit.status === "PLANNED" || h.audit.status === "IN_PROGRESS" || h.result === "NOT_ASSESSED");
  if (planned.length) return { state: "planned", audits: unique(planned.map((h) => h.audit)) };
  return { state: "none", audits: [] };
}

/** Samenvatting over de hele cyclus: aantal eisen getoetst, gepland en niet afgedekt. */
export function cycleSummary(rows: ChecklistHit[][], startYear: number) {
  let assessed = 0;
  let planned = 0;
  for (const hits of rows) {
    const states = Array.from({ length: CYCLE_YEARS }, (_, i) => cycleCell(hits, startYear + i).state);
    if (states.includes("assessed")) assessed++;
    else if (states.includes("planned")) planned++;
  }
  const total = rows.length;
  return { total, assessed, planned, uncovered: total - assessed - planned, pct: total ? (assessed / total) * 100 : 0 };
}

function unique<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((i) => [i.id, i])).values()];
}
