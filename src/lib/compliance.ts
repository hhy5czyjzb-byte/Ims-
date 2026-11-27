import type { ComplianceStatus } from "@prisma/client";

/** Code van een wettelijke eis, bijv. W-012. */
export function legalCode(number: number): string {
  return `W-${String(number).padStart(3, "0")}`;
}

/** Volgende toetsdatum: laatste toetsing + interval in maanden (einde maand afgekapt, bijv. 31 jan + 1 = 28/29 feb). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return d;
}

/** Statussen die meetellen voor de compliancegraad (n.v.t. telt niet mee). */
export function complianceSummary(statuses: ComplianceStatus[]) {
  const count = (s: ComplianceStatus) => statuses.filter((x) => x === s).length;
  const compliant = count("COMPLIANT");
  const partial = count("PARTIAL");
  const nonCompliant = count("NON_COMPLIANT");
  const notAssessed = count("NOT_ASSESSED");
  const notApplicable = count("NOT_APPLICABLE");
  const relevant = compliant + partial + nonCompliant + notAssessed;
  return { compliant, partial, nonCompliant, notAssessed, notApplicable, relevant, pct: relevant ? (compliant / relevant) * 100 : 0 };
}

/** Statussen waarbij een actie nodig is. */
export function needsAction(status: ComplianceStatus): boolean {
  return status === "NON_COMPLIANT" || status === "PARTIAL";
}
