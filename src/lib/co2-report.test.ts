import { test } from "node:test";
import assert from "node:assert/strict";
import { emissionSummary, fuelSummary, pipeTable } from "@/lib/co2-report";

const line = (name: string, quantity: number, unit = "liter", group = "Brandstofverbruik wagenpark") => ({ name, unit, scope: 1, group, quantity, kg: 0 });

test("fuelSummary: totaal, verschillen en grootste stroom zoals in het jaarverslag", () => {
  const years = [
    { year: 2021, lines: [line("Diesel wagenpark", 1_890_000), line("Diesel bedrijfsmiddelen", 32_000)] },
    {
      year: 2024,
      lines: [
        line("Diesel wagenpark", 1_670_000),
        line("Diesel bedrijfsmiddelen", 39_804),
        line("HVO100", 43_897),
        line("Aardgas", 47_000, "m3", "Aardgasverbruik"),
      ],
    },
    { year: 2025, lines: [line("Diesel wagenpark", 1_556_388), line("Diesel bedrijfsmiddelen", 56_474), line("HVO100", 7_915)] },
  ];
  const r = fuelSummary(years, 2025);
  assert.equal(r.carriers[0], "Diesel wagenpark");
  assert.equal(r.perYear.find((p) => p.year === 2024)!.byCarrier.has("Aardgas"), false, "aardgas is geen brandstof in liters");
  assert.match(
    r.sentences[0],
    /^Het totale brandstofgebruik bedraagt in 2025 1\.620\.777 liter\. Ten opzichte van 2024 is het verbruik met circa 7,6% gedaald/,
  );
  assert.match(r.sentences[0], /Ten opzichte van 2021 is sprake van een daling van circa 15,7%/);
  assert.match(r.sentences[1], /diesel wagenpark: 1\.556\.388 liter, goed voor circa 96,0%/);
  assert.ok(r.sentences.some((s) => s.startsWith("Diesel bedrijfsmiddelen: 56.474 liter in 2025 (+41,9%")));
  assert.ok(r.sentences.some((s) => s.startsWith("HVO100: 7.915 liter in 2025 (−82,0%")));
});

test("emissionSummary en pipeTable", () => {
  const s = emissionSummary(
    [
      { year: 2020, kg: 6_759_310, scope1: 0, scope2: 0, bt: 0 },
      { year: 2025, kg: 5_723_950, scope1: 5_426_370, scope2: 293_020, bt: 4_560 },
    ],
    2025,
  );
  assert.match(s[0], /5\.723,95 ton CO2\. Hiervan was 5\.426,37 ton CO2 \(94,8%\)/);
  assert.match(s[1], /afgenomen van 6\.759,31 naar 5\.723,95 ton CO2 \(−15,3%\)/);
  assert.deepEqual(pipeTable("a | b\n\n c|d |e "), [
    ["a", "b"],
    ["c", "d", "e"],
  ]);
});
