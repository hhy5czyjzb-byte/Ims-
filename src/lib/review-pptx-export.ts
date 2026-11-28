import type PptxGenJS from "pptxgenjs";
import {
  REVIEW_THEME as T,
  formatChartValue,
  safeSlideData,
  type ChapterData,
  type ConclusionData,
  type ContentData,
  type SlideElement,
  type TitleData,
} from "@/lib/review-model";

/**
 * PowerPoint maken van een directiebeoordeling, in de opmaak van het template (posities, kleuren, lettertypen).
 * Alles blijft bewerkbaar in PowerPoint: tekstvakken, echte tabellen en grafieken met hun gegevens.
 * Draait in de browser (geen limiet op de grootte van het antwoord) en in Node (tests).
 */

export type ExportSlide = { layout: string; kicker: string | null; title: string; imageId: string | null; hidden: boolean; data: unknown };
export type ExportReview = { title: string; logoImageId: string | null; stripImageId: string | null; footerText: string | null; slides: ExportSlide[] };
/** Afbeeldingen als data-URL zonder "data:"-voorvoegsel, zoals pptxgenjs verwacht ("image/png;base64,…"). */
export type ExportImages = Record<string, string>;

type Slide = PptxGenJS.Slide;
const FONT = T.font;
const LIGHT = T.fontLight;

function img(slide: Slide, images: ExportImages, id: string | null | undefined, x: number, y: number, w: number, h: number, sizing?: "cover") {
  const data = id ? images[id] : undefined;
  if (!data) return false;
  slide.addImage({ data, x, y, w, h, ...(sizing ? { sizing: { type: "cover", w, h } } : {}) });
  return true;
}

function rect(slide: Slide, pptx: PptxGenJS, x: number, y: number, w: number, h: number, color: string, transparency = 0) {
  slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color, transparency }, line: { color, transparency: 100 } });
}

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function addElement(slide: Slide, pptx: PptxGenJS, e: SlideElement, images: ExportImages) {
  const { x, y, w, h } = e;
  switch (e.type) {
    case "kpi": {
      rect(slide, pptx, x, y, w, h, T.card);
      if (e.caption) {
        slide.addText(e.caption, {
          x: x + 0.22,
          y: y + 0.2,
          w: w - 0.44,
          h: 0.3,
          fontFace: FONT,
          fontSize: 9,
          bold: true,
          color: T.muted,
          margin: 0,
          valign: "middle",
        });
        slide.addText(e.value, {
          x: x + 0.22,
          y: y + 0.55,
          w: w - 0.44,
          h: 0.75,
          fontFace: FONT,
          fontSize: 30,
          bold: true,
          color: e.color ?? T.ink,
          margin: 0,
          valign: "middle",
        });
        slide.addText(e.label, {
          x: x + 0.22,
          y: y + 1.4,
          w: w - 0.44,
          h: Math.max(h - 1.6, 0.3),
          fontFace: LIGHT,
          fontSize: 11,
          color: T.ink,
          margin: 0,
          valign: "top",
        });
      } else {
        slide.addText(e.value, {
          x: x + 0.22,
          y: y + 0.12,
          w: w - 0.44,
          h: 0.7,
          fontFace: FONT,
          fontSize: 28,
          bold: true,
          color: e.color ?? T.ink,
          margin: 0,
          valign: "middle",
        });
        slide.addText(e.label, {
          x: x + 0.22,
          y: y + 0.84,
          w: w - 0.44,
          h: Math.max(h - 0.98, 0.3),
          fontFace: LIGHT,
          fontSize: 10.5,
          color: T.muted,
          margin: 0,
          valign: "top",
        });
      }
      return;
    }
    case "card": {
      rect(slide, pptx, x, y, w, h, T.card);
      slide.addShape(pptx.ShapeType.ellipse, {
        x: x + 0.25,
        y: y + 0.25,
        w: 0.46,
        h: 0.46,
        fill: { color: e.iconColor ?? T.red },
        line: { color: e.iconColor ?? T.red },
      });
      img(slide, images, e.iconId, x + 0.365, y + 0.365, 0.23, 0.23);
      slide.addText(e.title, {
        x: x + 0.85,
        y: y + 0.22,
        w: w - 1.05,
        h: 0.52,
        fontFace: FONT,
        fontSize: 13,
        bold: true,
        color: T.ink,
        margin: 0,
        valign: "middle",
      });
      const size = e.bodySize ?? 12;
      const body = lines(e.body);
      if (body.length)
        slide.addText(
          body.map((t) => ({
            text: t,
            options: e.bullets ? { bullet: { indent: 11 }, paraSpaceAfter: 4, breakLine: true } : { paraSpaceAfter: 4, breakLine: true },
          })),
          { x: x + 0.25, y: y + 0.88, w: w - 0.5, h: Math.max(h - 1.03, 0.3), fontFace: LIGHT, fontSize: size, color: T.muted, margin: 0, valign: "top" },
        );
      return;
    }
    case "judgment": {
      rect(slide, pptx, x, y, w, h, T.judgment);
      if (e.stacked) {
        slide.addText(
          [
            { text: e.label, options: { bold: true, color: T.redDark, fontFace: FONT, breakLine: true, paraSpaceAfter: 4 } },
            { text: e.text, options: { color: T.ink, fontFace: LIGHT } },
          ],
          { x: x + 0.2, y: y + 0.1, w: w - 0.35, h: h - 0.2, fontSize: 10.5, margin: 0, valign: "top" },
        );
      } else {
        slide.addText(
          [
            { text: `${e.label}   `, options: { bold: true, color: T.redDark, fontFace: FONT } },
            { text: e.text, options: { color: T.ink, fontFace: LIGHT } },
          ],
          { x: x + 0.25, y, w: w - 0.5, h, fontSize: 12.5, margin: 0, valign: "middle" },
        );
      }
      return;
    }
    case "decisions": {
      rect(slide, pptx, x, y, w, h, T.redDark);
      slide.addText(
        [
          { text: e.heading, options: { bold: true, fontSize: 11, charSpacing: 2, fontFace: FONT, breakLine: true, paraSpaceAfter: 12 } },
          ...e.items.map((t) => ({ text: t, options: { fontSize: 13, fontFace: LIGHT, bullet: { indent: 13 }, paraSpaceAfter: 8, breakLine: true } })),
        ],
        { x: x + 0.3, y: y + 0.3, w: w - 0.59, h: h - 0.55, color: "FFFFFF", margin: 0, valign: "top" },
      );
      return;
    }
    case "check": {
      rect(slide, pptx, x, y, w, h, T.card);
      slide.addShape(pptx.ShapeType.rect, {
        x: x + 0.22,
        y: y + (h - 0.28) / 2,
        w: 0.28,
        h: 0.28,
        fill: { color: "FFFFFF" },
        line: { color: T.red, width: 1.5 },
      });
      slide.addText(e.text, { x: x + 0.7, y, w: w - 0.9, h, fontFace: LIGHT, fontSize: 12, color: T.ink, margin: 0, valign: "middle" });
      return;
    }
    case "text": {
      if (!e.paras.length) return;
      slide.addText(
        e.paras.map((p) => ({
          text: p.text,
          options: {
            bold: p.bold,
            color: p.color ?? T.muted,
            fontSize: p.size ?? 11,
            fontFace: p.bold ? FONT : LIGHT,
            breakLine: true,
            paraSpaceAfter: 4,
            ...(p.bullet ? { bullet: { indent: 11 } } : {}),
          },
        })),
        { x, y, w, h, margin: 0, valign: "top" },
      );
      return;
    }
    case "table": {
      const fs = e.fontSize ?? 10.5;
      const none = { type: "none" as const };
      const header = e.header.map((t) => ({
        text: t,
        options: {
          bold: true,
          fontSize: 8.5,
          color: T.muted,
          fontFace: FONT,
          charSpacing: 1,
          valign: "bottom" as const,
          border: [none, none, { type: "solid" as const, pt: 1, color: T.ink }, none] as [
            PptxGenJS.BorderProps,
            PptxGenJS.BorderProps,
            PptxGenJS.BorderProps,
            PptxGenJS.BorderProps,
          ],
        },
      }));
      const rows = e.rows.map((r) =>
        e.colW.map((_, ci) => {
          const c = r[ci] ?? { text: "" };
          return {
            text: c.text,
            options: {
              bold: c.bold,
              color: c.color ?? T.ink,
              fontSize: fs,
              fontFace: c.bold ? FONT : LIGHT,
              valign: "middle" as const,
              border: [none, none, { type: "solid" as const, pt: 0.75, color: T.rule }, none] as [
                PptxGenJS.BorderProps,
                PptxGenJS.BorderProps,
                PptxGenJS.BorderProps,
                PptxGenJS.BorderProps,
              ],
            },
          };
        }),
      );
      slide.addTable(e.header.length ? [header, ...rows] : rows, {
        x,
        y,
        w: e.colW.reduce((n, v) => n + v, 0),
        colW: e.colW,
        rowH: e.rowH,
        margin: [4, 6, 4, 0],
        autoPage: false,
      });
      return;
    }
    case "chart": {
      const multi = e.series.length > 1;
      slide.addChart(
        pptx.ChartType.bar,
        e.series.map((s) => ({ name: s.name, labels: e.categories, values: s.values })),
        {
          x,
          y,
          w,
          h,
          barDir: e.kind,
          barGapWidthPct: 150,
          chartColors: multi ? e.colors.slice(0, e.series.length) : e.colors,
          showValue: true,
          dataLabelFormatCode: e.decimals ? `#,##0.${"0".repeat(e.decimals)}#` : "#,##0",
          dataLabelFontSize: 9,
          dataLabelColor: T.ink,
          dataLabelFontFace: FONT,
          catAxisLabelColor: T.muted,
          catAxisLabelFontSize: 10,
          catAxisLabelFontFace: FONT,
          catAxisLineShow: false,
          valAxisHidden: true,
          valGridLine: { color: T.rule, size: 0.5 },
          showLegend: multi,
          ...(e.title ? { showTitle: true, title: e.title, titleFontSize: 11, titleColor: T.ink, titleFontFace: FONT } : {}),
          legendPos: "b",
          legendFontSize: 9,
          legendFontFace: FONT,
        },
      );
      return;
    }
  }
}

function contentChrome(slide: Slide, pptx: PptxGenJS, review: ExportReview, images: ExportImages, s: ExportSlide) {
  const { kicker, title } = s;
  if (!img(slide, images, s.imageId ?? review.stripImageId, 0, 0, 2.9, 7.5, "cover") && !img(slide, images, review.stripImageId, 0, 0, 2.9, 7.5, "cover"))
    rect(slide, pptx, 0, 0, 2.9, 7.5, T.chapterBg);
  if (review.footerText)
    slide.addText(review.footerText, { x: 3.35, y: 7.02, w: 6.0, h: 0.25, fontFace: LIGHT, fontSize: 8.5, color: T.faint, margin: 0, valign: "middle" });
  rect(slide, pptx, 0, 6.45, 2.9, 1.05, "000000", 45);
  img(slide, images, review.logoImageId, 0.4, 6.72, 2.0, 0.415);
  if (kicker)
    slide.addText(kicker, {
      x: 3.35,
      y: 0.42,
      w: 9.5,
      h: 0.28,
      fontFace: FONT,
      fontSize: 10,
      bold: true,
      color: T.red,
      charSpacing: 2,
      margin: 0,
      valign: "middle",
    });
  slide.addText(title, { x: 3.35, y: 0.72, w: 9.5, h: 0.8, fontFace: FONT, fontSize: 26, bold: true, color: T.ink, margin: 0, valign: "middle" });
}

/** Presentatie opbouwen. `Pptx` is de constructor van pptxgenjs (dynamisch geladen in de browser). */
export function buildReviewPptx(Pptx: typeof PptxGenJS, review: ExportReview, images: ExportImages): PptxGenJS {
  const pptx = new Pptx();
  pptx.layout = "LAYOUT_WIDE"; // 13,333 × 7,5 inch
  pptx.title = review.title;
  pptx.company = "Rouwmaat Groep";
  pptx.theme = { headFontFace: FONT, bodyFontFace: LIGHT };

  for (const s of review.slides) {
    if (s.hidden) continue;
    const slide = pptx.addSlide();
    if (s.layout === "TITLE") {
      const d = safeSlideData("TITLE", s.data) as TitleData;
      if (!img(slide, images, s.imageId, 0, 0, 13.333, 7.5, "cover")) slide.background = { color: T.chapterBg };
      rect(slide, pptx, 0, 0, 7.6, 7.5, "000000", 30);
      slide.addText(d.brand, { x: 0.7, y: 1.55, w: 6.0, h: 0.35, fontFace: FONT, fontSize: 12, bold: true, color: T.red, charSpacing: 3, margin: 0 });
      slide.addText(s.title, { x: 0.7, y: 1.95, w: 6.7, h: 1.6, fontFace: FONT, fontSize: 44, bold: true, color: "FFFFFF", margin: 0, valign: "middle" });
      if (d.subtitle) slide.addText(d.subtitle, { x: 0.7, y: 3.6, w: 6.7, h: 0.55, fontFace: LIGHT, fontSize: 22, color: "FFFFFF", margin: 0 });
      if (d.normsLine) slide.addText(d.normsLine, { x: 0.7, y: 4.3, w: 6.7, h: 0.4, fontFace: LIGHT, fontSize: 12, color: "D9D9D9", margin: 0 });
      if (d.tagline) slide.addText(d.tagline, { x: 0.7, y: 5.6, w: 5.0, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: "FFFFFF", margin: 0 });
      if (d.dateText) slide.addText(d.dateText, { x: 0.7, y: 5.95, w: 5.0, h: 0.3, fontFace: LIGHT, fontSize: 12, color: "D9D9D9", margin: 0 });
      img(slide, images, review.logoImageId, 0.7, 6.6, 2.2, 0.457);
    } else if (s.layout === "CHAPTER") {
      const d = safeSlideData("CHAPTER", s.data) as ChapterData;
      slide.background = { color: T.chapterBg };
      img(slide, images, s.imageId, 0, 0, 6.0, 7.5, "cover");
      slide.addText(d.number, { x: 6.7, y: 1.2, w: 5.5, h: 1.5, fontFace: FONT, fontSize: 96, bold: true, color: T.red, margin: 0, valign: "bottom" });
      slide.addText(s.title, { x: 6.7, y: 2.8, w: 6.1, h: 1.6, fontFace: FONT, fontSize: 38, bold: true, color: "FFFFFF", margin: 0, valign: "top" });
      if (d.items.length)
        slide.addText(
          d.items.map((t) => ({ text: t, options: { breakLine: true, paraSpaceAfter: 6 } })),
          { x: 6.7, y: 4.5, w: 5.9, h: 1.9, fontFace: LIGHT, fontSize: 14, color: T.chapterText, margin: 0, valign: "top" },
        );
      img(slide, images, review.logoImageId, 10.6, 6.75, 2.0, 0.415);
    } else if (s.layout === "CONCLUSION") {
      const d = safeSlideData("CONCLUSION", s.data) as ConclusionData;
      if (!img(slide, images, s.imageId, 0, 0, 13.333, 7.5, "cover")) slide.background = { color: T.chapterBg };
      rect(slide, pptx, 0, 0, 13.333, 7.5, "000000", 18);
      slide.addText(s.kicker || s.title, {
        x: 0.7,
        y: 0.9,
        w: 6.0,
        h: 0.35,
        fontFace: FONT,
        fontSize: 12,
        bold: true,
        color: T.red,
        charSpacing: 3,
        margin: 0,
      });
      const n = Math.max(d.columns.length, 1);
      const colW = n >= 3 ? 3.6 : n === 2 ? 5.6 : 11.9;
      const gap = n >= 3 ? 0.5 : 0.7;
      d.columns.forEach((c, i) => {
        const x = 0.7 + i * (colW + gap);
        slide.addShape(pptx.ShapeType.line, { x, y: 3.35, w: Math.min(colW, 3.6), h: 0, line: { color: T.red, width: 2 } });
        slide.addText(c.title, { x, y: 3.55, w: colW, h: 0.8, fontFace: FONT, fontSize: 20, bold: true, color: "FFFFFF", margin: 0, valign: "top" });
        slide.addText(c.text, { x, y: 4.45, w: colW, h: 1.9, fontFace: LIGHT, fontSize: 14, color: "FFFFFF", margin: 0, valign: "top" });
      });
      img(slide, images, review.logoImageId, 0.7, 6.6, 2.2, 0.457);
    } else {
      const d = safeSlideData("CONTENT", s.data) as ContentData;
      contentChrome(slide, pptx, review, images, s);
      for (const e of d.elements) addElement(slide, pptx, e, images);
      slide.slideNumber = { x: 12.35, y: 7.0, w: 0.5, h: 0.28, fontFace: LIGHT, fontSize: 8.5, color: T.faint, align: "right" };
    }
  }
  return pptx;
}

/** Waarde zoals in een grafieklabel (voor de voorbeeldweergave). */
export const chartLabel = (v: number, decimals = 0) => formatChartValue(v, decimals);

/** FNV-1a over de bytes (snel, genoeg om gelijke afbeeldingen te vinden; daarna exact vergeleken). */
function fnv(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}-${bytes.length}`;
}
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * pptxgenjs zet een afbeelding per dia opnieuw in het bestand (logo, fotostrook en iconen staan op elke dia).
 * Dubbele mediabestanden samenvoegen houdt de PowerPoint klein; verwijzingen in de dia's worden aangepast.
 */
export async function dedupeMedia(JSZipCtor: typeof import("jszip"), data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const zip = await JSZipCtor.loadAsync(data);
  const media = Object.keys(zip.files).filter((p) => p.startsWith("ppt/media/") && !zip.files[p].dir);
  const keep = new Map<string, { path: string; bytes: Uint8Array }[]>();
  const replace = new Map<string, string>(); // bestandsnaam → bestandsnaam van het origineel
  for (const p of media) {
    const bytes = await zip.file(p)!.async("uint8array");
    const key = fnv(bytes);
    const list = keep.get(key) ?? [];
    const hit = list.find((k) => same(k.bytes, bytes));
    if (hit) {
      replace.set(p.slice("ppt/media/".length), hit.path.slice("ppt/media/".length));
      zip.remove(p);
    } else {
      list.push({ path: p, bytes });
      keep.set(key, list);
    }
  }
  if (replace.size) {
    for (const p of Object.keys(zip.files).filter((f) => f.endsWith(".rels"))) {
      const xml = await zip.file(p)!.async("string");
      const next = xml.replace(/Target="([^"]*?)media\/([^"/]+)"/g, (m, pre: string, name: string) =>
        replace.has(name) ? `Target="${pre}media/${replace.get(name)}"` : m,
      );
      if (next !== xml) zip.file(p, next);
    }
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
