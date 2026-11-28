/**
 * Uitdraai van de huidige pagina naar Excel of Word (in de browser), met het logo van Rouwmaat Groep.
 * De inhoud wordt uit de pagina zelf gehaald: koppen, tekst en tabellen; menu, filters, knoppen,
 * formulieren en grafiekafbeeldingen niet (zoals bij afdrukken).
 */

export type ExportBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "text"; text: string }
  | { kind: "table"; title?: string; rows: string[][]; headerRows: number };

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NAV",
  "FORM",
  "BUTTON",
  "SELECT",
  "INPUT",
  "TEXTAREA",
  "SVG",
  "SUMMARY",
  "NOSCRIPT",
  "TEMPLATE",
  "IMG",
  "CANVAS",
]);
const BLOCK_TAGS = new Set([
  "DIV",
  "P",
  "UL",
  "OL",
  "LI",
  "TABLE",
  "H1",
  "H2",
  "H3",
  "H4",
  "SECTION",
  "ARTICLE",
  "HEADER",
  "FOOTER",
  "DETAILS",
  "DL",
  "DT",
  "DD",
  "BLOCKQUOTE",
  "FIGURE",
]);

const clean = (s: string) =>
  s
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

function skipped(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName.toUpperCase())) return true;
  if (el.getAttribute("aria-hidden") === "true" || el.getAttribute("data-export") === "skip") return true;
  const cls = typeof el.className === "string" ? el.className : "";
  if (/(^|\s)print:hidden(\s|$)/.test(cls) || /(^|\s)sr-only(\s|$)/.test(cls)) return true;
  const cs = getComputedStyle(el);
  return cs.display === "none" || cs.visibility === "hidden";
}

/** Celtekst: zichtbare tekst zonder verborgen hulptekst (tooltips, schermlezerlabels). */
function cellText(td: Element): string {
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) parts.push(n.textContent ?? "");
    else if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as Element;
      if (skipped(el) && el.tagName !== "IMG") return;
      if (BLOCK_TAGS.has(el.tagName) && parts.length) parts.push("\n");
      // Kenmerken naast elkaar (bijv. normen "ISO 14001" "VCA**") gescheiden houden.
      else if (/(^|\s)badge(\s|$)/.test(typeof el.className === "string" ? el.className : "") && parts.length && !/[\s,]$/.test(parts[parts.length - 1]))
        parts.push(", ");
      if (el.tagName === "BR") parts.push("\n");
      el.childNodes.forEach(walk);
    }
  };
  td.childNodes.forEach(walk);
  return clean(parts.join(""));
}

function tableBlock(table: HTMLTableElement, title?: string): ExportBlock | null {
  const rows: string[][] = [];
  let headerRows = 0;
  for (const tr of Array.from(table.rows)) {
    if (skipped(tr)) continue;
    const cells = Array.from(tr.cells).filter((c) => !skipped(c));
    if (!cells.length) continue;
    const isHeader = tr.parentElement?.tagName === "THEAD" || cells.every((c) => c.tagName === "TH");
    const out: string[] = [];
    for (const c of cells) {
      out.push(cellText(c));
      for (let i = 1; i < (c.colSpan || 1); i++) out.push("");
    }
    if (out.every((v) => !v)) continue;
    if (isHeader && rows.length === headerRows) headerRows++;
    rows.push(out);
  }
  return rows.length ? { kind: "table", title, rows, headerRows } : null;
}

/**
 * Naam van een tabel: de kop in dezelfde kaart (section/.card) vóór de tabel, anders de eerste kopcel
 * als die kort is (bijv. "Scope 1"), anders geen (tabblad krijgt dan de naam van de pagina).
 */
function tableTitle(table: HTMLTableElement): string | undefined {
  // Eigen naam op de tabel (data-export-name), bijv. "Register" of "Risicomatrix bruto".
  const own = table.getAttribute("data-export-name");
  if (own) return own;
  const card = table.closest("section, .card, details");
  const heading = card ? Array.from(card.querySelectorAll("h2, h3")).find((h) => h.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
  if (heading) return clean(heading.textContent ?? "");
  const firstTh = table.querySelector("thead th");
  const th = firstTh ? clean(firstTh.textContent ?? "") : "";
  if (th && th.length <= 40 && !/^(nr|code|#)\.?$/i.test(th)) return th;
  // Register zonder eigen kop: tabblad krijgt de naam van de pagina.
  return undefined;
}

/** Koppen, tekst en tabellen van de pagina in leesvolgorde. */
export function collectBlocks(root: Element): ExportBlock[] {
  const out: ExportBlock[] = [];
  const push = (b: ExportBlock) => {
    const prev = out[out.length - 1];
    if (b.kind === "text" && prev?.kind === "text" && prev.text === b.text) return;
    out.push(b);
  };
  const visit = (el: Element) => {
    if (skipped(el)) return;
    const tag = el.tagName.toUpperCase();
    if (tag === "TABLE") {
      const t = tableBlock(el as HTMLTableElement, tableTitle(el as HTMLTableElement));
      if (t) push(t);
      return;
    }
    if (/^H[1-4]$/.test(tag)) {
      const text = clean(el.textContent ?? "");
      if (text) {
        push({ kind: "heading", level: (tag === "H1" ? 1 : tag === "H2" ? 2 : 3) as 1 | 2 | 3, text });
      }
      return;
    }
    const children = Array.from(el.children);
    const hasBlockChild = children.some((c) => BLOCK_TAGS.has(c.tagName.toUpperCase()) && !skipped(c));
    if (!hasBlockChild || tag === "P" || tag === "LI" || tag === "DT" || tag === "DD") {
      if (el.querySelector("table")) children.forEach(visit);
      else {
        const text = cellText(el);
        if (text) push({ kind: "text", text: tag === "LI" ? `• ${text}` : text });
      }
      return;
    }
    children.forEach(visit);
  };
  visit(root);
  return out;
}

/** Titel van de pagina: de h1 plus het actieve tabblad (bijv. "CO2-prestatieladder – Emissie-inventaris"). */
export function pageTitle(root: Element): string {
  const own = root.querySelector("[data-export-title]")?.getAttribute("data-export-title");
  if (own) return own;
  const h1 = clean(root.querySelector("h1")?.textContent ?? document.title);
  const tab = Array.from(root.querySelectorAll("nav a")).find((a) => /border-brand-red/.test(a.className));
  const tabText = tab ? clean(tab.textContent ?? "").replace(/\s*\d+$/, "") : "";
  return tabText && tabText !== h1 ? `${h1} – ${tabText}` : h1;
}

export function fileName(title: string, ext: string): string {
  const d = new Date().toISOString().slice(0, 10);
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019]/g, "")
    .replace(/[^\w\s-]+/g, " ")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 80);
  return `${base || "IMS"}-${d}.${ext}`;
}

export function download(bytes: Uint8Array | Blob, name: string, type: string) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Logo (PNG) met afmetingen, voor Excel en Word. */
export async function loadLogo(src: string): Promise<{ png: Uint8Array; width: number; height: number } | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const png = new Uint8Array(await res.arrayBuffer());
    // Afmetingen uit de PNG-kop (IHDR).
    const dv = new DataView(png.buffer);
    return { png, width: dv.getUint32(16), height: dv.getUint32(20) };
  } catch {
    return null;
  }
}

/** Tabbladen voor Excel: één per tabel (naam = kop erboven); zonder tabellen één blad met de tekst. */
export function blocksToSheets(title: string, subtitle: string, blocks: ExportBlock[]) {
  const tables = blocks.filter((b): b is Extract<ExportBlock, { kind: "table" }> => b.kind === "table");
  const texts = blocks.filter((b) => b.kind === "text").map((b) => (b as { text: string }).text);
  if (!tables.length) return [{ name: title, title, subtitle, tables: [], notes: texts }];
  // Tabellen zonder eigen kop: één → naam van de pagina (laatste deel, bijv. "Register"), meer → "Tabel n".
  const untitled = tables.filter((t) => !t.title).length;
  const pageName = title.split(" – ").pop() ?? title;
  return tables.map((t, i) => ({
    name: t.title ? t.title : untitled === 1 ? pageName : `Tabel ${i + 1}`,
    title: t.title && !title.includes(t.title) ? `${title} – ${t.title}` : title,
    subtitle,
    tables: [{ rows: t.rows, headerRows: t.headerRows }],
  }));
}
