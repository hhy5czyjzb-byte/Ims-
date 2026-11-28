import { DOMParser } from "@xmldom/xmldom";
import {
  REVIEW_THEME,
  type Cell,
  type ChapterData,
  type ConclusionData,
  type Para,
  type SlideElement,
  type SlideLayout,
  type TitleData,
} from "@/lib/review-model";

/**
 * Inlezen van een PowerPoint-template (pptx) als dia's voor de directiebeoordeling.
 * Puur (geen DOM van de browser nodig, @xmldom), zodat het in de browser draait én te testen is.
 * Herkent de vormen uit het template van Rouwmaat op naam (Kaart, Kengetal, Directie-oordeel, Besluitblok, Actie,
 * Tabel, grafieken, Titelfoto/Hoofdstukfoto/Conclusiefoto, Fotostrook, Logo); overige tekstvakken worden tekst.
 */

const EMU = 914400;
const inch = (v: string | null | undefined) => Math.round((Number(v ?? 0) / EMU) * 1000) / 1000;

type El = Element;
const kids = (el: El | null | undefined, name: string): El[] =>
  el ? (Array.from(el.childNodes).filter((n) => n.nodeType === 1 && (n as El).nodeName === name) as El[]) : [];
const kid = (el: El | null | undefined, name: string): El | null => kids(el, name)[0] ?? null;
const desc = (el: El | Document | null | undefined, name: string): El[] => (el ? Array.from(el.getElementsByTagName(name)) : []);
const first = (el: El | Document | null | undefined, name: string): El | null => desc(el, name)[0] ?? null;
const attr = (el: El | null | undefined, name: string) => el?.getAttribute(name) ?? null;

function parseXml(xml: string): Document {
  return new DOMParser({ errorHandler: () => {} }).parseFromString(xml, "text/xml") as unknown as Document;
}

/** Relaties (rId → doelpad, opgelost t.o.v. de map van het bestand). */
export function parseRels(xml: string | undefined, baseDir: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!xml) return map;
  for (const r of desc(parseXml(xml), "Relationship")) {
    const id = attr(r, "Id");
    const target = attr(r, "Target");
    if (!id || !target || attr(r, "TargetMode") === "External") continue;
    map.set(id, resolvePath(baseDir, target));
  }
  return map;
}

export function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = baseDir.split("/").filter(Boolean);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/** Volgorde van de dia's uit presentation.xml. */
export function slideOrder(files: Record<string, string>): string[] {
  const rels = parseRels(files["ppt/_rels/presentation.xml.rels"], "ppt");
  const doc = parseXml(files["ppt/presentation.xml"] ?? "<x/>");
  const order = desc(doc, "p:sldId")
    .map((s) => rels.get(attr(s, "r:id") ?? "") ?? "")
    .filter(Boolean);
  if (order.length) return order;
  return Object.keys(files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/g)!.pop()) - Number(b.match(/\d+/g)!.pop()));
}

type Shape = {
  kind: "sp" | "pic" | "table" | "chart" | "line";
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  geom?: string;
  paras?: Para[];
  media?: string;
  placeholder?: string | null;
  tableEl?: El;
  txBody?: El;
  chartPath?: string;
};

function xfrm(el: El) {
  const x = first(el, "a:xfrm") ?? first(el, "p:xfrm");
  const off = kid(x, "a:off");
  const ext = kid(x, "a:ext");
  return { x: inch(attr(off, "x")), y: inch(attr(off, "y")), w: inch(attr(ext, "cx")), h: inch(attr(ext, "cy")) };
}

function solidFill(spPr: El | null): string | undefined {
  const f = kid(spPr, "a:solidFill");
  const c = kid(f, "a:srgbClr");
  return attr(c, "val")?.toUpperCase() ?? undefined;
}

/** Alinea's met de opmaak van de eerste tekstrun. Lege alinea's vervallen. */
export function readParas(txBody: El | null): Para[] {
  const out: Para[] = [];
  for (const p of kids(txBody, "a:p")) {
    const runs = [...kids(p, "a:r"), ...kids(p, "a:fld")];
    const textValue = runs
      .map((r) =>
        desc(r, "a:t")
          .map((t) => t.textContent ?? "")
          .join(""),
      )
      .join("");
    if (!textValue.trim()) continue;
    const rPr = kid(runs[0], "a:rPr");
    const sz = attr(rPr, "sz");
    const color = attr(first(rPr, "a:srgbClr"), "val")?.toUpperCase();
    const pPr = kid(p, "a:pPr");
    const para: Para = { text: textValue };
    if (attr(rPr, "b") === "1") para.bold = true;
    if (color) para.color = color;
    if (sz) para.size = Number(sz) / 100;
    if (kid(pPr, "a:buChar")) para.bullet = true;
    out.push(para);
  }
  return out;
}

/** Tekstruns van één alinea apart (voor "Directie-oordeel   tekst"). */
function paraRuns(txBody: El | null): { text: string; bold: boolean }[][] {
  return kids(txBody, "a:p").map((p) =>
    kids(p, "a:r").map((r) => ({
      text: desc(r, "a:t")
        .map((t) => t.textContent ?? "")
        .join(""),
      bold: attr(kid(r, "a:rPr"), "b") === "1",
    })),
  );
}

function readShapes(doc: Document, rels: Map<string, string>): Shape[] {
  const tree = first(doc, "p:spTree");
  const shapes: Shape[] = [];
  const walk = (parent: El | null) => {
    for (const n of Array.from(parent?.childNodes ?? [])) {
      if (n.nodeType !== 1) continue;
      const el = n as El;
      const nv = first(el, "p:cNvPr");
      const name = attr(nv, "name") ?? "";
      if (el.nodeName === "p:grpSp") {
        walk(el);
        continue;
      }
      if (el.nodeName === "p:sp") {
        const spPr = kid(el, "p:spPr");
        const geom = attr(kid(spPr, "a:prstGeom"), "prst") ?? undefined;
        const ph = first(kid(el, "p:nvSpPr"), "p:ph");
        shapes.push({
          kind: geom === "line" ? "line" : "sp",
          name,
          ...xfrm(spPr ?? el),
          fill: solidFill(spPr),
          geom,
          paras: readParas(kid(el, "p:txBody")),
          placeholder: ph ? (attr(ph, "type") ?? "body") : null,
          txBody: kid(el, "p:txBody") ?? undefined,
        });
      } else if (el.nodeName === "p:cxnSp") {
        shapes.push({ kind: "line", name, ...xfrm(el) });
      } else if (el.nodeName === "p:pic") {
        const blip = first(el, "a:blip");
        shapes.push({ kind: "pic", name, ...xfrm(kid(el, "p:spPr") ?? el), media: rels.get(attr(blip, "r:embed") ?? "") });
      } else if (el.nodeName === "p:graphicFrame") {
        const tbl = first(el, "a:tbl");
        const chart = first(el, "c:chart");
        const pos = xfrm(el);
        if (tbl) shapes.push({ kind: "table", name, ...pos, tableEl: tbl });
        else if (chart) shapes.push({ kind: "chart", name, ...pos, chartPath: rels.get(attr(chart, "r:id") ?? "") });
      }
    }
  };
  walk(tree);
  return shapes;
}

const inside = (s: { x: number; y: number; w: number; h: number }, c: { x: number; y: number; w: number; h: number }) => {
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  return cx >= c.x - 0.02 && cx <= c.x + c.w + 0.02 && cy >= c.y - 0.02 && cy <= c.y + c.h + 0.02;
};

const CONTAINERS = ["Kaart", "Kengetal", "Directie-oordeel", "Besluitblok", "Actie"];
const IGNORE = ["Fotostrook", "Logovlak", "Logo", "Overlay", "Icooncirkel", "Icoon", "Vinkvak", "Lijn"];
const PHOTOS = ["Titelfoto", "Hoofdstukfoto", "Conclusiefoto"];
const baseName = (n: string) => n.replace(/\s+\d+$/, "").trim();

export function parseTable(tbl: El): { colW: number[]; rowH: number; header: string[]; rows: Cell[][]; fontSize?: number } {
  const colW = kids(kid(tbl, "a:tblGrid"), "a:gridCol").map((c) => inch(attr(c, "w")));
  const trs = kids(tbl, "a:tr");
  const cellOf = (tc: El): Cell => {
    const paras = readParas(kid(tc, "a:txBody"));
    const cell: Cell = { text: paras.map((p) => p.text).join("\n") };
    if (paras[0]?.bold) cell.bold = true;
    if (paras[0]?.color && paras[0].color !== REVIEW_THEME.ink) cell.color = paras[0].color;
    return cell;
  };
  const header = trs[0] ? kids(trs[0], "a:tc").map((tc) => cellOf(tc).text) : [];
  const rows = trs.slice(1).map((tr) => kids(tr, "a:tc").map(cellOf));
  const sizes = trs.slice(1, 2).flatMap((tr) => kids(tr, "a:tc").flatMap((tc) => readParas(kid(tc, "a:txBody")).map((p) => p.size ?? 0)));
  const fontSize = sizes.find((s) => s > 0);
  return { colW, rowH: inch(attr(trs[1] ?? trs[0], "h")) || 0.45, header, rows, fontSize };
}

export function parseChart(xml: string): {
  kind: "col" | "bar";
  categories: string[];
  series: { name: string; values: number[] }[];
  colors: string[];
  decimals: number;
  title?: string;
} {
  const doc = parseXml(xml);
  const titleEl = first(doc, "c:title");
  const title = desc(titleEl, "a:t")
    .map((t) => t.textContent ?? "")
    .join("")
    .trim();
  const kind = attr(first(doc, "c:barDir"), "val") === "bar" ? "bar" : "col";
  const series: { name: string; values: number[] }[] = [];
  let categories: string[] = [];
  let colors: string[] = [];
  let decimals = 0;
  const fmt = attr(first(first(doc, "c:dLbls"), "c:numFmt"), "formatCode") ?? "";
  if (/0[.,]0/.test(fmt)) decimals = 1;
  desc(doc, "c:ser").forEach((ser, si) => {
    const name = desc(kid(ser, "c:tx"), "c:v")[0]?.textContent ?? `Reeks ${si + 1}`;
    const cat = kid(ser, "c:cat");
    const cats = desc(cat, "c:pt").map((p) => first(p, "c:v")?.textContent ?? "");
    if (si === 0) categories = cats;
    const valPts = desc(kid(ser, "c:val"), "c:pt");
    const values = categories.map((_, i) => {
      const pt = valPts.find((p) => attr(p, "idx") === String(i));
      const v = Number(first(pt, "c:v")?.textContent ?? 0);
      return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0;
    });
    series.push({ name, values });
    if (si === 0) {
      const base = solidFill(kid(ser, "c:spPr")) ?? "C9C9C9";
      colors = categories.map(() => base);
      for (const dpt of kids(ser, "c:dPt")) {
        const idx = Number(attr(kid(dpt, "c:idx"), "val"));
        const c = solidFill(kid(dpt, "c:spPr"));
        if (c && idx < colors.length) colors[idx] = c;
      }
    }
  });
  return { kind, categories, series: series.length ? series : [{ name: "Reeks 1", values: [] }], colors, decimals, ...(title ? { title } : {}) };
}

export type ImportedSlide = {
  layout: SlideLayout;
  kicker: string | null;
  title: string;
  /** Pad van de foto in het pptx-bestand (wordt na upload een afbeeldings-id). */
  image: string | null;
  data: TitleData | ChapterData | ConclusionData | { elements: (SlideElement & { iconMedia?: string })[] };
};

export type ImportedDeck = { slides: ImportedSlide[]; logo: string | null; strip: string | null; footer: string | null; warnings: string[] };

let seq = 0;
const nextId = () => `i${(++seq).toString(36)}`;

/** Eén dia inlezen. */
export function parseSlide(
  xml: string,
  relsXml: string | undefined,
  slidePath: string,
  files: Record<string, string>,
): { slide: ImportedSlide; logo?: string; strip?: string } {
  const dir = slidePath.split("/").slice(0, -1).join("/");
  const rels = parseRels(relsXml, dir);
  const doc = parseXml(xml);
  const shapes = readShapes(doc, rels);
  const photo = shapes.find((s) => s.kind === "pic" && PHOTOS.includes(baseName(s.name)));
  const logo = shapes.find((s) => s.kind === "pic" && baseName(s.name) === "Logo")?.media;
  const strip = shapes.find((s) => s.kind === "pic" && baseName(s.name) === "Fotostrook")?.media;
  const texts = shapes.filter(
    (s) => s.kind === "sp" && s.paras && s.paras.length > 0 && !CONTAINERS.includes(baseName(s.name)) && !s.name.startsWith("Slide Number"),
  );
  const byY = [...texts].sort((a, b) => a.y - b.y || a.x - b.x);
  const allText = (s: Shape) => (s.paras ?? []).map((p) => p.text).join("\n");

  if (photo && baseName(photo.name) === "Titelfoto") {
    const t = byY.filter((s) => s.x < 7.6);
    const big = t.reduce<Shape | null>((m, s) => ((s.paras?.[0]?.size ?? 0) > (m?.paras?.[0]?.size ?? 0) ? s : m), null);
    const after = t.filter((s) => s !== big && big && s.y > big.y);
    const before = t.filter((s) => big && s.y < big.y);
    const data: TitleData = {
      brand: before.map(allText).join(" ") || "ROUWMAAT GROEP",
      subtitle: after[0] ? allText(after[0]) : "",
      normsLine: after[1] ? allText(after[1]) : "",
      tagline: after[2] ? allText(after[2]) : "",
      dateText: after[3] ? allText(after[3]) : "",
    };
    return { slide: { layout: "TITLE", kicker: null, title: big ? allText(big) : "Managementreview", image: photo.media ?? null, data }, logo };
  }

  if (photo && baseName(photo.name) === "Hoofdstukfoto") {
    const sizes = byY.map((s) => s.paras?.[0]?.size ?? 0);
    const numIdx = sizes.findIndex((s) => s >= 60);
    const number = numIdx >= 0 ? allText(byY[numIdx]) : "";
    const rest = byY.filter((_, i) => i !== numIdx);
    const titleShape = rest.reduce<Shape | null>((m, s) => ((s.paras?.[0]?.size ?? 0) > (m?.paras?.[0]?.size ?? 0) ? s : m), null);
    const items = rest.filter((s) => s !== titleShape).flatMap((s) => (s.paras ?? []).map((p) => p.text));
    return {
      slide: { layout: "CHAPTER", kicker: null, title: titleShape ? allText(titleShape) : "", image: photo.media ?? null, data: { number, items } },
      logo,
    };
  }

  if (photo && baseName(photo.name) === "Conclusiefoto") {
    const lines = shapes.filter((s) => s.kind === "line").sort((a, b) => a.x - b.x);
    const kickerShape = byY[0];
    const columns = lines.length
      ? lines.map((l) => {
          const col = byY.filter((s) => s.x >= l.x - 0.05 && s.x < l.x + l.w && s.y > l.y);
          return { title: col[0] ? allText(col[0]) : "", text: col.slice(1).map(allText).join("\n") };
        })
      : [];
    return {
      slide: {
        layout: "CONCLUSION",
        kicker: kickerShape ? allText(kickerShape) : "CONCLUSIE",
        title: kickerShape ? allText(kickerShape) : "Conclusie",
        image: photo.media ?? null,
        data: { columns },
      },
      logo,
    };
  }

  // Inhoudsdia
  const phs = texts.filter((s) => s.placeholder);
  const titleShape = phs.find((s) => s.placeholder === "title") ?? byY.find((s) => (s.paras?.[0]?.size ?? 0) >= 20);
  const kickerShape = phs.find((s) => s !== titleShape && s.y < (titleShape?.y ?? 1)) ?? byY.find((s) => s !== titleShape && s.y < 0.7);
  const used = new Set<Shape>([titleShape, kickerShape].filter(Boolean) as Shape[]);
  const elements: (SlideElement & { iconMedia?: string })[] = [];

  for (const c of shapes.filter((s) => s.kind === "sp" && CONTAINERS.includes(baseName(s.name)))) {
    const inner = byY.filter((s) => !used.has(s) && inside(s, c));
    inner.forEach((s) => used.add(s));
    const box = { id: nextId(), x: c.x, y: c.y, w: c.w, h: c.h };
    const type = baseName(c.name);
    if (type === "Kengetal") {
      // Waarde = grootste tekst; erboven een kopje (optioneel), eronder de toelichting.
      const v = inner.reduce<Shape | undefined>((m, s) => ((s.paras?.[0]?.size ?? 0) > (m?.paras?.[0]?.size ?? 0) ? s : m), undefined);
      const caption = inner
        .filter((s) => v && s.y < v.y)
        .map(allText)
        .join(" ");
      const label = inner
        .filter((s) => v && s !== v && s.y > v.y)
        .map(allText)
        .join(" ");
      elements.push({ ...box, type: "kpi", value: v ? allText(v) : "", label, ...(caption ? { caption } : {}), color: v?.paras?.[0]?.color });
    } else if (type === "Kaart") {
      const circle = shapes.find((s) => baseName(s.name) === "Icooncirkel" && inside(s, c));
      const icon = shapes.find((s) => s.kind === "pic" && baseName(s.name) === "Icoon" && inside(s, c));
      const titleIdx = inner.findIndex((s) => s.paras?.[0]?.bold);
      const title = titleIdx >= 0 ? inner[titleIdx] : undefined;
      const bodyParas = inner.filter((s) => s !== title).flatMap((s) => s.paras ?? []);
      elements.push({
        ...box,
        type: "card",
        title: title ? allText(title) : "",
        body: bodyParas.map((p) => p.text).join("\n"),
        bullets: bodyParas.length > 0 && bodyParas.every((p) => p.bullet),
        bodySize: bodyParas[0]?.size,
        iconColor: circle?.fill,
        iconMedia: icon?.media,
      });
    } else if (type === "Directie-oordeel") {
      const runs = inner.flatMap((s) => paraRuns(s.txBody ?? null));
      const flat = runs.flat();
      const label = flat
        .filter((r) => r.bold)
        .map((r) => r.text)
        .join("")
        .trim();
      const rest = runs
        .map((p) =>
          p
            .filter((r) => !r.bold)
            .map((r) => r.text)
            .join("")
            .trim(),
        )
        .filter(Boolean)
        .join("\n");
      const stacked = runs.length > 1 && runs[0].every((r) => r.bold);
      elements.push({ ...box, type: "judgment", label: label || "Directie-oordeel", text: rest, stacked });
    } else if (type === "Besluitblok") {
      const paras = inner.flatMap((s) => s.paras ?? []);
      elements.push({ ...box, type: "decisions", heading: paras[0]?.text ?? "BESLUITEN DIRECTIE", items: paras.slice(1).map((p) => p.text) });
    } else if (type === "Actie") {
      elements.push({ ...box, type: "check", text: inner.map(allText).join("\n") });
    }
  }

  for (const s of shapes) {
    if (s.kind === "table" && s.tableEl) elements.push({ id: nextId(), type: "table", x: s.x, y: s.y, w: s.w, h: s.h, ...parseTable(s.tableEl) });
    if (s.kind === "chart" && s.chartPath && files[s.chartPath])
      elements.push({ id: nextId(), type: "chart", x: s.x, y: s.y, w: s.w, h: s.h, ...parseChart(files[s.chartPath]) });
  }

  for (const s of byY) {
    if (used.has(s) || IGNORE.includes(baseName(s.name))) continue;
    elements.push({ id: nextId(), type: "text", x: s.x, y: s.y, w: s.w, h: s.h, paras: s.paras ?? [] });
  }

  elements.sort((a, b) => a.y - b.y || a.x - b.x);
  return {
    slide: {
      layout: "CONTENT",
      kicker: kickerShape ? allText(kickerShape) : null,
      title: titleShape ? allText(titleShape) : "",
      image: strip ?? null,
      data: { elements },
    },
    logo,
    strip,
  };
}

/** Voettekst uit de dia-opmaak (klein tekstvak onderaan, geen paginanummer). */
function layoutFooter(files: Record<string, string>, slideRelsPath: string): string | null {
  const rels = parseRels(files[slideRelsPath], "ppt/slides");
  const layout = [...rels.values()].find((p) => p.includes("slideLayouts/"));
  if (!layout || !files[layout]) return null;
  const shapes = readShapes(parseXml(files[layout]), new Map());
  const f = shapes.find(
    (s) => s.kind === "sp" && s.y > 6.8 && !s.name.startsWith("Slide Number") && (s.paras ?? []).length > 0 && !/‹|<nr/.test(s.paras![0].text),
  );
  return f ? (f.paras ?? []).map((p) => p.text).join(" ") : null;
}

/** Hele presentatie inlezen. `files` bevat de XML-bestanden (pad → inhoud). */
export function parseDeck(files: Record<string, string>): ImportedDeck {
  seq = 0;
  const warnings: string[] = [];
  const slides: ImportedSlide[] = [];
  let logo: string | null = null;
  let strip: string | null = null;
  let footer: string | null = null;
  for (const path of slideOrder(files)) {
    const xml = files[path];
    if (!xml) continue;
    const relsPath = path.replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels");
    try {
      const r = parseSlide(xml, files[relsPath], path, files);
      slides.push(r.slide);
      logo ??= r.logo ?? null;
      strip ??= r.strip ?? null;
      if (!footer && r.slide.layout === "CONTENT") footer = layoutFooter(files, relsPath);
    } catch (e) {
      warnings.push(`${path}: niet ingelezen (${(e as Error).message})`);
    }
  }
  return { slides, logo, strip, footer, warnings };
}

/** Mediabestanden die nodig zijn (foto's, logo, fotostrook, iconen) met hun rol. */
export function deckMedia(deck: ImportedDeck): { path: string; role: "photo" | "logo" | "strip" | "icon" }[] {
  const out = new Map<string, "photo" | "logo" | "strip" | "icon">();
  if (deck.logo) out.set(deck.logo, "logo");
  if (deck.strip) out.set(deck.strip, "strip");
  for (const s of deck.slides) {
    if (s.image && !out.has(s.image)) out.set(s.image, s.layout === "CONTENT" ? "strip" : "photo");
    if (s.layout === "CONTENT")
      for (const e of (s.data as { elements: (SlideElement & { iconMedia?: string })[] }).elements)
        if (e.type === "card" && e.iconMedia) out.set(e.iconMedia, "icon");
  }
  return [...out.entries()].map(([path, role]) => ({ path, role }));
}

/** Mediapaden vervangen door afbeeldings-ids (na upload). */
export function applyMediaIds(deck: ImportedDeck, ids: Record<string, string>) {
  return deck.slides.map((s) => {
    const base = { layout: s.layout, kicker: s.kicker, title: s.title, imageId: s.image ? (ids[s.image] ?? null) : null };
    if (s.layout !== "CONTENT") return { ...base, data: s.data };
    const elements = (s.data as { elements: (SlideElement & { iconMedia?: string })[] }).elements.map((e) => {
      if (e.type !== "card") return e;
      const { iconMedia, ...rest } = e;
      return { ...rest, iconId: iconMedia ? (ids[iconMedia] ?? null) : null };
    });
    return { ...base, data: { elements } };
  });
}
