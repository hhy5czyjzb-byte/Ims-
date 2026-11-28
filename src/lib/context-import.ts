import { parseDocument } from "htmlparser2";
import { getOuterHTML, textContent } from "domutils";
import type { ChildNode, Element } from "domhandler";
import sanitizeHtml from "sanitize-html";
import type { ContextFactorKind, ObligationCharacter } from "@prisma/client";
import { normText } from "@/lib/spreadsheet-import";

/**
 * Context- en stakeholderanalyse uit Word (via mammoth omgezet naar HTML) opdelen in delen en paragrafen,
 * en de vaste tabellen (contextfactoren, stakeholders, verplichtingen, documentgegevens) herkennen.
 * Opbouw van het document: "DEEL n"-blokken (tabel), Kop 2 = paragraaf ("3.1 …"), Kop 1 = samenvatting.
 */

export type ParsedSection = {
  part: number;
  partTitle: string | null;
  partSubtitle: string | null;
  partKern: string | null;
  number: string | null;
  title: string;
  anchor: string;
  html: string;
};
export type ParsedFactor = {
  name: string;
  importance: string | null;
  character: string | null;
  ambition: string | null;
  kind: ContextFactorKind | null;
  sectionNumber: string | null;
};
export type ParsedStakeholder = { name: string; expectations: string | null; influenceLevel: string | null; howAddressed: string | null };
export type ParsedObligation = { stakeholderText: string; obligation: string; character: ObligationCharacter };
export type ParsedContext = {
  meta: {
    title: string | null;
    versionLabel: string | null;
    ownerText: string | null;
    reviewCycle: string | null;
    approvedByText: string | null;
    coverStatus: string | null;
  };
  sections: ParsedSection[];
  factors: ParsedFactor[];
  stakeholders: ParsedStakeholder[];
  obligations: ParsedObligation[];
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const isEl = (n: ChildNode): n is Element => n.type === "tag";
const children = (n: Element) => n.children.filter(isEl);
const rows = (table: Element): Element[] => {
  const out: Element[] = [];
  const walk = (el: Element) => {
    for (const c of children(el)) {
      if (c.name === "tr") out.push(c);
      else if (c.name === "thead" || c.name === "tbody" || c.name === "tfoot") walk(c);
    }
  };
  walk(table);
  return out;
};
const cells = (tr: Element) => children(tr).filter((c) => c.name === "td" || c.name === "th");
const cellText = (c: Element) => clean(textContent(c));
const paragraphs = (c: Element) =>
  children(c)
    .filter((p) => p.name === "p")
    .map((p) => clean(textContent(p)))
    .filter(Boolean);

export function slug(s: string): string {
  return normText(s).replace(/ /g, "-").slice(0, 60) || "sectie";
}

/** "DEEL"-blok: tabel waarvan de eerste cel met DEEL begint. */
function partBlock(el: Element): { part: number; title: string | null; subtitle: string | null; kern: string | null } | null {
  if (el.name !== "table") return null;
  const tr = rows(el)[0];
  if (!tr) return null;
  const c = cells(tr);
  if (!c.length || !/^deel\s*\d/i.test(cellText(c[0]))) return null;
  const n = Number(cellText(c[0]).replace(/\D+/g, ""));
  if (!Number.isInteger(n) || n < 1) return null;
  const p1 = c[1] ? paragraphs(c[1]) : [];
  const p2 = c[2] ? paragraphs(c[2]).filter((t) => !/^kern:?$/i.test(t)) : [];
  return { part: n, title: p1[0] ?? null, subtitle: p1[1] ?? null, kern: p2[0] ?? null };
}

/** Tabellen als tekst: kopregel + rijen. */
function tableData(el: Element): { header: string[]; body: string[][] } | null {
  const r = rows(el);
  if (r.length < 2) return null;
  return { header: cells(r[0]).map(cellText), body: r.slice(1).map((tr) => cells(tr).map(cellText)) };
}

const hdr = (h: string[]) => h.map((x) => normText(x));
const orNull = (s: string | undefined) => (s && s.trim() ? s.trim() : null);

export function parseObligationCharacter(s: string): ObligationCharacter {
  const v = normText(s);
  if (v.startsWith("contract")) return "CONTRACTUAL";
  if (v.startsWith("vrijwillig") || v.startsWith("eigen")) return "VOLUNTARY";
  return "LEGAL";
}

/** Woorden van 4+ letters, voor het koppelen van een contextfactor aan de paragraaf die hem beschrijft. */
const words = (s: string) =>
  new Set(
    normText(s)
      .split(" ")
      .filter((w) => w.length >= 4 && !["onze", "tussen", "naar"].includes(w)),
  );

export function matchFactorSection(
  name: string,
  sections: Pick<ParsedSection, "part" | "number" | "title">[],
): { kind: ContextFactorKind; sectionNumber: string } | null {
  const fw = words(name);
  let best: { score: number; s: Pick<ParsedSection, "part" | "number" | "title"> } | null = null;
  for (const s of sections) {
    if (!s.number || (s.part !== 3 && s.part !== 4)) continue;
    const sw = words(s.title);
    let score = 0;
    for (const w of fw) if (sw.has(w)) score++;
    if (score > 0 && (!best || score > best.score)) best = { score, s };
  }
  if (!best) return null;
  return { kind: best.s.part === 4 ? "INTERNAL" : "EXTERNAL", sectionNumber: best.s.number! };
}

export function parseContextHtml(html: string): ParsedContext {
  const doc = parseDocument(html);
  const top = doc.children;
  const sections: ParsedSection[] = [];
  const meta: ParsedContext["meta"] = { title: null, versionLabel: null, ownerText: null, reviewCycle: null, approvedByText: null, coverStatus: null };
  const factors: ParsedFactor[] = [];
  const stakeholders: ParsedStakeholder[] = [];
  const obligations: ParsedObligation[] = [];

  let part = { part: 0, title: null as string | null, subtitle: null as string | null, kern: null as string | null };
  let current: ParsedSection = { part: 0, partTitle: null, partSubtitle: null, partKern: null, number: null, title: "Voorblad", anchor: "voorblad", html: "" };
  const push = () => {
    if (current.html.replace(/<[^>]+>/g, "").trim() || /<img/i.test(current.html) || current.number) sections.push(current);
  };
  const start = (number: string | null, title: string) => {
    push();
    const anchor = number ? `p-${number.replace(/\./g, "-")}` : `${part.part ? `deel-${part.part}-` : ""}${slug(title)}`;
    current = { part: part.part, partTitle: part.title, partSubtitle: part.subtitle, partKern: part.kern, number, title, anchor, html: "" };
  };

  for (const node of top) {
    if (!isEl(node)) {
      if (node.type === "text" && node.data.trim()) current.html += node.data;
      continue;
    }
    const deel = partBlock(node);
    if (deel) {
      part = deel;
      start(null, deel.title ?? `Deel ${deel.part}`);
      continue;
    }
    if (node.name === "h1" || node.name === "h2") {
      const t = clean(textContent(node));
      const m = /^(\d+(?:\.\d+)*)\.?\s+(.+)$/.exec(t);
      start(m ? m[1] : null, m ? m[2] : t);
      continue;
    }
    // Voorblad: "Versie: 2026.01", "Status: Vastgesteld door directie"
    if (sections.length === 0 && current.title === "Voorblad" && node.name === "p") {
      const t = clean(textContent(node));
      const kv = /^(versie|status|document)\s*:\s*(.+)$/i.exec(t);
      if (kv) {
        const k = kv[1].toLowerCase();
        if (k === "versie") meta.versionLabel = kv[2];
        if (k === "status") meta.coverStatus = kv[2];
        if (k === "document" && !meta.title) meta.title = kv[2];
      }
    }
    if (node.name === "table") {
      const t = tableData(node);
      if (t) {
        const h = hdr(t.header);
        if (h[0] === "contextfactor" && h.includes("belang")) {
          for (const r of t.body)
            if (r[0]) factors.push({ name: r[0], importance: orNull(r[1]), character: orNull(r[2]), ambition: orNull(r[3]), kind: null, sectionNumber: null });
        } else if (h[0] === "stakeholder" && h.some((x) => x.startsWith("invloed"))) {
          for (const r of t.body)
            if (r[0]) stakeholders.push({ name: r[0], expectations: orNull(r[1]), influenceLevel: orNull(r[2]), howAddressed: orNull(r[3]) });
        } else if (h[0] === "belanghebbende" && h.includes("verplichting")) {
          for (const r of t.body)
            if (r[0] && r[1]) obligations.push({ stakeholderText: r[0], obligation: r[1], character: parseObligationCharacter(r[2] ?? "") });
        } else if (h.includes("document") && h.includes("versie") && h.includes("eigenaar")) {
          const r = t.body[0] ?? [];
          const at = (name: string) => orNull(r[h.findIndex((x) => x.startsWith(name))]);
          meta.title = at("document") ?? meta.title;
          meta.versionLabel = meta.versionLabel ?? at("versie");
          meta.ownerText = at("eigenaar");
          meta.reviewCycle = at("herziening");
          meta.approvedByText = at("vastgesteld");
        }
      }
    }
    current.html += getOuterHTML(node);
  }
  push();

  for (const f of factors) {
    const m = matchFactorSection(f.name, sections);
    if (m) Object.assign(f, m);
  }
  return { meta, sections, factors, stakeholders, obligations };
}

/** Alleen veilige opmaak: tekst, lijsten, tabellen, links (http/https/mailto) en afbeeldingen uit de eigen analyse. */
export function sanitizeContextHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "h3",
      "h4",
      "h5",
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "sup",
      "sub",
      "ul",
      "ol",
      "li",
      "blockquote",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "a",
      "img",
    ],
    allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: [] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" } }),
      h1: "h3",
      h2: "h3",
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !/^\/context\/afbeelding\/[0-9a-f-]{36}$/.test(frame.attribs.src ?? ""),
  });
}

/** Belanghebbenden in een verplichting ("Bevoegd gezag en Omgevingsdienst") koppelen aan stakeholders op naam. */
export function matchObligationStakeholders(text: string, stakeholders: { id: string; name: string }[]): string[] {
  const parts = text
    .split(/,| en | & |\//i)
    .map((p) => normText(p))
    .filter((p) => p.length >= 4);
  const ids = new Set<string>();
  for (const p of parts) {
    for (const s of stakeholders) {
      const n = normText(s.name);
      if (n === p || n.startsWith(p) || n.includes(` ${p}`) || n.split(" ").includes(p) || p.startsWith(n)) ids.add(s.id);
    }
  }
  return [...ids];
}
