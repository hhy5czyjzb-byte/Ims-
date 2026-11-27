import type { AuditStatus, ComplianceStatus, Role } from "@prisma/client";
import { can } from "@/lib/rbac";
import { normText, type ImportField } from "@/lib/spreadsheet-import";

/** Code van een compliance-audit per vestiging: CA-001. */
export function locationAuditCode(number: number): string {
  return `CA-${String(number).padStart(3, "0")}`;
}

export type LocationAuditScore = {
  total: number;
  assessed: number;
  compliant: number;
  partial: number;
  nonCompliant: number;
  notApplicable: number;
  /** Voldoet / (beoordeeld zonder n.v.t.), 0–100; null als er nog niets relevants is beoordeeld. */
  pct: number | null;
};

/** Score zoals in het register van Rouwmaat: voldoet gedeeld door alle beoordeelde vragen, zonder n.v.t. */
export function locationAuditScore(verdicts: ComplianceStatus[]): LocationAuditScore {
  const count = (s: ComplianceStatus) => verdicts.filter((v) => v === s).length;
  const compliant = count("COMPLIANT");
  const partial = count("PARTIAL");
  const nonCompliant = count("NON_COMPLIANT");
  const notApplicable = count("NOT_APPLICABLE");
  const assessed = verdicts.length - count("NOT_ASSESSED");
  const relevant = assessed - notApplicable;
  return {
    total: verdicts.length,
    assessed,
    compliant,
    partial,
    nonCompliant,
    notApplicable,
    pct: relevant > 0 ? Math.round((compliant / relevant) * 1000) / 10 : null,
  };
}

export type ScoreBand = "good" | "fair" | "poor" | "none";

/** Groen vanaf 90%, geel vanaf 70%, anders rood. */
export function scoreBand(pct: number | null): ScoreBand {
  if (pct === null) return "none";
  if (pct >= 90) return "good";
  if (pct >= 70) return "fair";
  return "poor";
}

export const SCORE_BAND_CLASS: Record<ScoreBand, string> = {
  good: "bg-green-100 text-green-800",
  fair: "bg-amber-100 text-amber-800",
  poor: "bg-red-100 text-brand-red-dark",
  none: "bg-neutral-100 text-neutral-500",
};

/** Mag de gebruiker de checklist invullen? QHSE altijd (zolang niet afgerond/geannuleerd); anders alleen de aangewezen auditor. */
export function canFillLocationAudit(user: { id: string; role: Role }, audit: { status: AuditStatus; auditorId: string | null }): boolean {
  if (audit.status === "COMPLETED" || audit.status === "CANCELLED") return false;
  if (can(user.role, "legal.edit")) return true;
  return audit.auditorId === user.id;
}

/** Redenen waarom een audit nog niet kan worden afgerond (leeg = mag). */
export function completionProblems(answers: { verdict: ComplianceStatus; actionCount: number }[]): string[] {
  const problems: string[] = [];
  if (answers.length === 0) problems.push("De checklist is leeg.");
  const open = answers.filter((a) => a.verdict === "NOT_ASSESSED").length;
  if (open) problems.push(`${open} vraag/vragen nog niet beoordeeld.`);
  const noAction = answers.filter((a) => a.verdict === "NON_COMPLIANT" && a.actionCount === 0).length;
  if (noAction) problems.push(`${noAction} vraag/vragen met 'voldoet niet' zonder actie.`);
  return problems;
}

/** Sleutel om dezelfde auditvraag te herkennen (nummer wettelijke eis + vraagtekst). */
export function questionKey(ref: string | null | undefined, question: string): string {
  return `${normText(ref ?? "")}|${normText(question)}`;
}

/** Import van het tabblad "Compliance-audit" (vragen, en eventueel ingevulde oordelen per vestiging). */
export const LOCATION_AUDIT_IMPORT_FIELDS: ImportField[] = [
  { key: "location", label: "Vestiging", hints: ["vestiging", "locatie"] },
  { key: "legalRef", label: "Nr. wettelijke eis (bijv. W005)", hints: ["nr", "nummer", "kenmerk", "wet nr"] },
  { key: "obligation", label: "Verplichting (ter controle)", hints: ["verplichting", "wet of regelgeving", "wet"] },
  { key: "theme", label: "Thema", hints: ["thema"] },
  { key: "question", label: "Auditvraag", required: true, hints: ["auditvraag", "vraag", "controlevraag"] },
  { key: "evidenceHint", label: "Bewijs om te bekijken", hints: ["bewijs om te bekijken", "bewijs", "bewijslast"] },
  { key: "verdict", label: "Oordeel", preview: "legalStatus", hints: ["oordeel", "uitkomst", "beoordeling"] },
  { key: "finding", label: "Bevinding", hints: ["bevinding", "toelichting", "opmerking"] },
  { key: "action", label: "Actie", hints: ["actie", "maatregel"] },
  { key: "actionOwner", label: "Eigenaar actie", hints: ["eigenaar actie", "eigenaar", "actiehouder"] },
  { key: "actionDue", label: "Termijn (datum)", kind: "date", hints: ["termijn", "deadline", "uiterlijk"] },
  { key: "auditDate", label: "Datum audit", kind: "date", hints: ["datum audit", "auditdatum", "datum"] },
  { key: "auditor", label: "Auditor", hints: ["auditor", "uitgevoerd door"] },
];
