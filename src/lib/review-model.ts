import { z } from "zod";

/**
 * Model van de dia's van de directiebeoordeling (managementreview).
 * Posities en maten in inches op een 16:9-dia van 13,333 × 7,5 inch, zoals in het PowerPoint-template van Rouwmaat.
 * Hetzelfde model wordt gebruikt voor het inlezen van het template, de bewerkpagina's, de voorbeeldweergave en de PowerPoint-export.
 */

export const SLIDE_W = 13.333;
export const SLIDE_H = 7.5;

/** Kleuren en lettertypen uit het template. */
export const REVIEW_THEME = {
  red: "E30613",
  redDark: "C00000",
  ink: "1A1A1A",
  muted: "5F5F5F",
  faint: "9A9A9A",
  card: "F3F3F1",
  judgment: "FBE9EA",
  rule: "E3E3E0",
  green: "2E7D32",
  amber: "B86E00",
  chapterBg: "1A1A1A",
  chapterText: "C9C9C9",
  font: "Trade Gothic Next",
  fontLight: "Trade Gothic Next Light",
};

/** Kleuren die je in de editor kunt kiezen (status en accent). */
export const COLOR_CHOICES: { value: string; label: string }[] = [
  { value: REVIEW_THEME.ink, label: "Zwart" },
  { value: REVIEW_THEME.green, label: "Groen (goed)" },
  { value: REVIEW_THEME.amber, label: "Oranje (aandacht)" },
  { value: REVIEW_THEME.redDark, label: "Rood (kritiek)" },
  { value: REVIEW_THEME.red, label: "Rouwmaat-rood" },
  { value: REVIEW_THEME.muted, label: "Grijs" },
  { value: REVIEW_THEME.faint, label: "Lichtgrijs" },
];

const hex = z
  .string()
  .regex(/^[0-9A-Fa-f]{6}$/)
  .transform((v) => v.toUpperCase());
const num = z.number().finite().min(-2).max(20);
const text = (max = 4000) => z.string().max(max);

const box = { id: z.string().min(1).max(40), x: num, y: num, w: num, h: num };

export const paraSchema = z.object({
  text: text(),
  bold: z.boolean().optional(),
  color: hex.optional(),
  size: z.number().min(5).max(120).optional(),
  bullet: z.boolean().optional(),
});
export type Para = z.infer<typeof paraSchema>;

export const cellSchema = z.object({ text: text(2000), bold: z.boolean().optional(), color: hex.optional() });
export type Cell = z.infer<typeof cellSchema>;

/** Herkomst van een element dat uit het IMS komt; "Bijwerken uit IMS" vult het opnieuw. */
export const sourceSchema = z.string().max(60).optional();

export const elementSchema = z.discriminatedUnion("type", [
  z.object({ ...box, type: z.literal("kpi"), value: text(60), label: text(300), caption: text(100).optional(), color: hex.optional(), source: sourceSchema }),
  z.object({
    ...box,
    type: z.literal("card"),
    title: text(200),
    body: text(),
    bullets: z.boolean().optional(),
    bodySize: z.number().min(6).max(30).optional(),
    iconId: z.string().max(60).nullish(),
    iconColor: hex.optional(),
  }),
  z.object({ ...box, type: z.literal("judgment"), label: text(100), text: text(), stacked: z.boolean().optional() }),
  z.object({ ...box, type: z.literal("decisions"), heading: text(100), items: z.array(text(1000)).max(20) }),
  z.object({ ...box, type: z.literal("check"), text: text(1000), source: sourceSchema }),
  z.object({ ...box, type: z.literal("text"), paras: z.array(paraSchema).max(60) }),
  z.object({
    ...box,
    type: z.literal("table"),
    colW: z.array(z.number().min(0.1).max(14)).min(1).max(12),
    rowH: z.number().min(0.2).max(3),
    header: z.array(text(200)).max(12),
    rows: z.array(z.array(cellSchema).max(12)).max(60),
    fontSize: z.number().min(6).max(20).optional(),
    source: sourceSchema,
  }),
  z.object({
    ...box,
    type: z.literal("chart"),
    kind: z.enum(["col", "bar"]),
    categories: z.array(text(120)).max(40),
    series: z
      .array(z.object({ name: text(120), values: z.array(z.number().finite()) }))
      .min(1)
      .max(4),
    colors: z.array(hex).max(40),
    decimals: z.number().int().min(0).max(3).optional(),
    title: text(200).optional(),
    source: sourceSchema,
  }),
]);
export type SlideElement = z.infer<typeof elementSchema>;
export type ElementType = SlideElement["type"];

export const titleDataSchema = z.object({
  brand: text(100).default("ROUWMAAT GROEP"),
  subtitle: text(300).default(""),
  normsLine: text(500).default(""),
  tagline: text(200).default(""),
  dateText: text(60).default(""),
});
export const chapterDataSchema = z.object({ number: text(10).default(""), items: z.array(text(300)).max(20).default([]) });
export const conclusionDataSchema = z.object({
  columns: z
    .array(z.object({ title: text(200), text: text(1500) }))
    .max(4)
    .default([]),
});
export const contentDataSchema = z.object({ elements: z.array(elementSchema).max(80).default([]) });

export type TitleData = z.infer<typeof titleDataSchema>;
export type ChapterData = z.infer<typeof chapterDataSchema>;
export type ConclusionData = z.infer<typeof conclusionDataSchema>;
export type ContentData = z.infer<typeof contentDataSchema>;

export const SLIDE_LAYOUTS = ["TITLE", "CHAPTER", "CONTENT", "CONCLUSION"] as const;
export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];
export const SLIDE_LAYOUT_LABEL: Record<SlideLayout, string> = {
  TITLE: "Titeldia",
  CHAPTER: "Hoofdstukdia",
  CONTENT: "Inhoudsdia",
  CONCLUSION: "Conclusiedia",
};

export const ELEMENT_LABEL: Record<ElementType, string> = {
  kpi: "Kengetal",
  card: "Kaart",
  judgment: "Directie-oordeel",
  decisions: "Besluitenblok",
  check: "Actie (vinkvak)",
  text: "Tekst",
  table: "Tabel",
  chart: "Grafiek",
};

/** Eén dia zoals opgeslagen (en bij import aangeleverd). */
export const slideInputSchema = z.object({
  layout: z.enum(SLIDE_LAYOUTS),
  kicker: text(200).nullish(),
  title: text(300),
  imageId: z.string().max(60).nullish(),
  hidden: z.boolean().optional(),
  data: z.unknown(),
});
export type SlideInput = z.infer<typeof slideInputSchema>;

/** Gegevens van een dia valideren volgens de opmaak; ongeldige delen geven een foutmelding. */
export function parseSlideData(layout: SlideLayout, data: unknown) {
  switch (layout) {
    case "TITLE":
      return titleDataSchema.parse(data ?? {});
    case "CHAPTER":
      return chapterDataSchema.parse(data ?? {});
    case "CONCLUSION":
      return conclusionDataSchema.parse(data ?? {});
    default:
      return contentDataSchema.parse(data ?? {});
  }
}

/** Zelfde als parseSlideData, maar zonder fout: lege standaard bij ongeldige gegevens (voor weergave). */
export function safeSlideData(layout: SlideLayout | string, data: unknown) {
  const l = (SLIDE_LAYOUTS as readonly string[]).includes(layout) ? (layout as SlideLayout) : "CONTENT";
  try {
    return parseSlideData(l, data);
  } catch {
    return parseSlideData(l, {});
  }
}

let counter = 0;
/** Korte unieke id voor een element. */
export function elementId(prefix = "e"): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Afbeeldings-ids die een dia gebruikt (foto en iconen). */
export function slideImageIds(slide: { imageId?: string | null; layout: string; data: unknown }): string[] {
  const ids = new Set<string>();
  if (slide.imageId) ids.add(slide.imageId);
  if (slide.layout === "CONTENT") {
    const d = safeSlideData("CONTENT", slide.data) as ContentData;
    for (const e of d.elements) if (e.type === "card" && e.iconId) ids.add(e.iconId);
  }
  return [...ids];
}

/** Getal in Nederlandse notatie voor grafieklabels. */
export function formatChartValue(v: number, decimals = 0): string {
  return v.toLocaleString("nl-NL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
