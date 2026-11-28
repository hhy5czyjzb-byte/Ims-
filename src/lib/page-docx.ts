import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { ExportBlock } from "@/lib/page-export";

/**
 * Word-uitdraai (.docx) van een pagina: logo van Rouwmaat Groep in de koptekst van elke pagina,
 * titel en datum bovenaan, koppen, tekst en tabellen; voettekst met paginanummer.
 * Brede tabellen (meer dan 6 kolommen) → liggend.
 */
const FONT = "Arial";
const RED = "E30613";
const GREY = "666666";

export async function buildDocx(input: {
  title: string;
  subtitle: string;
  blocks: ExportBlock[];
  logo: { png: Uint8Array; width: number; height: number } | null;
}): Promise<Blob> {
  const { title, subtitle, blocks, logo } = input;
  const wide = blocks.some((b) => b.kind === "table" && Math.max(...b.rows.map((r) => r.length)) > 6);
  const logoWidth = 150;
  const header = new Header({
    children: [
      new Paragraph({
        children: [
          ...(logo
            ? [
                new ImageRun({
                  type: "png",
                  data: logo.png,
                  transformation: { width: logoWidth, height: Math.round((logoWidth * logo.height) / logo.width) },
                  altText: { name: "Logo", description: "Logo Rouwmaat Groep", title: "Rouwmaat Groep" },
                }),
              ]
            : [new TextRun({ text: "Rouwmaat Groep", bold: true, color: RED, font: FONT, size: 28 })]),
          new TextRun({ text: "\tIntegraal managementsysteem", color: GREY, font: FONT, size: 16 }),
        ],
        tabStops: [{ type: "right", position: wide ? 14_838 : 9_906 }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RED, space: 4 } },
      }),
    ],
  });
  const footer = new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: "right", position: wide ? 14_838 : 9_906 }],
        children: [
          new TextRun({ text: `Rouwmaat Groep · ${title}`, color: GREY, font: FONT, size: 16 }),
          new TextRun({ children: ["\tPagina ", PageNumber.CURRENT, " van ", PageNumber.TOTAL_PAGES], color: GREY, font: FONT, size: 16 }),
        ],
      }),
    ],
  });

  const body: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, bold: true, color: RED, font: FONT, size: 36 })] }),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: subtitle, color: GREY, font: FONT, size: 16 })] }),
  ];
  let first = true;
  for (const b of blocks) {
    if (b.kind === "heading") {
      // De h1 van de pagina staat al als titel bovenaan.
      if (first && b.level === 1) {
        first = false;
        continue;
      }
      body.push(
        new Paragraph({
          heading: b.level === 1 ? HeadingLevel.HEADING_1 : b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          spacing: { before: 240, after: 80 },
          keepNext: true,
          children: [new TextRun({ text: b.text, bold: true, font: FONT, size: b.level === 1 ? 28 : b.level === 2 ? 24 : 21 })],
        }),
      );
    } else if (b.kind === "text") {
      body.push(
        new Paragraph({
          spacing: { after: 60 },
          children: b.text
            .split("\n")
            .flatMap((line, i) => [...(i ? [new TextRun({ break: 1, text: "" })] : []), new TextRun({ text: line, font: FONT, size: 19 })]),
        }),
      );
    } else {
      const cols = Math.max(...b.rows.map((r) => r.length));
      body.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.AUTOFIT,
          rows: b.rows.map(
            (r, i) =>
              new TableRow({
                tableHeader: i < b.headerRows,
                cantSplit: true,
                children: Array.from({ length: cols }, (_, c) => {
                  const text = r[c] ?? "";
                  const header = i < b.headerRows;
                  const numeric = !header && /^-?[\d.]+(,\d+)?( ?(%|t|kg|GJ))?$/.test(text.trim());
                  return new TableCell({
                    shading: header ? { type: ShadingType.CLEAR, fill: "E5E5E5", color: "auto" } : undefined,
                    margins: { top: 40, bottom: 40, left: 80, right: 80 },
                    children: [
                      new Paragraph({
                        alignment: numeric ? AlignmentType.RIGHT : AlignmentType.LEFT,
                        children: text
                          .split("\n")
                          .flatMap((line, k) => [
                            ...(k ? [new TextRun({ break: 1, text: "" })] : []),
                            new TextRun({ text: line, bold: header, font: FONT, size: 17 }),
                          ]),
                      }),
                    ],
                  });
                }),
              }),
          ),
        }),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
      );
    }
    first = false;
  }

  const doc = new Document({
    creator: "Rouwmaat Groep · IMS",
    title,
    styles: { default: { document: { run: { font: FONT, size: 19 } } } },
    sections: [
      {
        properties: {
          page: {
            // docx wisselt breedte en hoogte zelf om bij liggend.
            size: { orientation: wide ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT, width: 11_906, height: 16_838 },
            margin: { top: 1_100, bottom: 1_000, left: 1_000, right: 1_000, header: 500, footer: 500 },
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children: body,
      },
    ],
  });
  return Packer.toBlob(doc);
}
