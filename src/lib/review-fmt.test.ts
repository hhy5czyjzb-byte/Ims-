import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { parseSlideData } from "@/lib/review-model";
import { fmtCss, fmtPptx, hasFmt } from "@/lib/review-fmt";
import { buildReviewPptx } from "@/lib/review-pptx-export";

test("opmaak per veld: validatie, CSS en PowerPoint-opties", () => {
  const d = parseSlideData("CONTENT", {
    fmt: { title: { font: "Georgia", size: 30, color: "e30613", italic: true } },
    elements: [{ id: "a", type: "card", x: 3, y: 2, w: 4, h: 2, title: "Kaart", body: "Tekst", fmt: { body: { underline: true, align: "center" } } }],
  });
  assert.equal(d.fmt?.title?.color, "E30613", "kleur in hoofdletters");
  assert.throws(() => parseSlideData("CONTENT", { fmt: { title: { font: "Comic Sans" } } }), "onbekend lettertype geweigerd");
  assert.throws(() => parseSlideData("CONTENT", { fmt: { title: { size: 500 } } }), "te groot geweigerd");
  const css = fmtCss(d.fmt?.title, (n) => `${n}pt`);
  assert.equal(css.fontSize, "30pt");
  assert.equal(css.fontStyle, "italic");
  assert.match(String(css.fontFamily), /Georgia/);
  assert.deepEqual(fmtPptx({ bold: false, underline: true, align: "right" }), { bold: false, underline: { style: "sng" }, align: "right" });
  assert.deepEqual(fmtPptx(undefined), {});
  assert.equal(hasFmt({}), false);
  assert.equal(hasFmt({ size: 12 }), true);
});

test("PowerPoint bevat de gekozen opmaak", async () => {
  const pptx = buildReviewPptx(
    PptxGenJS,
    {
      title: "Test",
      logoImageId: null,
      stripImageId: null,
      footerText: null,
      slides: [
        {
          layout: "CONTENT",
          kicker: null,
          title: "Resultaten",
          imageId: null,
          hidden: false,
          data: {
            fmt: { title: { font: "Georgia", size: 30, color: "257DE0", italic: true } },
            elements: [{ id: "a", type: "check", x: 3.35, y: 2, w: 9, h: 0.7, text: "Actie", fmt: { text: { bold: true, underline: true } } }],
          },
        },
      ],
    },
    {},
  );
  const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  const xml = await (await JSZip.loadAsync(buf)).file("ppt/slides/slide1.xml")!.async("string");
  assert.match(xml, /sz="3000"[^>]*i="1"|i="1"[^>]*sz="3000"/, "titel 30 pt cursief");
  assert.match(xml, /typeface="Georgia"/);
  assert.match(xml, /257DE0/);
  assert.match(xml, /u="sng"/, "onderstreept");
});
