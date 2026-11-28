import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { aspectCode, aspectRisk, aspectRiskLevel, ASPECT_RISK_LEVEL_LABEL, PRIORITY_SIGNAL_LABEL, prioritySignal } from "@/lib/aspects";
import { aspectMatches, aspectWhere, type AspectSearch } from "@/lib/aspect-filters";
import { ASPECT_PRIORITY_SHORT, ASPECT_SITE_TYPE_LABEL } from "@/lib/labels";
import { legalDisplayCode } from "@/lib/compliance";
import { riskDisplayCode } from "@/lib/risk";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";

const dec = (v: unknown) => (v === null || v === undefined ? "" : Number(String(v)).toLocaleString("nl-NL", { maximumFractionDigits: 2 }));
const yn = (b: boolean) => (b ? "Ja" : "Nee");

/** Export in de kolommen van het milieuaspectenregister (MAR), direct weer te importeren; met dezelfde filters als het overzicht. */
export async function GET(request: Request) {
  const user = await requireUser();
  const sp = Object.fromEntries(new URL(request.url).searchParams) as AspectSearch;
  const rows = await prisma.environmentalAspect.findMany({
    where: aspectWhere(sp, user.id),
    orderBy: [{ externalRef: { sort: "asc", nulls: "last" } }, { number: "asc" }],
    include: {
      owner: { select: { name: true } },
      legalRequirements: { select: { number: true, externalRef: true } },
      risks: { select: { number: true, type: true, externalRef: true } },
      processes: { select: { name: true } },
      requirements: { select: { clause: true, norm: { select: { code: true } } } },
      _count: { select: { actions: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } },
    },
  });
  const aspects = rows.filter((a) => aspectMatches(sp, a));
  const header = [
    "Nr.",
    "Bedrijfsonderdeel",
    "Locatie",
    "Type",
    "Status locatie",
    "Activiteit",
    "MBA (Bal)",
    "Milieuthema",
    "Milieuaspect",
    "Milieueffect",
    "Contextfactor",
    "Wettelijke eis",
    "Wet- en regelgeving",
    "Register nr.",
    "Risico- en kansenregister",
    "Stakeholders",
    "Klachten",
    "Voorzieningen",
    "Effect",
    "Voorkomen",
    "Waarschijnlijkheid",
    "Risico",
    "Risiconiveau",
    "Kans of bedreiging",
    "Prio",
    "Signaal prio en risico",
    "Onderbouwing prio",
    "Grondstofwinning",
    "Ontwerp",
    "Productie",
    "Transport",
    "Gebruik",
    "Einde levensduur",
    "Definitieve verwijdering",
    "Bron levenscyclus",
    "Maatregel",
    "Eigenaar",
    "Herkomst",
    "Code IMS",
    "Significant",
    "CO2-relevant",
    "Processen",
    "Normeisen",
    "Open acties",
    "Volgende beoordeling",
    "Actief",
  ];
  const data = aspects.map((a) => {
    const risk = aspectRisk(a.effectScore, a.exposure, a.probability);
    const level = aspectRiskLevel(risk);
    const signal = prioritySignal({ priority: a.priority, risk, opportunity: a.opportunity });
    return [
      a.externalRef,
      a.businessUnit,
      a.locationText,
      ASPECT_SITE_TYPE_LABEL[a.siteType],
      a.inOperation ? "In werking" : "Tijdelijk niet in werking",
      a.activity,
      a.mba,
      a.theme,
      a.aspect,
      a.impact,
      a.contextFactor,
      yn(a.legalApplies),
      a.legalText,
      a.legalRequirements
        .map((l) => legalDisplayCode(l))
        .sort()
        .join(", "),
      a.risks
        .map((r) => riskDisplayCode(r))
        .sort()
        .join(", "),
      a.stakeholders,
      yn(a.complaints),
      a.controls,
      dec(a.effectScore),
      dec(a.exposure),
      dec(a.probability),
      risk === null ? "" : dec(risk),
      level ? ASPECT_RISK_LEVEL_LABEL[level] : "",
      a.opportunity ? "Kans" : "Bedreiging",
      a.priority ? ASPECT_PRIORITY_SHORT[a.priority] : "",
      signal ? PRIORITY_SIGNAL_LABEL[signal] : "",
      a.priorityRationale,
      a.lcRawMaterials,
      a.lcDesign,
      a.lcProduction,
      a.lcTransport,
      a.lcUse,
      a.lcEndOfLife,
      a.lcDisposal,
      a.lifecycleSource,
      a.measure,
      a.ownerText ?? a.owner?.name ?? "",
      a.origin,
      aspectCode(a.number),
      yn(a.significant),
      yn(a.co2Relevant),
      a.processes.map((p) => p.name).join(", "),
      a.requirements.map((r) => `${r.norm.code} ${r.clause}`).join(", "),
      a._count.actions,
      a.reviewDate ? formatDate(a.reviewDate) : "",
      a.active ? "ja" : "nee",
    ];
  });
  await logAudit({ user, action: "VIEW", entityType: "EnvironmentalAspect", summary: `Milieuaspectenregister geëxporteerd (${aspects.length} regels)` });
  return csvResponse(toCsv([header, ...data]), `milieuaspectenregister-${new Date().toISOString().slice(0, 10)}.csv`);
}
