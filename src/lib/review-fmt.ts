import type { CSSProperties } from "react";
import type { TextFmt } from "@/lib/review-model";

/**
 * Opmaak van titels en teksten in de directiebeoordeling toepassen: in het voorbeeld (CSS) en in PowerPoint.
 * Alleen ingevulde eigenschappen overschrijven de standaard van het template.
 */

const CSS_FONT: Record<string, string> = {
  "Trade Gothic Next": `"Trade Gothic Next", "Fira Sans", system-ui, sans-serif`,
  "Trade Gothic Next Light": `"Trade Gothic Next Light", "Fira Sans", system-ui, sans-serif`,
  "Fira Sans": `"Fira Sans", system-ui, sans-serif`,
  Arial: `Arial, Helvetica, sans-serif`,
  Calibri: `Calibri, Carlito, "Fira Sans", sans-serif`,
  Georgia: `Georgia, "Times New Roman", serif`,
  Verdana: `Verdana, Geneva, sans-serif`,
  "Times New Roman": `"Times New Roman", Times, serif`,
};

/** CSS voor het voorbeeld; `pt` zet punten om naar de schaal van het voorbeeld. */
export function fmtCss(f: TextFmt | undefined, pt: (n: number) => string): CSSProperties {
  if (!f) return {};
  const out: CSSProperties = {};
  if (f.font) {
    out.fontFamily = CSS_FONT[f.font] ?? f.font;
    if (f.font.endsWith("Light")) out.fontWeight = 300;
  }
  if (f.size) out.fontSize = pt(f.size);
  if (f.color) out.color = `#${f.color}`;
  if (f.bold !== undefined) out.fontWeight = f.bold ? 700 : 400;
  if (f.italic !== undefined) out.fontStyle = f.italic ? "italic" : "normal";
  if (f.underline !== undefined) out.textDecoration = f.underline ? "underline" : "none";
  if (f.align) {
    out.textAlign = f.align;
    // Ook voor vakken die met flexbox centreren.
    out.justifyContent = f.align === "center" ? "center" : f.align === "right" ? "flex-end" : "flex-start";
  }
  return out;
}

/** Opties voor pptxgenjs (addText). */
export function fmtPptx(f: TextFmt | undefined): {
  fontFace?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: { style: "sng" | "none" };
  align?: "left" | "center" | "right";
} {
  if (!f) return {};
  return {
    ...(f.font ? { fontFace: f.font } : {}),
    ...(f.size ? { fontSize: f.size } : {}),
    ...(f.color ? { color: f.color } : {}),
    ...(f.bold !== undefined ? { bold: f.bold } : {}),
    ...(f.italic !== undefined ? { italic: f.italic } : {}),
    ...(f.underline !== undefined ? { underline: { style: f.underline ? ("sng" as const) : ("none" as const) } } : {}),
    ...(f.align ? { align: f.align } : {}),
  };
}

/** Is er iets ingesteld? (voor het "Aa"-kenmerk in de editor) */
export const hasFmt = (f: TextFmt | undefined) => !!f && Object.values(f).some((v) => v !== undefined);
