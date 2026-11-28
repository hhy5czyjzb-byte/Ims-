import JSZip from "jszip";

/**
 * Eenvoudige .xlsx-schrijver (Office Open XML) op basis van JSZip, zonder het verouderde npm-pakket `xlsx`.
 * Per tabblad: logo linksboven, titel en regel met datum/gebruiker, daarna één of meer tabellen
 * (kopregel vet met grijze achtergrond, getallen als echte getallen, kolombreedte op de inhoud).
 */

export type SheetTable = { title?: string; rows: string[][]; headerRows: number };
export type SheetInput = { name: string; title: string; subtitle?: string; tables: SheetTable[]; notes?: string[] };

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Ongeldige XML-tekens (stuurtekens) weglaten.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/** Kolomletter(s): 0 → A, 25 → Z, 26 → AA. */
export function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * Getal uit een cel in Nederlandse notatie ("5.723,9", "-12", "1.234") → number; anders null.
 * Percentages, eenheden en codes (bijv. "W001", "12-03-2026") blijven tekst.
 */
export function cellNumber(text: string): number | null {
  const s = text.trim();
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(s)) return null;
  // Voorloopnullen (bijv. postcode, artikelnummer "007") als tekst houden.
  if (/^-?0\d/.test(s)) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Tabbladnaam: max. 31 tekens, zonder : \ / ? * [ ], uniek binnen de werkmap. */
export function sheetName(name: string, used: Set<string>): string {
  const base = (
    name
      .replace(/[:\\/?*[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Blad"
  ).slice(0, 31);
  let n = base;
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  used.add(n.toLowerCase());
  return n;
}

// Stijlen: 0 standaard, 1 kopregel, 2 titel, 3 getal, 4 tekst met terugloop, 5 subtitel, 6 tabeltitel
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.###"/></numFmts>
<fonts count="5">
<font><sz val="10"/><name val="Arial"/></font>
<font><b/><sz val="10"/><name val="Arial"/></font>
<font><b/><sz val="14"/><color rgb="FFE30613"/><name val="Arial"/></font>
<font><sz val="9"/><color rgb="FF666666"/><name val="Arial"/></font>
<font><b/><sz val="11"/><name val="Arial"/></font>
</fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5E5E5"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFBCBCBB"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const LOGO_ROWS = 3; // rij 1–3 voor het logo

function sheetXml(sheet: SheetInput, hasLogo: boolean): string {
  const rows: string[] = [];
  const widths: number[] = [];
  let r = 0;
  let headerRow: number | null = null;
  const cell = (c: number, text: string, style: number) => {
    const ref = `${colName(c)}${r}`;
    const num = style === 0 ? cellNumber(text) : null;
    if (num !== null) return `<c r="${ref}" s="3"><v>${num}</v></c>`;
    if (!text) return "";
    return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
  };
  const row = (cells: string, height?: number) => {
    r++;
    rows.push(`<row r="${r}"${height ? ` ht="${height}" customHeight="1"` : ""}>${cells}</row>`);
  };
  if (hasLogo) for (let i = 0; i < LOGO_ROWS; i++) row("", 16);
  r++;
  rows.push(`<row r="${r}" ht="20" customHeight="1">${cell(0, sheet.title, 2)}</row>`);
  if (sheet.subtitle) {
    r++;
    rows.push(`<row r="${r}">${cell(0, sheet.subtitle, 5)}</row>`);
  }
  for (const t of sheet.tables) {
    r++; // lege regel
    rows.push(`<row r="${r}"/>`);
    if (t.title) {
      r++;
      rows.push(`<row r="${r}">${cell(0, t.title, 6)}</row>`);
    }
    t.rows.forEach((cells, i) => {
      const header = i < t.headerRows;
      r++;
      if (header && headerRow === null && sheet.tables.length === 1) headerRow = r;
      rows.push(`<row r="${r}">${cells.map((v, c) => cell(c, v, header ? 1 : 0)).join("")}</row>`);
      cells.forEach((v, c) => {
        const len = Math.max(...v.split("\n").map((l) => l.length));
        widths[c] = Math.max(widths[c] ?? 8, Math.min(60, len + 2));
      });
    });
  }
  for (const n of sheet.notes ?? []) {
    r++;
    rows.push(`<row r="${r}">${cell(0, n, 4)}</row>`);
  }
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  // Kopregel vastzetten bij één tabel per tabblad.
  const pane =
    headerRow !== null
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>${pane}<sheetFormatPr defaultRowHeight="13"/>${cols}<sheetData>${rows.join("")}</sheetData><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${widths.length > 6 ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L${esc("Rouwmaat Groep · IMS")}&amp;RPagina &amp;P van &amp;N</oddFooter></headerFooter>${hasLogo ? `<drawing r:id="rId1"/>` : ""}</worksheet>`;
}

function drawingXml(logo: { width: number; height: number }): string {
  // Logo ca. 190 px breed (verhouding behouden); 1 px = 9525 EMU.
  const w = 190;
  const h = Math.round((w * logo.height) / logo.width);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${w * 9525}" cy="${h * 9525}"/>
<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo Rouwmaat Groep" descr="Logo Rouwmaat Groep"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>
<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w * 9525}" cy="${h * 9525}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>
</xdr:wsDr>`;
}

/** Werkmap als bytes. `logo` = PNG met afmetingen (optioneel). */
export async function buildXlsx(sheets: SheetInput[], logo?: { png: Uint8Array; width: number; height: number } | null): Promise<Uint8Array> {
  const zip = new JSZip();
  const used = new Set<string>();
  const names = sheets.map((s) => sheetName(s.name, used));
  const hasLogo = !!logo;
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${hasLogo ? `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : ""}`,
      )
      .join("")}</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
  );
  zip.file(
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(sheets[0]?.title ?? "")}</dc:title><dc:creator>Rouwmaat Groep · IMS</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join(
        "",
      )}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file("xl/styles.xml", STYLES);
  sheets.forEach((s, i) => {
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s, hasLogo));
    if (logo) {
      zip.file(
        `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${i + 1}.xml"/></Relationships>`,
      );
      zip.file(`xl/drawings/drawing${i + 1}.xml`, drawingXml(logo));
      zip.file(
        `xl/drawings/_rels/drawing${i + 1}.xml.rels`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/></Relationships>`,
      );
    }
  });
  if (logo) zip.file("xl/media/logo.png", logo.png);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
