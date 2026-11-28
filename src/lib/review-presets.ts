import { REVIEW_THEME as T, elementId, type SlideElement, type SlideLayout } from "@/lib/review-model";

/**
 * Standaardindelingen voor nieuwe dia's, met de maten uit het template van Rouwmaat
 * (inhoudsvlak vanaf x = 3,35 inch, breedte 9,5; bovenrand 1,75).
 */

const X = 3.35;
const W = 9.5;
const TOP = 1.75;

export const kpiRow = (n = 4, y = TOP, h = 1.35): SlideElement[] => {
  const gap = 0.23;
  const w = (W - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ id: elementId(), type: "kpi" as const, x: X + i * (w + gap), y, w, h, value: "0", label: "Toelichting" }));
};

export const cardGrid = (cols = 2, rows = 2, y = TOP, h = 1.95): SlideElement[] => {
  const gapX = 0.2;
  const gapY = 0.15;
  const w = (W - gapX * (cols - 1)) / cols;
  const out: SlideElement[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push({ id: elementId(), type: "card", x: X + c * (w + gapX), y: y + r * (h + gapY), w, h, title: "Titel", body: "Tekst", iconColor: T.red });
  return out;
};

export const judgment = (y = 6.05): SlideElement => ({ id: elementId(), type: "judgment", x: X, y, w: W, h: 0.75, label: "Directie-oordeel", text: "" });

export const table = (cols: string[], rows = 4, y = TOP, w = W): SlideElement => {
  const colW = cols.map(() => Math.round((w / cols.length) * 100) / 100);
  return {
    id: elementId(),
    type: "table",
    x: X,
    y,
    w,
    h: 0.45 * (rows + 1),
    colW,
    rowH: 0.45,
    header: cols,
    rows: Array.from({ length: rows }, () => cols.map(() => ({ text: "" }))),
  };
};

export const chart = (x = X, y = TOP, w = W, h = 4.9): SlideElement => ({
  id: elementId(),
  type: "chart",
  x,
  y,
  w,
  h,
  kind: "col",
  categories: ["2023", "2024", "2025"],
  series: [{ name: "Waarde", values: [0, 0, 0] }],
  colors: ["C9C9C9", "8C8C8C", T.redDark],
});

export type SlidePreset = { key: string; label: string; layout: SlideLayout; title: string; data: () => unknown; ims?: string };

export const SLIDE_PRESETS: SlidePreset[] = [
  { key: "cards4", label: "4 kaarten + directie-oordeel", layout: "CONTENT", title: "Nieuwe dia", data: () => ({ elements: [...cardGrid(2, 2), judgment()] }) },
  { key: "cards6", label: "6 kaarten", layout: "CONTENT", title: "Nieuwe dia", data: () => ({ elements: cardGrid(3, 2, TOP, 2.3) }) },
  {
    key: "kpi-cards",
    label: "4 kengetallen + 2 kaarten",
    layout: "CONTENT",
    title: "Nieuwe dia",
    data: () => ({ elements: [...kpiRow(4), ...cardGrid(2, 1, 3.35, 3.4)] }),
  },
  { key: "table", label: "Tabel", layout: "CONTENT", title: "Nieuwe dia", data: () => ({ elements: [table(["ONDERWERP", "STATUS", "TOELICHTING"], 6)] }) },
  {
    key: "table-judgment",
    label: "Tabel + directie-oordeel",
    layout: "CONTENT",
    title: "Nieuwe dia",
    data: () => ({ elements: [table(["ONDERWERP", "STATUS", "TOELICHTING"], 5), judgment()] }),
  },
  {
    key: "chart-table",
    label: "Tabel + grafiek",
    layout: "CONTENT",
    title: "Nieuwe dia",
    data: () => ({ elements: [table(["ONDERWERP", "2024", "2025"], 6, TOP, 5.6), chart(9.25, 1.7, 3.6, 2.9)] }),
  },
  {
    key: "kpi-decisions",
    label: "Kengetallen + besluitenblok",
    layout: "CONTENT",
    title: "Nieuwe dia",
    data: () => ({
      elements: [
        ...kpiRow(2, TOP)
          .map((e) => ({ ...e, w: 2.2 }))
          .map((e, i) => ({ ...e, x: X + i * 2.43 })),
        {
          id: elementId(),
          type: "text",
          x: X,
          y: 3.35,
          w: 4.63,
          h: 3.3,
          paras: [
            { text: "Situatie", bold: true, color: T.ink, size: 13 },
            { text: "Tekst", size: 11.5 },
          ],
        },
        { id: elementId(), type: "decisions", x: 8.21, y: TOP, w: 4.64, h: 4.95, heading: "BESLUITEN DIRECTIE", items: ["Besluit"] },
      ],
    }),
  },
  {
    key: "checks",
    label: "Openstaande acties (vinkvakken)",
    layout: "CONTENT",
    title: "Openstaande verificatie en acties",
    data: () => ({ elements: Array.from({ length: 5 }, (_, i) => ({ id: elementId(), type: "check", x: X, y: TOP + i * 0.8, w: W, h: 0.68, text: "Actie" })) }),
  },
  { key: "chapter", label: "Hoofdstukdia", layout: "CHAPTER", title: "Hoofdstuk", data: () => ({ number: "10", items: ["Onderwerp"] }) },
  {
    key: "conclusion",
    label: "Conclusiedia (3 kolommen)",
    layout: "CONCLUSION",
    title: "CONCLUSIE",
    data: () => ({
      columns: [
        { title: "Titel", text: "Tekst" },
        { title: "Titel", text: "Tekst" },
        { title: "Titel", text: "Tekst" },
      ],
    }),
  },
  {
    key: "title",
    label: "Titeldia",
    layout: "TITLE",
    title: "Managementreview",
    data: () => ({ brand: "ROUWMAAT GROEP", subtitle: "", normsLine: "", tagline: "Rouwmaat regelt het gewoon", dateText: "" }),
  },
  // Dia's met cijfers uit het IMS (bij te werken met "Cijfers bijwerken uit IMS")
  {
    key: "ims-co2",
    label: "Uit IMS: CO2-uitstoot per jaar",
    layout: "CONTENT",
    title: "CO2-uitstoot",
    ims: "co2-years",
    data: () => ({ elements: [{ ...chart(), source: "co2-years" }] }),
  },
  {
    key: "ims-actions",
    label: "Uit IMS: openstaande acties",
    layout: "CONTENT",
    title: "Openstaande acties",
    ims: "actions-open",
    data: () => ({ elements: [{ ...table(["ACTIE", "HERKOMST", "EIGENAAR", "DEADLINE"], 8), source: "actions-open" }] }),
  },
  {
    key: "ims-risks",
    label: "Uit IMS: belangrijkste risico's en kansen",
    layout: "CONTENT",
    title: "Risico's en kansen",
    ims: "risks-top",
    data: () => ({ elements: [{ ...table(["RISICO OF KANS", "TYPE", "MAATREGEL EN STATUS"], 8), source: "risks-top" }] }),
  },
  {
    key: "ims-reports",
    label: "Uit IMS: ongevallen en incidenten",
    layout: "CONTENT",
    title: "Meldingen",
    ims: "reports-year",
    data: () => ({
      elements: [
        { ...chart(X, TOP, 6.1, 5.0), kind: "bar", source: "reports-year" },
        ...kpiRow(1, TOP).map((e) => ({ ...e, x: 9.75, w: 3.1, source: "reports-total" })),
        ...kpiRow(1, 3.3).map((e) => ({ ...e, x: 9.75, w: 3.1, source: "kpi-absence" })),
      ],
    }),
  },
  {
    key: "ims-audits",
    label: "Uit IMS: auditbevindingen",
    layout: "CONTENT",
    title: "Auditbevindingen",
    ims: "audit-findings",
    data: () => ({ elements: [{ ...table(["AUDIT", "BEVINDING", "CLASSIFICATIE", "STATUS"], 8), source: "audit-findings" }] }),
  },
  {
    key: "ims-kpis",
    label: "Uit IMS: kengetallen (doelstellingen, acties, compliance, CO2)",
    layout: "CONTENT",
    title: "Kengetallen",
    ims: "kpis",
    data: () => ({
      elements: kpiRow(4).map((e, i) => ({ ...e, source: ["kpi-objectives", "kpi-actions-overdue", "kpi-compliance", "kpi-co2"][i] })),
    }),
  },
  {
    key: "ims-objectives",
    label: "Uit IMS: doelstellingen met status",
    layout: "CONTENT",
    title: "Doelstellingen",
    ims: "objectives-status",
    data: () => ({
      elements: [{ ...table(["DOELSTELLING", "STATUS", "OORZAAK EN VERVOLG"], 7), colW: [3.6, 1.55, 4.35], rowH: 0.66, source: "objectives-status" }],
    }),
  },
  {
    key: "ims-objectives-smart",
    label: "Uit IMS: doelstellingen (SMART)",
    layout: "CONTENT",
    title: "Doelstellingen (SMART)",
    ims: "objectives-smart",
    data: () => ({
      elements: [{ ...table(["DOELSTELLING", "INDICATOR EN STREEFWAARDE", "EIGENAAR", "TERMIJN"], 8), colW: [2.6, 3.9, 1.6, 1.4], source: "objectives-smart" }],
    }),
  },
  {
    key: "ims-legal",
    label: "Uit IMS: wettelijke eisen die niet voldoen",
    layout: "CONTENT",
    title: "Naleving wet- en regelgeving",
    ims: "legal-open",
    data: () => ({ elements: [{ ...table(["WETTELIJKE EIS", "STATUS", "VOLGENDE STAP"], 8), source: "legal-open" }] }),
  },
];

/** Standaardopbouw van een nieuwe, lege managementreview (zonder template). */
export function defaultReviewSlides(year: number): { layout: SlideLayout; kicker: string | null; title: string; data: unknown }[] {
  const p = (key: string) => SLIDE_PRESETS.find((x) => x.key === key)!;
  const chapter = (number: string, title: string, items: string[]) => ({ layout: "CHAPTER" as const, kicker: null, title, data: { number, items } });
  const content = (kicker: string, title: string, key: string) => ({ layout: "CONTENT" as const, kicker, title, data: p(key).data() });
  return [
    {
      layout: "TITLE",
      kicker: null,
      title: `Managementreview ${year}`,
      data: {
        brand: "ROUWMAAT GROEP",
        subtitle: "",
        normsLine: "ISO 9001  ·  ISO 14001  ·  VCA**  ·  CO2-Prestatieladder",
        tagline: "Rouwmaat regelt het gewoon",
        dateText: "",
      },
    },
    content("INLEIDING", "Directiesamenvatting", "ims-kpis"),
    chapter("01", "Resultaten voorgaande doelstellingen", ["Doelstellingen", "Context en belanghebbenden", "Risico's en kansen"]),
    content("01  ·  RESULTATEN VOORGAANDE DOELSTELLINGEN", "Doelstellingen", "ims-objectives"),
    content("01  ·  RESULTATEN VOORGAANDE DOELSTELLINGEN", "Context en belanghebbenden", "cards4"),
    content("01  ·  RESULTATEN VOORGAANDE DOELSTELLINGEN", "Risico's en kansen", "ims-risks"),
    chapter("02", "Audits en compliance", ["Auditresultaten", "Naleving wet- en regelgeving"]),
    content("02  ·  AUDITS EN COMPLIANCE", "Auditbevindingen", "ims-audits"),
    content("02  ·  AUDITS EN COMPLIANCE", "Naleving wet- en regelgeving", "ims-legal"),
    chapter("03", "Veiligheid en milieu", ["Meldingen", "CO2-uitstoot"]),
    content("03  ·  VEILIGHEID EN MILIEU", "Meldingen", "ims-reports"),
    content("03  ·  VEILIGHEID EN MILIEU", "CO2-uitstoot", "ims-co2"),
    { layout: "CONCLUSION", kicker: "CONCLUSIE", title: "CONCLUSIE", data: p("conclusion").data() },
    content("CONCLUSIE EN VASTSTELLING", "Openstaande acties", "ims-actions"),
  ];
}
