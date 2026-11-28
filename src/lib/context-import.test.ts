import { test } from "node:test";
import assert from "node:assert/strict";
import { matchFactorSection, matchObligationStakeholders, parseContextHtml, parseObligationCharacter, sanitizeContextHtml } from "./context-import";

// Kunstmatig voorbeeld met dezelfde opbouw als de analyse (geen bedrijfstekst).
const HTML = [
  "<p><img src='/context/afbeelding/00000000-0000-0000-0000-000000000001' /></p><p>Versie:\t2030.01</p><p>Status:\tConcept</p>",
  "<h1>Samenvatting</h1><p>Kort overzicht.</p>",
  "<h2>Overzicht contextfactoren</h2><table><thead><tr><th><p>Contextfactor</p></th><th><p>Belang</p></th><th><p>Karakter</p></th><th><p>Wat we ermee willen</p></th></tr></thead>",
  "<tbody><tr><td><p>Regels en toezicht</p></td><td><p><strong>Hoog</strong></p></td><td><p>Risico</p></td><td><p>In control</p></td></tr>",
  "<tr><td><p>Eén werkwijze</p></td><td><p>Hoog</p></td><td><p>Ontwikkelpunt</p></td><td><p>Samen</p></td></tr></tbody></table>",
  "<table><tr><td><p>DEEL</p><p><strong>3</strong></p></td><td><p><strong>Externe context</strong></p><p>Wat verandert</p></td><td><p><strong>Kern:</strong></p><p>Regels · markt</p></td></tr></table>",
  "<p>Inleiding bij deel 3.</p>",
  "<h2>3.1 Regels en toezicht</h2><p>Tekst over regels.</p><h3>Wat dit betekent</h3><ul><li>punt</li></ul>",
  "<table><tr><td><p>DEEL</p><p><strong>4</strong></p></td><td><p><strong>Interne context</strong></p></td><td><p>Kern:</p><p>Samen</p></td></tr></table>",
  "<h2>4.1 Eén gezamenlijke werkwijze</h2><p>Intern.</p>",
  "<h2>5.1 Belanghebbenden</h2><table><thead><tr><th>Stakeholder</th><th>Wat zij van ons verwachten</th><th>Invloed</th><th>Hoe we hierop inspelen</th></tr></thead>",
  "<tbody><tr><td>Klanten en opdrachtgevers</td><td>Kwaliteit</td><td>Hoog</td><td>Klantmeting</td></tr><tr><td>Omgevingsdienst</td><td>Naleving</td><td>Midden/hoog</td><td>Evaluatie</td></tr></tbody></table>",
  "<h2>5.2 Verplichtingen</h2><table><thead><tr><th>Belanghebbende</th><th>Verplichting</th><th>Karakter</th></tr></thead>",
  "<tbody><tr><td>Bevoegd gezag en Omgevingsdienst</td><td>Algemene regels</td><td>Wettelijk</td></tr><tr><td>Opdrachtgevers</td><td>Contracteisen</td><td>Contractueel</td></tr></tbody></table>",
  "<h2>9.1 Documentgegevens</h2><table><thead><tr><th>Document</th><th>Versie</th><th>Eigenaar</th><th>Herzieningscyclus</th><th>Vastgesteld door</th></tr></thead>",
  "<tbody><tr><td>Analyse Voorbeeld</td><td>2030–2031</td><td>QHSE</td><td>Jaarlijks</td><td>Directie</td></tr></tbody></table>",
].join("");

test("opdelen in delen en paragrafen", () => {
  const r = parseContextHtml(HTML);
  assert.deepEqual(
    r.sections.map((s) => [s.part, s.number, s.title]),
    [
      [0, null, "Voorblad"],
      [0, null, "Samenvatting"],
      [0, null, "Overzicht contextfactoren"],
      [3, null, "Externe context"],
      [3, "3.1", "Regels en toezicht"],
      [4, "4.1", "Eén gezamenlijke werkwijze"],
      [4, "5.1", "Belanghebbenden"],
      [4, "5.2", "Verplichtingen"],
      [4, "9.1", "Documentgegevens"],
    ],
  );
  const s31 = r.sections.find((s) => s.number === "3.1")!;
  assert.equal(s31.anchor, "p-3-1");
  assert.equal(s31.partTitle, "Externe context");
  assert.equal(s31.partKern, "Regels · markt");
  assert.match(s31.html, /<h3>Wat dit betekent<\/h3>/);
  assert.doesNotMatch(s31.html, /<h2>/); // kop zelf niet in de tekst
  assert.ok(!r.sections.some((s) => /DEEL/.test(s.html))); // deelblokken worden kopjes, geen tekst
});

test("tabellen: contextfactoren, stakeholders, verplichtingen, documentgegevens", () => {
  const r = parseContextHtml(HTML);
  assert.deepEqual(r.factors[0], {
    name: "Regels en toezicht",
    importance: "Hoog",
    character: "Risico",
    ambition: "In control",
    kind: "EXTERNAL",
    sectionNumber: "3.1",
  });
  assert.equal(r.factors[1].kind, "INTERNAL");
  assert.equal(r.factors[1].sectionNumber, "4.1");
  assert.deepEqual(r.stakeholders[1], { name: "Omgevingsdienst", expectations: "Naleving", influenceLevel: "Midden/hoog", howAddressed: "Evaluatie" });
  assert.deepEqual(
    r.obligations.map((o) => o.character),
    ["LEGAL", "CONTRACTUAL"],
  );
  assert.deepEqual(r.meta, {
    title: "Analyse Voorbeeld",
    versionLabel: "2030.01",
    ownerText: "QHSE",
    reviewCycle: "Jaarlijks",
    approvedByText: "Directie",
    coverStatus: "Concept",
  });
});

test("opschonen: geen scripts, gevaarlijke links of vreemde afbeeldingen", () => {
  const dirty =
    '<p onclick="x()">Hoi<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><a href="https://example.org">y</a>' +
    '<img src="https://evil.example/a.png"><img src="/context/afbeelding/00000000-0000-0000-0000-000000000001" alt="fig"><iframe src="x"></iframe>';
  const out = sanitizeContextHtml(dirty);
  assert.doesNotMatch(out, /script|onclick|javascript|evil|iframe/);
  assert.match(out, /<a href="https:\/\/example.org" target="_blank" rel="noopener noreferrer">y<\/a>/);
  assert.match(out, /<img src="\/context\/afbeelding\/00000000-0000-0000-0000-000000000001" alt="fig" \/>/);
});

test("karakter en koppelen van belanghebbenden", () => {
  assert.equal(parseObligationCharacter("Contractueel"), "CONTRACTUAL");
  assert.equal(parseObligationCharacter("Vrijwillig"), "VOLUNTARY");
  assert.equal(parseObligationCharacter("Wettelijk"), "LEGAL");
  const sh = [
    { id: "1", name: "Bevoegd gezag/overheid" },
    { id: "2", name: "Omgevingsdienst" },
    { id: "3", name: "Klanten en opdrachtgevers" },
    { id: "4", name: "Certificerende instellingen (o.a. X)" },
  ];
  assert.deepEqual(matchObligationStakeholders("Bevoegd gezag en Omgevingsdienst", sh).sort(), ["1", "2"]);
  assert.deepEqual(matchObligationStakeholders("Opdrachtgevers", sh), ["3"]);
  assert.deepEqual(matchObligationStakeholders("Certificerende instellingen", sh), ["4"]);
  assert.deepEqual(matchObligationStakeholders("Rouwmaat zelf", sh), []);
  assert.equal(matchFactorSection("Iets anders", [{ part: 3, number: "3.1", title: "Regels" }]), null);
});
