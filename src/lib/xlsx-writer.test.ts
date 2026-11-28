import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import readXlsxFile from "read-excel-file/node";
import { buildXlsx, cellNumber, colName, sheetName } from "@/lib/xlsx-writer";

test("hulpfuncties: kolomnamen, getallen in NL-notatie, tabbladnamen", () => {
  assert.deepEqual([colName(0), colName(25), colName(26), colName(701)], ["A", "Z", "AA", "ZZ"]);
  assert.equal(cellNumber("5.723,9"), 5723.9);
  assert.equal(cellNumber("-12"), -12);
  assert.equal(cellNumber("1.234"), 1234);
  assert.equal(cellNumber("12,5 %"), null);
  assert.equal(cellNumber("W001"), null);
  assert.equal(cellNumber("31-12-2025"), null);
  assert.equal(cellNumber("007"), null);
  const used = new Set<string>();
  assert.equal(sheetName("Scope 1: brandstof/diesel", used), "Scope 1  brandstof diesel".replace(/\s+/g, " "));
  assert.equal(sheetName("Scope 1: brandstof/diesel", used), "Scope 1 brandstof diesel 2");
  assert.equal(sheetName("x".repeat(40), used).length, 31);
});

test("buildXlsx: leesbare werkmap met logo, titel, kopregel en getallen", async () => {
  // Kleinste geldige PNG-kop is genoeg voor de verpakking (inhoud wordt niet gecontroleerd).
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const bytes = await buildXlsx(
    [
      {
        name: "Emissie-inventaris",
        title: "CO2-prestatieladder – Emissie-inventaris",
        subtitle: "Rouwmaat Groep · uitgedraaid op 28-11-2026",
        tables: [
          {
            rows: [
              ["Emissiestroom", "Aantal", "Eenheid"],
              ["Diesel", "1.556.387,6", "liter"],
              ["Aardgas & <test>", "47.625,7", "m3"],
            ],
            headerRows: 1,
          },
        ],
      },
      { name: "Leeg", title: "Zonder tabel", tables: [], notes: ["Alleen tekst"] },
    ],
    { png, width: 1560, height: 348 },
  );
  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.file("xl/media/logo.png"));
  assert.ok(zip.file("xl/drawings/drawing1.xml"));
  const book = (await readXlsxFile(Buffer.from(bytes))) as unknown as { sheet: string; data: unknown[][] }[];
  assert.deepEqual(
    book.map((s) => s.sheet),
    ["Emissie-inventaris", "Leeg"],
  );
  const flat = book[0].data.map((r) => r.filter((v) => v !== null));
  assert.deepEqual(
    flat.filter((r) => r.length),
    [
      ["CO2-prestatieladder – Emissie-inventaris"],
      ["Rouwmaat Groep · uitgedraaid op 28-11-2026"],
      ["Emissiestroom", "Aantal", "Eenheid"],
      ["Diesel", 1556387.6, "liter"],
      ["Aardgas & <test>", 47625.7, "m3"],
    ],
  );
  assert.ok(book[1].data.some((r) => r.includes("Alleen tekst")));
});
