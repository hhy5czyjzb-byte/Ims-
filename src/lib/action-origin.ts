import type { RiskType } from "@prisma/client";
import { findingCode } from "@/lib/audit-plan";
import { legalDisplayCode } from "@/lib/compliance";
import { aspectDisplayCode } from "@/lib/aspects";
import { riskDisplayCode } from "@/lib/risk";
import { reportDisplayCode } from "@/lib/reports";
import { locationAuditCode } from "@/lib/location-audit";

type WithOrigin = {
  report?: { id: string; number: number; externalRef: string | null } | null;
  finding?: { id: string; number: number; auditId: string; audit: { number: number } } | null;
  risk?: { id: string; number: number; externalRef: string | null; type: RiskType } | null;
  legalRequirement?: { id: string; number: number; externalRef: string | null } | null;
  environmentalAspect?: { id: string; number: number; externalRef: string | null } | null;
  reductionTarget?: { id: string; title: string } | null;
  locationAuditAnswer?: { auditId: string; audit: { number: number } } | null;
};

/** Waar komt een actie vandaan? Code + link naar de herkomst (melding, auditbevinding, risico, …). */
export function actionOrigin(a: WithOrigin): { code: string; href: string } | null {
  if (a.report) return { code: reportDisplayCode(a.report), href: `/meldingen/${a.report.id}` };
  if (a.finding) return { code: findingCode(a.finding.audit.number, a.finding.number), href: `/audits/${a.finding.auditId}/bevindingen/${a.finding.id}` };
  if (a.locationAuditAnswer)
    return { code: locationAuditCode(a.locationAuditAnswer.audit.number), href: `/wetgeving/vestigingen/${a.locationAuditAnswer.auditId}` };
  if (a.risk) return { code: riskDisplayCode(a.risk), href: `/risicos/${a.risk.id}` };
  if (a.legalRequirement) return { code: legalDisplayCode(a.legalRequirement), href: `/wetgeving/${a.legalRequirement.id}` };
  if (a.environmentalAspect) return { code: aspectDisplayCode(a.environmentalAspect), href: `/milieuaspecten/${a.environmentalAspect.id}` };
  if (a.reductionTarget) return { code: a.reductionTarget.title, href: `/co2/doelstellingen/${a.reductionTarget.id}` };
  return null;
}
