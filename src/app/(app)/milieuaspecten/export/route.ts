import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { ASPECT_TYPE_LABEL, SITUATION_LABEL } from "@/lib/labels";
import { aspectCode } from "@/lib/aspects";
import { aspectWhere, type AspectSearch } from "@/lib/aspect-filters";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";

/** Export van het milieuaspectenregister als CSV, met dezelfde filters als het overzicht. Kolommen sluiten aan op de import. */
export async function GET(request: Request) {
  const user = await requireUser();
  const sp = Object.fromEntries(new URL(request.url).searchParams) as AspectSearch;
  const aspects = await prisma.environmentalAspect.findMany({
    where: aspectWhere(sp, user.id),
    orderBy: [{ activity: "asc" }, { number: "asc" }],
    include: {
      owner: { select: { name: true } },
      discipline: { select: { name: true } },
      location: { select: { name: true } },
      legalRequirements: { select: { title: true, article: true } },
      processes: { select: { name: true } },
    },
  });
  const yn = (b: boolean) => (b ? "ja" : "nee");
  const header = [
    "Code",
    "Kenmerk",
    "Activiteit",
    "Milieuaspect",
    "Type aspect",
    "Milieueffect",
    "Situatie",
    "Discipline",
    "Locatie",
    "Eigenaar",
    "Beheersmaatregelen",
    "Frequentie",
    "Ernst",
    "Omvang",
    "Score",
    "Significant",
    "Handmatig bepaald",
    "Toelichting significantie",
    "Bindende verplichting",
    "Zorgen belanghebbenden",
    "CO2-relevant",
    "Wet- en regelgeving",
    "Processen",
    "Volgende beoordeling",
  ];
  const rows = aspects.map((a) => [
    aspectCode(a.number),
    a.externalRef,
    a.activity,
    a.aspect,
    ASPECT_TYPE_LABEL[a.aspectType],
    a.impact,
    SITUATION_LABEL[a.situation],
    a.discipline?.name ?? "",
    a.location?.name ?? "",
    a.owner?.name ?? "",
    a.controls,
    a.frequency,
    a.severity,
    a.extent,
    a.score,
    yn(a.significant),
    yn(a.significanceManual),
    a.significanceReason,
    yn(a.legalApplies || a.legalRequirements.length > 0),
    yn(a.stakeholderConcern),
    yn(a.co2Relevant),
    a.legalRequirements.map((l) => `${l.title}${l.article ? ` ${l.article}` : ""}`).join(", "),
    a.processes.map((p) => p.name).join(", "),
    a.reviewDate ? formatDate(a.reviewDate) : "",
  ]);
  await logAudit({ user, action: "VIEW", entityType: "EnvironmentalAspect", summary: `Milieuaspectenregister geëxporteerd (${aspects.length} regels)` });
  return csvResponse(toCsv([header, ...rows]), `milieuaspectenregister-${new Date().toISOString().slice(0, 10)}.csv`);
}
