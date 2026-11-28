import { prisma } from "@/lib/db";
import { brand } from "@/theme/brand";
import { BarList, ChartCard, Columns, SegmentBar } from "@/components/charts";
import { residual, riskLevel, riskScore } from "@/lib/risk";
import { aspectRisk, aspectRiskLevel } from "@/lib/aspects";
import { getNormCoverage } from "@/lib/coverage";
import { ASPECT_PRIORITY_LABEL, FINDING_CLASS_SHORT, RISK_CATEGORY_LABEL, TREATMENT_STATUS_LABEL } from "@/lib/labels";

/**
 * Grafieken bovenaan de registers (server components). Status- en niveaukleuren volgen de huisstijl
 * (groen/geel/rood); tellingen en categorieën gebruiken het categorische palet uit charts.tsx.
 */

const STATUS = { good: "#3fa34d", warn: "#f2c12e", bad: "#e30613", none: "#a3a3a3", info: "#257de0" };

function countBy<T>(rows: T[], key: (r: T) => string | null | undefined, limit = 8, empty = "Niet ingevuld") {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r)?.trim() || empty;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export async function RiskCharts() {
  const risks = await prisma.risk.findMany({
    where: { status: { not: "CLOSED" } },
    select: {
      type: true,
      category: true,
      treatmentStatus: true,
      theme: true,
      likelihoodBefore: true,
      impactBefore: true,
      likelihoodAfter: true,
      impactAfter: true,
    },
  });
  const onlyRisks = risks.filter((r) => r.type === "RISK");
  const level = (rows: typeof risks, net: boolean) => {
    const c = { low: 0, medium: 0, high: 0 };
    for (const r of rows) c[riskLevel(net ? residual(r).score : riskScore(r.likelihoodBefore, r.impactBefore))]++;
    return c;
  };
  const before = level(onlyRisks, false);
  const after = level(onlyRisks, true);
  const parts = (c: { low: number; medium: number; high: number }) => [
    { label: "Hoog", value: c.high, color: brand.riskColors.high },
    { label: "Midden", value: c.medium, color: brand.riskColors.medium },
    { label: "Laag", value: c.low, color: brand.riskColors.low },
  ];
  return (
    <Grid>
      <ChartCard title="Risico's: bruto niveau" subtitle={`${onlyRisks.length} lopende risico's, vóór maatregelen`}>
        <SegmentBar parts={parts(before)} />
      </ChartCard>
      <ChartCard title="Risico's: restrisico" subtitle="Na maatregelen (of bruto als 'na' ontbreekt)">
        <SegmentBar parts={parts(after)} />
      </ChartCard>
      <ChartCard title="Per categorie" subtitle="Risico's en kansen">
        <BarList items={countBy(risks, (r) => RISK_CATEGORY_LABEL[r.category])} />
      </ChartCard>
      <ChartCard title="Aanpakstatus">
        <BarList items={countBy(risks, (r) => TREATMENT_STATUS_LABEL[r.treatmentStatus])} />
      </ChartCard>
    </Grid>
  );
}

export async function LegalCharts() {
  const now = new Date();
  const reqs = await prisma.legalRequirement.findMany({
    where: { active: true, applicability: { not: "NO" } },
    select: { status: true, theme: true, nextReviewDate: true, implementationStatus: true },
  });
  const c = (s: string) => reqs.filter((r) => r.status === s).length;
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    return {
      y: d.getUTCFullYear(),
      m: d.getUTCMonth(),
      label: d.toLocaleDateString("nl-NL", { month: "short", timeZone: "UTC" }).replace(".", ""),
      title: d.toLocaleDateString("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" }),
    };
  });
  const overdue = reqs.filter((r) => r.nextReviewDate && r.nextReviewDate < now).length;
  const due = months.map(
    (p) =>
      reqs.filter((r) => r.nextReviewDate && r.nextReviewDate >= now && r.nextReviewDate.getUTCFullYear() === p.y && r.nextReviewDate.getUTCMonth() === p.m)
        .length,
  );
  return (
    <Grid>
      <ChartCard title="Compliancestatus" subtitle={`${reqs.length} van toepassing zijnde eisen`}>
        <SegmentBar
          parts={[
            { label: "Voldoet", value: c("COMPLIANT"), color: STATUS.good, href: "/wetgeving?status=COMPLIANT" },
            { label: "Deels", value: c("PARTIAL"), color: STATUS.warn, href: "/wetgeving?status=PARTIAL" },
            { label: "Voldoet niet", value: c("NON_COMPLIANT"), color: STATUS.bad, href: "/wetgeving?status=NON_COMPLIANT" },
            { label: "Niet getoetst", value: c("NOT_ASSESSED"), color: STATUS.none, href: "/wetgeving?status=NOT_ASSESSED" },
          ]}
        />
      </ChartCard>
      <ChartCard
        title="Toetsingen komende 12 maanden"
        subtitle={overdue ? `${overdue} toetsing(en) te laat` : "Geen toetsingen te laat"}
        className="md:col-span-2"
      >
        <Columns periods={months.map((m) => ({ label: m.label, title: m.title }))} series={[{ name: "Toetsingen", values: due }]} height={110} />
      </ChartCard>
      <ChartCard title="Per thema">
        <BarList items={countBy(reqs, (r) => r.theme)} />
      </ChartCard>
    </Grid>
  );
}

export async function AspectCharts() {
  const aspects = await prisma.environmentalAspect.findMany({
    where: { active: true, inOperation: true },
    select: { theme: true, businessUnit: true, priority: true, significant: true, effectScore: true, exposure: true, probability: true },
  });
  const lv = { low: 0, medium: 0, high: 0, veryHigh: 0, none: 0 };
  for (const a of aspects) {
    const l = aspectRiskLevel(aspectRisk(a.effectScore, a.exposure, a.probability));
    lv[l ?? "none"]++;
  }
  const sig = aspects.filter((a) => a.significant).length;
  return (
    <Grid>
      <ChartCard title="Risiconiveau (E × B × W)" subtitle={`${aspects.length} aspecten in werking (incl. kansen)`}>
        <SegmentBar
          parts={[
            { label: "Zeer hoog", value: lv.veryHigh, color: "#9b0d14" },
            { label: "Hoog", value: lv.high, color: brand.riskColors.high },
            { label: "Middel", value: lv.medium, color: brand.riskColors.medium },
            { label: "Laag", value: lv.low, color: brand.riskColors.low },
            { label: "Niet beoordeeld", value: lv.none, color: STATUS.none },
          ]}
        />
      </ChartCard>
      <ChartCard title="Significant" subtitle="Volgens de ingestelde significantieregel">
        <SegmentBar
          parts={[
            { label: "Significant", value: sig, color: brand.riskColors.high, href: "/milieuaspecten?significant=ja" },
            { label: "Niet significant", value: aspects.length - sig, color: STATUS.none },
          ]}
        />
        <div className="mt-3">
          <BarList
            items={(["HIGH", "MEDIUM", "LOW"] as const).map((p) => ({
              label: `Prio ${ASPECT_PRIORITY_LABEL[p]}`,
              value: aspects.filter((a) => a.priority === p).length,
            }))}
          />
        </div>
      </ChartCard>
      <ChartCard title="Per milieuthema">
        <BarList items={countBy(aspects, (a) => a.theme)} />
      </ChartCard>
      <ChartCard title="Per bedrijfsonderdeel">
        <BarList items={countBy(aspects, (a) => a.businessUnit, 8, "Groep")} />
      </ChartCard>
    </Grid>
  );
}

export async function AuditCharts() {
  const year = new Date().getUTCFullYear();
  const [audits, findings] = await Promise.all([
    prisma.audit.findMany({
      where: { status: { not: "CANCELLED" }, plannedDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
      select: { plannedDate: true, status: true, type: true },
    }),
    prisma.auditFinding.findMany({ select: { classification: true, status: true } }),
  ]);
  const months = Array.from({ length: 12 }, (_, m) => {
    const d = new Date(Date.UTC(year, m, 1));
    return {
      label: d.toLocaleDateString("nl-NL", { month: "short", timeZone: "UTC" }).replace(".", ""),
      title: d.toLocaleDateString("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" }),
    };
  });
  const per = (pred: (a: (typeof audits)[number]) => boolean) =>
    months.map((_, m) => audits.filter((a) => a.plannedDate.getUTCMonth() === m && pred(a)).length);
  return (
    <Grid>
      <ChartCard title={`Auditplanning ${year}`} subtitle="Per maand (geplande datum)" className="md:col-span-2">
        <Columns
          periods={months}
          series={[
            { name: "Afgerond", values: per((a) => a.status === "COMPLETED") },
            { name: "Gepland / bezig", values: per((a) => a.status !== "COMPLETED") },
          ]}
          height={110}
        />
      </ChartCard>
      <ChartCard title="Bevindingen open" subtitle="Per classificatie">
        <BarList
          items={(["MAJOR", "MINOR", "OBSERVATION"] as const).map((c) => ({
            label: FINDING_CLASS_SHORT[c],
            value: findings.filter((f) => f.classification === c && f.status === "OPEN").length,
          }))}
          empty="Geen open bevindingen."
        />
      </ChartCard>
      <ChartCard title="Bevindingen totaal">
        <SegmentBar
          parts={[
            { label: "Open", value: findings.filter((f) => f.status === "OPEN").length, color: STATUS.warn },
            { label: "Afgehandeld", value: findings.filter((f) => f.status === "CLOSED").length, color: STATUS.good },
          ]}
        />
      </ChartCard>
    </Grid>
  );
}

export async function NormCoverageChart() {
  const cov = await getNormCoverage();
  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2">
      <ChartCard title="Dekking per norm" subtitle="% eisen met minimaal één gekoppeld bewijsstuk">
        <BarList
          items={cov.filter((n) => n.active && n.leafCount > 0).map((n) => ({ label: n.code, value: Math.round(n.coveragePct), href: `/normen/${n.id}` }))}
          unit="%"
          max={100}
          empty="Nog geen eisen."
        />
      </ChartCard>
    </div>
  );
}
