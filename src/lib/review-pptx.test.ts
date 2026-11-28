import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChart, parseDeck, deckMedia, applyMediaIds, resolvePath } from "@/lib/review-pptx-import";
import { parseSlideData, safeSlideData } from "@/lib/review-model";

const ns =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const E = (inch: number) => Math.round(inch * 914400);
const sp = (
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  text = "",
  opts: { fill?: string; size?: number; bold?: boolean; color?: string; ph?: string } = {},
) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="1" name="${name}"/><p:cNvSpPr/><p:nvPr>${opts.ph ? `<p:ph type="${opts.ph}"/>` : ""}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${E(x)}" y="${E(y)}"/><a:ext cx="${E(w)}" cy="${E(h)}"/></a:xfrm><a:prstGeom prst="rect"/>${opts.fill ? `<a:solidFill><a:srgbClr val="${opts.fill}"/></a:solidFill>` : ""}</p:spPr><p:txBody><a:bodyPr/>${text
    .split("\n")
    .map(
      (t) =>
        `<a:p><a:r><a:rPr sz="${(opts.size ?? 12) * 100}"${opts.bold ? ' b="1"' : ""}>${opts.color ? `<a:solidFill><a:srgbClr val="${opts.color}"/></a:solidFill>` : ""}</a:rPr><a:t>${t}</a:t></a:r></a:p>`,
    )
    .join("")}</p:txBody></p:sp>`;
const pic = (name: string, x: number, y: number, w: number, h: number, rid: string) =>
  `<p:pic><p:nvPicPr><p:cNvPr id="2" name="${name}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/></p:blipFill><p:spPr><a:xfrm><a:off x="${E(x)}" y="${E(y)}"/><a:ext cx="${E(w)}" cy="${E(h)}"/></a:xfrm></p:spPr></p:pic>`;
const slide = (body: string) => `<?xml version="1.0"?><p:sld ${ns}><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;
const rels = (map: Record<string, string>) =>
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Object.entries(map)
    .map(([id, t]) => `<Relationship Id="${id}" Type="x" Target="${t}"/>`)
    .join("")}</Relationships>`;

test("resolvePath lost relatieve paden op", () => {
  assert.equal(resolvePath("ppt/slides", "../media/image1.png"), "ppt/media/image1.png");
});

test("parseDeck herkent titel-, hoofdstuk- en inhoudsdia met kaarten, kengetal en oordeel", () => {
  const files: Record<string, string> = {
    "ppt/presentation.xml": `<p:presentation ${ns}><p:sldIdLst><p:sldId r:id="rId1"/><p:sldId r:id="rId2"/><p:sldId r:id="rId3"/></p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": rels({ rId1: "slides/slide1.xml", rId2: "slides/slide2.xml", rId3: "slides/slide3.xml" }),
    "ppt/slides/slide1.xml": slide(
      pic("Titelfoto", 0, 0, 13.3, 7.5, "rId1") +
        sp("Text 1", 0.7, 1.55, 6, 0.35, "ROUWMAAT GROEP", { size: 12, bold: true }) +
        sp("Text 2", 0.7, 1.95, 6.7, 1.6, "Managementreview 2025", { size: 44, bold: true }) +
        sp("Text 3", 0.7, 3.6, 6.7, 0.5, "Actualisatie", { size: 22 }) +
        pic("Logo", 0.7, 6.6, 2.2, 0.45, "rId2"),
    ),
    "ppt/slides/_rels/slide1.xml.rels": rels({ rId1: "../media/image1.jpg", rId2: "../media/logo.png" }),
    "ppt/slides/slide2.xml": slide(
      pic("Hoofdstukfoto", 0, 0, 6, 7.5, "rId1") +
        sp("Text 0", 6.7, 1.2, 5.5, 1.5, "01", { size: 96 }) +
        sp("Text 1", 6.7, 2.8, 6, 1.6, "Resultaten", { size: 38 }) +
        sp("Text 2", 6.7, 4.5, 5.9, 1.9, "Doelen\nRisico's", { size: 14 }),
    ),
    "ppt/slides/_rels/slide2.xml.rels": rels({ rId1: "../media/image2.jpg" }),
    "ppt/slides/slide3.xml": slide(
      pic("Fotostrook", 0, 0, 2.9, 7.5, "rId1") +
        sp("Text 1", 3.35, 0.42, 9.5, 0.28, "INLEIDING", { ph: "body", size: 10 }) +
        sp("Text 1", 3.35, 0.72, 9.5, 0.8, "Samenvatting", { ph: "title", size: 26 }) +
        sp("Kengetal", 3.35, 1.75, 2.2, 1.35, "", { fill: "F3F3F1" }) +
        sp("Text 4", 3.57, 1.87, 1.76, 0.7, "−7,4%", { size: 28, bold: true, color: "2E7D32" }) +
        sp("Text 5", 3.57, 2.59, 1.76, 0.37, "CO2 2025", { size: 10.5 }) +
        sp("Kaart", 3.35, 3.35, 4.65, 3.4, "", { fill: "F3F3F1" }) +
        sp("Icooncirkel", 3.6, 3.6, 0.46, 0.46, "", { fill: "2E7D32" }) +
        pic("Icoon", 3.715, 3.715, 0.23, 0.23, "rId2") +
        sp("Text 17", 4.2, 3.57, 3.6, 0.52, "Wat goed gaat", { size: 13, bold: true }) +
        sp("Text 18", 3.6, 4.23, 4.15, 2.37, "Punt 1\nPunt 2", { size: 12.5 }) +
        sp("Directie-oordeel", 3.35, 6.05, 9.5, 0.75, "", { fill: "FBE9EA" }) +
        sp("Text 20", 3.6, 6.05, 9, 0.75, "Directie-oordeel   ", { size: 12.5, bold: true }),
    ),
    "ppt/slides/_rels/slide3.xml.rels": rels({ rId1: "../media/strip.jpg", rId2: "../media/icon.png" }),
  };
  const deck = parseDeck(files);
  assert.equal(deck.slides.length, 3);
  assert.deepEqual(
    deck.slides.map((s) => s.layout),
    ["TITLE", "CHAPTER", "CONTENT"],
  );
  assert.equal(deck.slides[0].title, "Managementreview 2025");
  assert.equal(deck.logo, "ppt/media/logo.png");
  assert.deepEqual(deck.slides[1].data, { number: "01", items: ["Doelen", "Risico's"] });
  const c = deck.slides[2];
  assert.equal(c.kicker, "INLEIDING");
  assert.equal(c.title, "Samenvatting");
  assert.equal(c.image, "ppt/media/strip.jpg");
  const els = (c.data as { elements: { type: string }[] }).elements;
  assert.deepEqual(
    els.map((e) => e.type),
    ["kpi", "card", "judgment"],
  );
  const kpi = els[0] as unknown as { value: string; label: string; color: string };
  assert.equal(kpi.value, "−7,4%");
  assert.equal(kpi.label, "CO2 2025");
  assert.equal(kpi.color, "2E7D32");
  const card = els[1] as unknown as { title: string; body: string; iconColor: string; iconMedia: string };
  assert.equal(card.title, "Wat goed gaat");
  assert.equal(card.body, "Punt 1\nPunt 2");
  assert.equal(card.iconColor, "2E7D32");
  assert.equal(card.iconMedia, "ppt/media/icon.png");

  const media = deckMedia(deck);
  assert.ok(media.some((m) => m.path === "ppt/media/icon.png" && m.role === "icon"));
  assert.ok(media.some((m) => m.path === "ppt/media/strip.jpg" && m.role === "strip"));
  const ids = Object.fromEntries(media.map((m, i) => [m.path, `id${i}`]));
  const applied = applyMediaIds(deck, ids);
  // na het koppelen moet elke dia geldig zijn volgens het model
  for (const s of applied) assert.doesNotThrow(() => parseSlideData(s.layout, s.data));
  const appliedCard = (applied[2].data as { elements: { type: string; iconId?: string }[] }).elements[1];
  assert.equal(appliedCard.iconId, ids["ppt/media/icon.png"]);
});

test("parseChart leest categorieën, waarden, kleuren per staaf en titel", () => {
  const xml = `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>IF</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>IF</c:v></c:pt></c:strCache></c:strRef></c:tx><c:spPr><a:solidFill><a:srgbClr val="C9C9C9"/></a:solidFill></c:spPr><c:dPt><c:idx val="1"/><c:spPr><a:solidFill><a:srgbClr val="C00000"/></a:solidFill></c:spPr></c:dPt><c:dLbls><c:numFmt formatCode="0.0#"/></c:dLbls><c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>2024</c:v></c:pt><c:pt idx="1"><c:v>2025</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>4.5</c:v></c:pt><c:pt idx="1"><c:v>2.24</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`;
  const c = parseChart(xml);
  assert.equal(c.kind, "col");
  assert.equal(c.title, "IF");
  assert.deepEqual(c.categories, ["2024", "2025"]);
  assert.deepEqual(c.series, [{ name: "IF", values: [4.5, 2.24] }]);
  assert.deepEqual(c.colors, ["C9C9C9", "C00000"]);
  assert.equal(c.decimals, 1);
});

test("safeSlideData geeft lege standaard bij ongeldige gegevens", () => {
  assert.deepEqual(safeSlideData("CONTENT", { elements: [{ type: "onbekend" }] }), { elements: [] });
  assert.deepEqual(safeSlideData("CHAPTER", null), { number: "", items: [] });
});
