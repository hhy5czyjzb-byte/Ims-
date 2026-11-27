/**
 * Basisvulling van de database. Idempotent: kan veilig vaker gedraaid worden.
 *
 *   npm run db:seed                 → normen, disciplines, locatie, functies (+ testgebruikers lokaal)
 *   SEED_DEMO=true npm run db:seed  → idem, plus een voorbeeldproces en voorbeeldacties
 *
 * Normeisen: alleen de hoofdstukstructuur (High Level Structure) van ISO 9001 en
 * ISO 14001 is ingevuld. De overige normen staan klaar zonder eisen; QHSE vult die
 * in via Normenbeheer (de normteksten zelf zijn auteursrechtelijk beschermd).
 */
import { PrismaClient, type NormCategory } from "@prisma/client";

const prisma = new PrismaClient();

type Req = [clause: string, title: string, children?: Req[]];

const HLS_COMMON = {
  context: (scope: string, system: string): Req => [
    "4",
    "Context van de organisatie",
    [
      ["4.1", "Inzicht in de organisatie en haar context"],
      ["4.2", "Inzicht in de behoeften en verwachtingen van belanghebbenden"],
      ["4.3", `Vaststellen van het toepassingsgebied van het ${scope}`],
      ["4.4", system],
    ],
  ],
};

const ISO_9001: Req[] = [
  HLS_COMMON.context("kwaliteitsmanagementsysteem", "Kwaliteitsmanagementsysteem en de processen ervan"),
  [
    "5",
    "Leiderschap",
    [
      ["5.1", "Leiderschap en betrokkenheid"],
      ["5.2", "Beleid"],
      ["5.3", "Rollen, verantwoordelijkheden en bevoegdheden binnen de organisatie"],
    ],
  ],
  [
    "6",
    "Planning",
    [
      ["6.1", "Maatregelen om risico's en kansen te behandelen"],
      ["6.2", "Kwaliteitsdoelstellingen en planning om deze te bereiken"],
      ["6.3", "Planning van wijzigingen"],
    ],
  ],
  [
    "7",
    "Ondersteuning",
    [
      [
        "7.1",
        "Middelen",
        [
          ["7.1.1", "Algemeen"],
          ["7.1.2", "Personen"],
          ["7.1.3", "Infrastructuur"],
          ["7.1.4", "Omgeving voor het uitvoeren van processen"],
          ["7.1.5", "Middelen voor monitoren en meten"],
          ["7.1.6", "Kennis van de organisatie"],
        ],
      ],
      ["7.2", "Competentie"],
      ["7.3", "Bewustzijn"],
      ["7.4", "Communicatie"],
      ["7.5", "Gedocumenteerde informatie"],
    ],
  ],
  [
    "8",
    "Uitvoering",
    [
      ["8.1", "Operationele planning en beheersing"],
      ["8.2", "Eisen voor producten en diensten"],
      ["8.3", "Ontwerp en ontwikkeling van producten en diensten"],
      ["8.4", "Beheersing van extern geleverde processen, producten en diensten"],
      ["8.5", "Productie en dienstverlening"],
      ["8.6", "Vrijgave van producten en diensten"],
      ["8.7", "Beheersing van niet-conforme outputs"],
    ],
  ],
  [
    "9",
    "Evaluatie van de prestaties",
    [
      ["9.1", "Monitoren, meten, analyseren en evalueren"],
      ["9.2", "Interne audit"],
      ["9.3", "Directiebeoordeling"],
    ],
  ],
  [
    "10",
    "Verbetering",
    [
      ["10.1", "Algemeen"],
      ["10.2", "Afwijkingen en corrigerende maatregelen"],
      ["10.3", "Continue verbetering"],
    ],
  ],
];

const ISO_14001: Req[] = [
  HLS_COMMON.context("milieumanagementsysteem", "Milieumanagementsysteem"),
  [
    "5",
    "Leiderschap",
    [
      ["5.1", "Leiderschap en betrokkenheid"],
      ["5.2", "Milieubeleid"],
      ["5.3", "Rollen, verantwoordelijkheden en bevoegdheden binnen de organisatie"],
    ],
  ],
  [
    "6",
    "Planning",
    [
      [
        "6.1",
        "Maatregelen om risico's en kansen te behandelen",
        [
          ["6.1.1", "Algemeen"],
          ["6.1.2", "Milieuaspecten"],
          ["6.1.3", "Bindende verplichtingen"],
          ["6.1.4", "Planning van maatregelen"],
        ],
      ],
      ["6.2", "Milieudoelstellingen en planning om deze te bereiken"],
    ],
  ],
  [
    "7",
    "Ondersteuning",
    [
      ["7.1", "Middelen"],
      ["7.2", "Competentie"],
      ["7.3", "Bewustzijn"],
      ["7.4", "Communicatie"],
      ["7.5", "Gedocumenteerde informatie"],
    ],
  ],
  [
    "8",
    "Uitvoering",
    [
      ["8.1", "Operationele planning en beheersing"],
      ["8.2", "Voorbereid zijn op en reageren op noodsituaties"],
    ],
  ],
  [
    "9",
    "Evaluatie van de prestaties",
    [
      [
        "9.1",
        "Monitoring, meting, analyse en evaluatie",
        [
          ["9.1.1", "Algemeen"],
          ["9.1.2", "Evaluatie van de naleving"],
        ],
      ],
      ["9.2", "Interne audit"],
      ["9.3", "Directiebeoordeling"],
    ],
  ],
  [
    "10",
    "Verbetering",
    [
      ["10.1", "Algemeen"],
      ["10.2", "Afwijkingen en corrigerende maatregelen"],
      ["10.3", "Continue verbetering"],
    ],
  ],
];

const NORMS: { code: string; name: string; version?: string; category: NormCategory; description?: string; requirements?: Req[] }[] = [
  { code: "ISO 9001", name: "Kwaliteitsmanagementsystemen — Eisen", version: "2015", category: "QUALITY", requirements: ISO_9001 },
  {
    code: "ISO 14001",
    name: "Milieumanagementsystemen — Eisen met richtlijnen voor gebruik",
    version: "2015",
    category: "ENVIRONMENT",
    requirements: ISO_14001,
  },
  {
    code: "CO2-prestatieladder",
    name: "CO2-Prestatieladder (SKAO)",
    category: "CO2",
    description: "Eisen per niveau en invalshoek nog in te voeren door QHSE.",
  },
  { code: "SCL", name: "Safety Culture Ladder", category: "SAFETY", description: "Eisen nog in te voeren door QHSE." },
  {
    code: "VCA**",
    name: "VCA** — Veiligheid, gezondheid en milieu Checklist Aannemers",
    category: "SAFETY",
    description: "Gedeeltelijk van toepassing; welke onderdelen is een open punt.",
  },
  { code: "BRL 2000", name: "BRL 2000", category: "PRODUCT", description: "Eisen nog in te voeren door QHSE." },
  { code: "BRL 7000", name: "BRL 7000", category: "PRODUCT", description: "Eisen nog in te voeren door QHSE." },
  { code: "SVMS-007", name: "SVMS-007", category: "PRODUCT", description: "Eisen nog in te voeren door QHSE." },
  { code: "SC-530", name: "Asbestcertificering SC-530 (asbestinventarisatie)", category: "SAFETY", description: "Eisen nog in te voeren door QHSE." },
  { code: "SC-540", name: "Asbestcertificering SC-540 (asbestverwijdering)", category: "SAFETY", description: "Eisen nog in te voeren door QHSE." },
  // BRL's voor grondbank en granulaat: nummers nog te bevestigen (open punt) — toevoegen via Normenbeheer.
];

const DISCIPLINES = ["Infra", "Beton", "Prefab", "Afval/Transport", "Asbestinventarisatie"]; // BU's volgens het eigen register ("Groep" = bedrijfsbreed)
const LOCATIONS = [{ name: "Groenlo", address: "Hoofdvestiging" }];
const FUNCTIONS = [
  "Directeur",
  "QHSE-coördinator",
  "Bedrijfsleider",
  "Projectleider",
  "Werkvoorbereider",
  "Uitvoerder",
  "Productieleider",
  "Ploegleider",
  "Inkoper",
  "Planner",
  "Medewerker productie",
];

async function upsertRequirements(normId: string, reqs: Req[], parentId: string | null = null) {
  let order = 0;
  for (const [clause, title, children] of reqs) {
    order += 10;
    const r = await prisma.normRequirement.upsert({
      where: { normId_clause: { normId, clause } },
      update: {},
      create: { normId, clause, title, parentId, sortOrder: order },
    });
    if (children) await upsertRequirements(normId, children, r.id);
  }
}

async function main() {
  console.log("Seed: normen…");
  let order = 0;
  for (const n of NORMS) {
    order += 10;
    const norm = await prisma.norm.upsert({
      where: { code: n.code },
      update: {},
      create: { code: n.code, name: n.name, version: n.version, category: n.category, description: n.description, sortOrder: order },
    });
    if (n.requirements) await upsertRequirements(norm.id, n.requirements);
  }

  console.log("Seed: disciplines, locaties, functies…");
  for (const [i, name] of DISCIPLINES.entries()) {
    await prisma.discipline.upsert({ where: { name }, update: {}, create: { name, sortOrder: (i + 1) * 10 } });
  }
  for (const l of LOCATIONS) {
    await prisma.location.upsert({ where: { name: l.name }, update: {}, create: l });
  }
  for (const name of FUNCTIONS) {
    await prisma.jobFunction.upsert({ where: { name }, update: {}, create: { name } });
  }

  // Energiedragers voor de CO2-prestatieladder — zónder emissiefactoren: QHSE voert de actuele
  // factoren in vanuit CO2emissiefactoren.nl (in de demodata staan voorbeeldwaarden).
  console.log("Seed: energiedragers…");
  const CARRIERS: { name: string; unit: string; category: "FUEL" | "GAS" | "ELECTRICITY" | "TRAVEL"; defaultScope: number; aliases?: string }[] = [
    { name: "Diesel (B7)", unit: "liter", category: "FUEL", defaultScope: 1, aliases: "diesel, gasolie, B7" },
    { name: "HVO100", unit: "liter", category: "FUEL", defaultScope: 1, aliases: "HVO, HVO 100" },
    { name: "Benzine (E10)", unit: "liter", category: "FUEL", defaultScope: 1, aliases: "benzine, euro95, E10" },
    { name: "Aardgas", unit: "m3", category: "GAS", defaultScope: 1, aliases: "gas" },
    { name: "Propaan", unit: "liter", category: "GAS", defaultScope: 1, aliases: "LPG" },
    { name: "Elektriciteit (grijs)", unit: "kWh", category: "ELECTRICITY", defaultScope: 2, aliases: "elektriciteit, stroom, grijze stroom" },
    { name: "Elektriciteit (groen, NL wind)", unit: "kWh", category: "ELECTRICITY", defaultScope: 2, aliases: "groene stroom, windstroom" },
    { name: "Zakelijke km privéauto", unit: "km", category: "TRAVEL", defaultScope: 3, aliases: "declaratiekilometers, privé auto km" },
  ];
  for (const [i, c] of CARRIERS.entries()) {
    await prisma.energyCarrier.upsert({ where: { name: c.name }, update: {}, create: { ...c, sortOrder: (i + 1) * 10 } });
  }

  // Lokale modus (geen Microsoft 365): de lokale gebruiker (QHSE) en testgebruikers voor "Bekijken als".
  const localMode = process.env.AUTH_MODE === "local" || (process.env.AUTH_MODE !== "entra" && !process.env.AZURE_AD_CLIENT_ID);
  if (localMode) {
    console.log("Seed: lokale gebruiker en testgebruikers (lokale modus)…");
    await prisma.user.upsert({
      where: { email: "lokaal@ims.local" },
      update: {},
      create: { email: "lokaal@ims.local", name: process.env.LOCAL_USER_NAME || "Eelco", role: "QHSE" },
    });
    const testUsers = [
      { email: "test.qhse@ims.local", name: "Test QHSE", role: "QHSE" as const },
      { email: "test.directie@ims.local", name: "Test Directie", role: "DIRECTIE" as const },
      { email: "test.middenkader@ims.local", name: "Test Middenkader", role: "MIDDENKADER" as const },
    ];
    for (const u of testUsers) await prisma.user.upsert({ where: { email: u.email }, update: {}, create: u });
  }

  if (process.env.SEED_DEMO === "true") {
    await seedDemo();
    await seedDemoRisks();
    await seedDemoAudits();
    await seedDemoLegal();
    await seedDemoAspects();
    await seedDemoCo2();
  }
  console.log("Seed klaar.");
}

/** Voorbeelddata om de app te verkennen. Niet gebruiken in productie. */
async function seedDemo() {
  console.log("Seed: voorbeelddata…");
  if (await prisma.process.findFirst({ where: { code: "DEMO-BET-01" } })) return;

  const beton = await prisma.discipline.findUniqueOrThrow({ where: { name: "Beton" } });
  const groenlo = await prisma.location.findUniqueOrThrow({ where: { name: "Groenlo" } });
  const qhse = await prisma.user.findFirst({ where: { role: "QHSE" } });
  const mk = await prisma.user.findFirst({ where: { role: "MIDDENKADER" } });
  const fn = async (name: string) => (await prisma.jobFunction.findUniqueOrThrow({ where: { name } })).id;
  const req = async (code: string, clause: string) => {
    const norm = await prisma.norm.findUniqueOrThrow({ where: { code } });
    return (await prisma.normRequirement.findUniqueOrThrow({ where: { normId_clause: { normId: norm.id, clause } } })).id;
  };

  const doc = await prisma.document.create({
    data: {
      title: "Werkinstructie mengen en leveren betonmortel (voorbeeld)",
      documentNumber: "DEMO-WI-001",
      webUrl: "https://example.sharepoint.com/sites/IMS/IMS-documenten/DEMO-WI-001.docx",
      status: "Vrijgegeven",
      version: "1.0",
      ownerName: "QHSE",
      revisionDate: new Date(Date.now() + 20 * 86_400_000),
      requirements: { connect: [{ id: await req("ISO 9001", "8.5") }] },
    },
  });

  const process = await prisma.process.create({
    data: {
      code: "DEMO-BET-01",
      name: "Productie en levering betonmortel (voorbeeld)",
      purpose: "Betonmortel volgens specificatie van de klant produceren en tijdig leveren.",
      input: "Order met specificatie",
      output: "Geleverde betonmortel met afleverbon",
      disciplineId: beton.id,
      ownerId: qhse?.id,
      documents: { connect: [{ id: doc.id }] },
      requirements: { connect: [{ id: await req("ISO 9001", "8.5") }, { id: await req("ISO 14001", "8.1") }] },
    },
  });

  const steps: { name: string; raci: ["R" | "A" | "C" | "I", string][] }[] = [
    {
      name: "Order ontvangen en controleren",
      raci: [
        ["R", "Planner"],
        ["A", "Bedrijfsleider"],
        ["I", "Productieleider"],
      ],
    },
    {
      name: "Productie plannen",
      raci: [
        ["R", "Planner"],
        ["A", "Productieleider"],
        ["C", "Uitvoerder"],
      ],
    },
    {
      name: "Mengen volgens recept",
      raci: [
        ["R", "Medewerker productie"],
        ["A", "Productieleider"],
        ["C", "QHSE-coördinator"],
      ],
    },
    {
      name: "Kwaliteitscontrole en vrijgave",
      raci: [
        ["R", "Productieleider"],
        ["A", "Bedrijfsleider"],
        ["I", "QHSE-coördinator"],
      ],
    },
    {
      name: "Leveren en afleverbon",
      raci: [
        ["R", "Uitvoerder"],
        ["A", "Bedrijfsleider"],
        ["I", "Planner"],
      ],
    },
  ];
  for (const [i, s] of steps.entries()) {
    const step = await prisma.processStep.create({ data: { processId: process.id, name: s.name, sortOrder: (i + 1) * 10 } });
    for (const [type, f] of s.raci) await prisma.raciAssignment.create({ data: { stepId: step.id, type, jobFunctionId: await fn(f) } });
    if (i === 2) await prisma.processStep.update({ where: { id: step.id }, data: { documents: { connect: [{ id: doc.id }] } } });
    if (i === 3) await prisma.processStep.update({ where: { id: step.id }, data: { requirements: { connect: [{ id: await req("ISO 9001", "8.6") }] } } });
  }

  await prisma.action.createMany({
    data: [
      {
        title: "Kalibratie weegsysteem menginstallatie inplannen (voorbeeld)",
        source: "AUDIT",
        priority: "HIGH",
        ownerId: mk?.id,
        createdById: qhse?.id,
        deadline: new Date(Date.now() - 5 * 86_400_000),
        disciplineId: beton.id,
        locationId: groenlo.id,
      },
      {
        title: "Werkinstructie mengen actualiseren (voorbeeld)",
        source: "MANUAL",
        priority: "MEDIUM",
        ownerId: qhse?.id,
        createdById: qhse?.id,
        deadline: new Date(Date.now() + 14 * 86_400_000),
        disciplineId: beton.id,
      },
      {
        title: "Toolbox stofbeheersing breker plannen (voorbeeld)",
        source: "RISK",
        priority: "MEDIUM",
        ownerId: mk?.id,
        createdById: qhse?.id,
        deadline: new Date(Date.now() + 30 * 86_400_000),
        status: "IN_PROGRESS",
        locationId: groenlo.id,
      },
    ],
  });
}

/** Voorbeeldrisico's en -kansen (idempotent op titel). */
async function seedDemoRisks() {
  const qhse = await prisma.user.findFirst({ where: { role: "QHSE" } });
  const mk = await prisma.user.findFirst({ where: { role: "MIDDENKADER" } });
  const disc = async (name: string) => (await prisma.discipline.findUniqueOrThrow({ where: { name } })).id;
  const groenlo = await prisma.location.findUniqueOrThrow({ where: { name: "Groenlo" } });
  const process = await prisma.process.findFirst({ where: { code: "DEMO-BET-01" } });
  const req = async (code: string, clause: string) => {
    const norm = await prisma.norm.findUniqueOrThrow({ where: { code } });
    return { id: (await prisma.normRequirement.findUniqueOrThrow({ where: { normId_clause: { normId: norm.id, clause } } })).id };
  };
  const in30 = new Date(Date.now() + 30 * 86_400_000);

  const risks = [
    {
      type: "RISK" as const,
      category: "SAFETY" as const,
      title: "Blootstelling aan kwartsstof bij breken van puin (voorbeeld)",
      cause: "Droog breken en zeven, wind",
      consequence: "Gezondheidsschade medewerkers (silicose), klachten omgeving",
      measures: "Watervernevelaars op breker, cabines met overdruk en filter, FFP3 bij onderhoud",
      likelihoodBefore: 4,
      impactBefore: 5,
      likelihoodAfter: 2,
      impactAfter: 4,
      status: "CONTROLLED" as const,
      ownerId: mk?.id,
      disciplines: { connect: [{ id: await disc("Afval/Transport") }] },
      locationId: groenlo.id,
      reviewDate: in30,
      requirements: [await req("ISO 14001", "6.1.2")],
      processes: [],
    },
    {
      type: "RISK" as const,
      category: "QUALITY" as const,
      title: "Betonsterkte voldoet niet aan specificatie (voorbeeld)",
      cause: "Afwijkend vochtgehalte toeslagmateriaal, fout in recept",
      consequence: "Afkeur, herstelkosten, claim klant",
      measures: "Vochtmeting per partij, receptcontrole, kubusproeven",
      likelihoodBefore: 3,
      impactBefore: 4,
      likelihoodAfter: null,
      impactAfter: null,
      status: "OPEN" as const,
      ownerId: qhse?.id,
      disciplines: { connect: [{ id: await disc("Beton") }] },
      locationId: groenlo.id,
      reviewDate: new Date(Date.now() - 3 * 86_400_000),
      requirements: [await req("ISO 9001", "8.6")],
      processes: process ? [{ id: process.id }] : [],
    },
    {
      type: "RISK" as const,
      category: "STRATEGIC" as const,
      title: "Langdurige uitval menginstallatie (voorbeeld)",
      cause: "Storing besturing, ontbreken reserveonderdelen",
      consequence: "Leveringen niet mogelijk, omzetverlies",
      measures: "Preventief onderhoud, kritische onderdelen op voorraad",
      likelihoodBefore: 2,
      impactBefore: 5,
      likelihoodAfter: 2,
      impactAfter: 3,
      status: "CONTROLLED" as const,
      ownerId: qhse?.id,
      disciplines: { connect: [{ id: await disc("Beton") }] },
      locationId: null,
      reviewDate: in30,
      requirements: [await req("ISO 9001", "6.1")],
      processes: process ? [{ id: process.id }] : [],
    },
    {
      type: "OPPORTUNITY" as const,
      category: "CO2" as const,
      title: "Meer betongranulaat uit eigen recycling in nieuw beton (voorbeeld)",
      cause: "Eigen breekinstallatie, vraag naar circulair beton",
      consequence: "Lagere CO2-uitstoot en grondstofkosten, onderscheidend in aanbestedingen",
      measures: "Proefmengsels, afstemming met klanten en certificatie-instelling",
      likelihoodBefore: 4,
      impactBefore: 4,
      likelihoodAfter: null,
      impactAfter: null,
      status: "OPEN" as const,
      ownerId: qhse?.id,
      disciplines: { connect: [{ id: await disc("Beton") }] },
      locationId: null,
      reviewDate: in30,
      requirements: [await req("ISO 14001", "6.1.1")],
      processes: [],
    },
    {
      type: "OPPORTUNITY" as const,
      category: "CO2" as const,
      title: "Elektrische shovel op het recyclingterrein (voorbeeld)",
      cause: "Vervanging bestaande shovel gepland",
      consequence: "Minder diesel en geluid",
      measures: null,
      likelihoodBefore: 3,
      impactBefore: 3,
      likelihoodAfter: null,
      impactAfter: null,
      status: "OPEN" as const,
      ownerId: mk?.id,
      disciplines: { connect: [{ id: await disc("Afval/Transport") }] },
      locationId: groenlo.id,
      reviewDate: null,
      requirements: [],
      processes: [],
    },
  ];

  for (const { requirements, processes, ...r } of risks) {
    if (await prisma.risk.findFirst({ where: { title: r.title } })) continue;
    const risk = await prisma.risk.create({
      data: { ...r, createdById: qhse?.id, requirements: { connect: requirements }, processes: { connect: processes } },
    });
    if (r.category === "QUALITY") {
      await prisma.action.create({
        data: {
          title: "Vochtmeting toeslagmateriaal per partij invoeren (voorbeeld)",
          source: "RISK",
          riskId: risk.id,
          ownerId: mk?.id,
          createdById: qhse?.id,
          disciplineId: r.disciplines.connect[0].id,
          deadline: in30,
        },
      });
    }
  }
}

/** Voorbeeldaudits met checklist en bevindingen (idempotent op titel). */
async function seedDemoAudits() {
  const marker = "Interne audit ISO 9001 productie beton (voorbeeld)";
  if (await prisma.audit.findFirst({ where: { title: marker } })) return;
  const qhse = await prisma.user.findFirst({ where: { role: "QHSE" } });
  const mk = await prisma.user.findFirst({ where: { role: "MIDDENKADER" } });
  const iso9001 = await prisma.norm.findUniqueOrThrow({ where: { code: "ISO 9001" } });
  const iso14001 = await prisma.norm.findUniqueOrThrow({ where: { code: "ISO 14001" } });
  const beton = await prisma.discipline.findUniqueOrThrow({ where: { name: "Beton" } });
  const groenlo = await prisma.location.findUniqueOrThrow({ where: { name: "Groenlo" } });
  const req = async (normId: string, clause: string) => (await prisma.normRequirement.findUniqueOrThrow({ where: { normId_clause: { normId, clause } } })).id;
  const day = 86_400_000;

  // Afgeronde interne audit met checklist en bevindingen
  const checklist: [string, "CONFORM" | "FINDING" | "NOT_APPLICABLE", string | null][] = [
    ["7.1.5", "FINDING", "Kalibratie weegsysteem verlopen"],
    ["7.5", "CONFORM", "Werkinstructies actueel in SharePoint"],
    ["8.3", "NOT_APPLICABLE", "Geen eigen ontwerp in deze scope"],
    ["8.5", "CONFORM", "Productie volgens recept, afleverbonnen compleet"],
    ["8.6", "FINDING", "Vrijgave niet altijd vastgelegd"],
    ["9.2", "CONFORM", null],
  ];
  const internal = await prisma.audit.create({
    data: {
      type: "INTERNAL",
      title: marker,
      plannedDate: new Date(Date.now() - 30 * day),
      completedDate: new Date(Date.now() - 28 * day),
      auditor: "Test QHSE",
      scope: "Productie en levering betonmortel, Groenlo",
      conclusion: "Systeem werkt in de praktijk; aandacht voor meetmiddelen en vastleggen van vrijgave.",
      status: "COMPLETED",
      locationId: groenlo.id,
      disciplineId: beton.id,
      norms: { connect: [{ id: iso9001.id }] },
      checklist: {
        create: await Promise.all(checklist.map(async ([clause, result, notes]) => ({ requirementId: await req(iso9001.id, clause), result, notes }))),
      },
    },
  });
  const minor = await prisma.auditFinding.create({
    data: {
      auditId: internal.id,
      number: 1,
      classification: "MINOR",
      requirementId: await req(iso9001.id, "7.1.5"),
      description: "Het weegsysteem van de menginstallatie is niet binnen de gestelde termijn gekalibreerd (laatste kalibratie 14 maanden geleden).",
      rootCause: "Kalibratieplanning stond in een persoonlijke agenda; geen overdracht bij vakantie.",
      dueDate: new Date(Date.now() + 30 * day),
    },
  });
  await prisma.action.create({
    data: {
      title: "Kalibratieplanning meetmiddelen centraal vastleggen (voorbeeld)",
      source: "AUDIT",
      findingId: minor.id,
      ownerId: mk?.id,
      createdById: qhse?.id,
      deadline: new Date(Date.now() + 21 * day),
      disciplineId: beton.id,
      locationId: groenlo.id,
      requirements: { connect: [{ id: await req(iso9001.id, "7.1.5") }] },
    },
  });
  await prisma.auditFinding.create({
    data: {
      auditId: internal.id,
      number: 2,
      classification: "OBSERVATION",
      requirementId: await req(iso9001.id, "8.6"),
      description: "Vrijgave van de productie wordt mondeling gegeven; vastleggen op de afleverbon zou de herleidbaarheid verbeteren.",
    },
  });

  // Geplande externe audit en klantaudit
  await prisma.audit.create({
    data: {
      type: "EXTERNAL",
      title: "Controle-audit ISO 9001 en ISO 14001 (voorbeeld)",
      plannedDate: new Date(Date.now() + 45 * day),
      certificationBody: "Certificatie-instelling (voorbeeld)",
      scope: "Alle disciplines, locatie Groenlo",
      status: "PLANNED",
      locationId: groenlo.id,
      norms: { connect: [{ id: iso9001.id }, { id: iso14001.id }] },
      checklist: {
        create: await Promise.all(
          [
            [iso9001.id, "9.3"],
            [iso9001.id, "10.2"],
            [iso14001.id, "6.1.2"],
            [iso14001.id, "9.1.2"],
          ].map(async ([n, c]) => ({ requirementId: await req(n, c) })),
        ),
      },
    },
  });
  await prisma.audit.create({
    data: {
      type: "CUSTOMER",
      title: "Leveranciersaudit door klant (voorbeeld)",
      plannedDate: new Date(Date.now() + 75 * day),
      certificationBody: "Bouwbedrijf (voorbeeld)",
      status: "PLANNED",
      disciplineId: beton.id,
      norms: { connect: [{ id: iso9001.id }] },
    },
  });
}

/** Voorbeeldregister wet- en regelgeving met toetsingen (idempotent op titel). */
async function seedDemoLegal() {
  const marker = "Besluit activiteiten leefomgeving (voorbeeld)";
  if (await prisma.legalRequirement.findFirst({ where: { title: marker } })) return;
  const qhse = await prisma.user.findFirst({ where: { role: "QHSE" } });
  const mk = await prisma.user.findFirst({ where: { role: "MIDDENKADER" } });
  const disc = async (name: string) => (await prisma.discipline.findUniqueOrThrow({ where: { name } })).id;
  const groenlo = await prisma.location.findUniqueOrThrow({ where: { name: "Groenlo" } });
  const iso14001 = await prisma.norm.findUniqueOrThrow({ where: { code: "ISO 14001" } });
  const req = async (clause: string) => ({
    id: (await prisma.normRequirement.findUniqueOrThrow({ where: { normId_clause: { normId: iso14001.id, clause } } })).id,
  });
  const kwarts = await prisma.risk.findFirst({ where: { title: { startsWith: "Blootstelling aan kwartsstof" } } });
  const day = 86_400_000;
  const ago = (d: number) => new Date(new Date(Date.now() - d * day).toISOString().slice(0, 10));
  const ahead = (d: number) => new Date(new Date(Date.now() + d * day).toISOString().slice(0, 10));

  const items = [
    {
      title: marker,
      article: "Opslaan van afvalstoffen (voorbeeld)",
      subject: "Opslag en acceptatie afval",
      description: "Afvalstoffen gescheiden en op een vloeistofdichte vloer opslaan; acceptatie- en verwerkingsbeleid actueel houden.",
      source: "Omgevingsdienst",
      category: "ENVIRONMENT" as const,
      status: "COMPLIANT" as const,
      explanation: "Controle op terrein: opslag conform, AV-beleid geactualiseerd.",
      lastReviewDate: ago(60),
      nextReviewDate: ahead(305),
      ownerId: mk?.id,
      disciplineId: await disc("Afval/Transport"),
      locationId: groenlo.id,
      requirements: [await req("6.1.3")],
      risks: [],
    },
    {
      title: "Arbeidsomstandighedenbesluit (voorbeeld)",
      article: "Grenswaarde respirabel kwartsstof (voorbeeld)",
      subject: "Blootstelling aan stof",
      description: "Blootstelling van medewerkers aan respirabel kwartsstof blijft onder de wettelijke grenswaarde; metingen periodiek herhalen.",
      source: "Nederlandse Arbeidsinspectie",
      category: "HEALTH_SAFETY" as const,
      status: "PARTIAL" as const,
      explanation: "Meting breker: onder grenswaarde, maar meting bij onderhoudswerk ontbreekt.",
      lastReviewDate: ago(40),
      nextReviewDate: ahead(140),
      ownerId: qhse?.id,
      disciplineId: await disc("Afval/Transport"),
      locationId: groenlo.id,
      requirements: [],
      risks: kwarts ? [{ id: kwarts.id }] : [],
    },
    {
      title: "Omgevingsvergunning locatie Groenlo (voorbeeld)",
      article: "Voorschrift geluid (voorbeeld)",
      subject: "Geluid",
      description: "Geluidsniveau op de beoordelingspunten blijft binnen de vergunde waarden, ook in de avondperiode.",
      source: "Gemeente",
      category: "ENVIRONMENT" as const,
      status: "NON_COMPLIANT" as const,
      explanation: "Klacht omwonenden; indicatieve meting in de avond boven de vergunde waarde.",
      lastReviewDate: ago(200),
      nextReviewDate: ago(15),
      ownerId: qhse?.id,
      disciplineId: null,
      locationId: groenlo.id,
      requirements: [await req("6.1.3"), await req("9.1.2")],
      risks: [],
    },
    {
      title: "Energiebesparingsplicht (voorbeeld)",
      article: null,
      subject: "Energie",
      description: "Energiebesparende maatregelen met een terugverdientijd van vijf jaar of minder uitvoeren en rapporteren.",
      source: "Omgevingsdienst",
      category: "ENERGY_CO2" as const,
      status: "NOT_ASSESSED" as const,
      explanation: null,
      lastReviewDate: null,
      nextReviewDate: ahead(20),
      ownerId: qhse?.id,
      disciplineId: null,
      locationId: null,
      requirements: [await req("6.1.3")],
      risks: [],
    },
  ];

  for (const { requirements, risks, ...data } of items) {
    const created = await prisma.legalRequirement.create({
      data: { ...data, createdById: qhse?.id, requirements: { connect: requirements }, risks: { connect: risks } },
    });
    if (data.status !== "NOT_ASSESSED" && data.lastReviewDate) {
      await prisma.complianceAssessment.create({
        data: { legalRequirementId: created.id, date: data.lastReviewDate, status: data.status, explanation: data.explanation, assessedById: qhse?.id },
      });
    }
    if (data.status === "NON_COMPLIANT") {
      await prisma.action.create({
        data: {
          title: "Geluidsmaatregelen avondperiode uitvoeren (voorbeeld)",
          source: "COMPLIANCE",
          priority: "HIGH",
          legalRequirementId: created.id,
          ownerId: mk?.id,
          createdById: qhse?.id,
          deadline: ahead(30),
          locationId: groenlo.id,
        },
      });
    }
  }
}

/** Voorbeeldregister milieuaspecten (idempotent op activiteit + aspect). Significantie volgens de standaarddrempel 27. */
async function seedDemoAspects() {
  if (await prisma.environmentalAspect.findFirst({ where: { activity: { endsWith: "(voorbeeld)" } } })) return;
  const qhse = await prisma.user.findFirst({ where: { role: "QHSE" } });
  const mk = await prisma.user.findFirst({ where: { role: "MIDDENKADER" } });
  const disc = async (name: string) => (await prisma.discipline.findUniqueOrThrow({ where: { name } })).id;
  const groenlo = await prisma.location.findUniqueOrThrow({ where: { name: "Groenlo" } });
  const process = await prisma.process.findFirst({ where: { code: "DEMO-BET-01" } });
  const iso14001 = await prisma.norm.findUniqueOrThrow({ where: { code: "ISO 14001" } });
  const r612 = { id: (await prisma.normRequirement.findUniqueOrThrow({ where: { normId_clause: { normId: iso14001.id, clause: "6.1.2" } } })).id };
  const geluid = await prisma.legalRequirement.findFirst({ where: { title: { startsWith: "Omgevingsvergunning locatie Groenlo" } } });
  const kwarts = await prisma.risk.findFirst({ where: { title: { startsWith: "Blootstelling aan kwartsstof" } } });
  const T = 27;

  const items: {
    activity: string;
    aspect: string;
    aspectType: "AIR" | "NOISE" | "SOIL" | "ENERGY" | "WASTE" | "WATER";
    impact: string;
    situation: "NORMAL" | "ABNORMAL" | "EMERGENCY";
    controls: string | null;
    f: number;
    e: number;
    o: number;
    legal?: boolean;
    stakeholder?: boolean;
    discipline: string;
    links?: { legal?: boolean; risk?: boolean; process?: boolean };
  }[] = [
    {
      activity: "Breken van puin (voorbeeld)",
      aspect: "Stofemissie",
      aspectType: "AIR",
      impact: "Luchtverontreiniging, hinder omwonenden",
      situation: "NORMAL",
      controls: "Watervernevelaars, snelheid op terrein beperkt",
      f: 5,
      e: 3,
      o: 3,
      stakeholder: true,
      discipline: "Afval/Transport",
      links: { risk: true },
    },
    {
      activity: "Breken van puin (voorbeeld)",
      aspect: "Geluid van breker en shovels",
      aspectType: "NOISE",
      impact: "Geluidshinder omwonenden",
      situation: "NORMAL",
      controls: "Werktijden beperkt tot dagperiode",
      f: 5,
      e: 2,
      o: 3,
      discipline: "Afval/Transport",
      links: { legal: true },
    },
    {
      activity: "Mengen betonmortel (voorbeeld)",
      aspect: "Elektriciteitsverbruik menginstallatie",
      aspectType: "ENERGY",
      impact: "Uitputting fossiele brandstoffen, CO2-uitstoot",
      situation: "NORMAL",
      controls: null,
      f: 5,
      e: 2,
      o: 2,
      discipline: "Beton",
      links: { process: true },
    },
    {
      activity: "Reinigen truckmixers (voorbeeld)",
      aspect: "Lozing spoelwater met cementresten",
      aspectType: "WATER",
      impact: "Verontreiniging oppervlaktewater (hoge pH)",
      situation: "NORMAL",
      controls: "Bezinkbassin, hergebruik spoelwater",
      f: 4,
      e: 3,
      o: 2,
      legal: true,
      discipline: "Beton",
      links: { process: true },
    },
    {
      activity: "Tanken materieel (voorbeeld)",
      aspect: "Morsen van diesel",
      aspectType: "SOIL",
      impact: "Bodemverontreiniging",
      situation: "ABNORMAL",
      controls: "Vloeistofdichte tankplaats, absorptiemiddel aanwezig",
      f: 2,
      e: 3,
      o: 1,
      discipline: "Infra",
    },
    {
      activity: "Opslag olie en smeermiddelen (voorbeeld)",
      aspect: "Lekkage bij brand",
      aspectType: "SOIL",
      impact: "Bodem- en waterverontreiniging",
      situation: "EMERGENCY",
      controls: null,
      f: 1,
      e: 5,
      o: 3,
      discipline: "Infra",
    },
  ];

  for (const it of items) {
    const score = it.f * it.e * it.o;
    const legalLinked = !!(it.links?.legal && geluid);
    const significant = score >= T || !!it.legal || legalLinked || !!it.stakeholder;
    await prisma.environmentalAspect.create({
      data: {
        activity: it.activity,
        aspect: it.aspect,
        aspectType: it.aspectType,
        impact: it.impact,
        situation: it.situation,
        controls: it.controls,
        frequency: it.f,
        severity: it.e,
        extent: it.o,
        score,
        legalApplies: !!it.legal,
        stakeholderConcern: !!it.stakeholder,
        co2Relevant: it.aspectType === "ENERGY" || it.aspectType === "AIR",
        significant,
        ownerId: it.discipline === "Beton" ? qhse?.id : mk?.id,
        createdById: qhse?.id,
        disciplineId: await disc(it.discipline),
        locationId: groenlo.id,
        reviewDate: new Date(Date.now() + 180 * 86_400_000),
        requirements: { connect: [r612] },
        legalRequirements: legalLinked ? { connect: [{ id: geluid!.id }] } : undefined,
        risks: it.links?.risk && kwarts ? { connect: [{ id: kwarts.id }] } : undefined,
        processes: it.links?.process && process ? { connect: [{ id: process.id }] } : undefined,
      },
    });
  }
}

/**
 * Voorbeelddata CO2. LET OP: de emissiefactoren hieronder zijn VOORBEELDWAARDEN om de app te verkennen,
 * niet de officiële actuele lijst. Vervang ze door de waarden van CO2emissiefactoren.nl.
 */
async function seedDemoCo2() {
  if (await prisma.energyConsumption.findFirst({ where: { description: { endsWith: "(voorbeeld)" } } })) return;
  const qhse = await prisma.user.findFirst({ where: { role: "QHSE" } });
  const mk = await prisma.user.findFirst({ where: { role: "MIDDENKADER" } });
  const carrier = async (name: string) => prisma.energyCarrier.findUniqueOrThrow({ where: { name } });
  const disc = async (name: string) => (await prisma.discipline.findUniqueOrThrow({ where: { name } })).id;
  const groenlo = await prisma.location.findUniqueOrThrow({ where: { name: "Groenlo" } });
  const diesel = await carrier("Diesel (B7)");
  const stroom = await carrier("Elektriciteit (grijs)");
  const gas = await carrier("Aardgas");
  const km = await carrier("Zakelijke km privéauto");
  const DEMO = "VOORBEELDWAARDE — vervangen door de actuele lijst van CO2emissiefactoren.nl";
  const factors: [string, number][] = [
    [diesel.id, 3.262],
    [stroom.id, 0.45],
    [gas.id, 2.085],
    [km.id, 0.195],
  ];
  for (const [carrierId, factor] of factors) {
    await prisma.emissionFactor.upsert({
      where: { carrierId_validFrom: { carrierId, validFrom: new Date(Date.UTC(2020, 0, 1)) } },
      update: {},
      create: { carrierId, factor, validFrom: new Date(Date.UTC(2020, 0, 1)), source: DEMO },
    });
  }

  const shovel = await prisma.equipment.create({
    data: {
      name: "Shovel (voorbeeld)",
      code: "DEMO-SH-01",
      type: "shovel",
      defaultCarrierId: diesel.id,
      disciplineId: await disc("Afval/Transport"),
      locationId: groenlo.id,
    },
  });
  const mixer = await prisma.equipment.create({
    data: {
      name: "Truckmixer (voorbeeld)",
      code: "DEMO-TM-01",
      type: "truckmixer",
      defaultCarrierId: diesel.id,
      disciplineId: await disc("Beton"),
      locationId: groenlo.id,
    },
  });
  const plant = await prisma.equipment.create({
    data: {
      name: "Menginstallatie (voorbeeld)",
      code: "DEMO-MI-01",
      type: "installatie",
      defaultCarrierId: stroom.id,
      disciplineId: await disc("Beton"),
      locationId: groenlo.id,
    },
  });

  // Maandelijks verbruik 2024 t/m de vorige maand; licht dalende trend voor diesel.
  const now = new Date();
  const rows: Parameters<typeof prisma.energyConsumption.create>[0]["data"][] = [];
  for (let y = 2024; y <= now.getUTCFullYear(); y++) {
    for (let m = 0; m < 12; m++) {
      if (y === now.getUTCFullYear() && m >= now.getUTCMonth()) break;
      const start = new Date(Date.UTC(y, m, 1));
      const end = new Date(Date.UTC(y, m + 1, 0));
      const trend = 1 - (y - 2024) * 0.06;
      const winter = [0, 1, 2, 10, 11].includes(m) ? 1 : 0.25;
      const base = { periodStart: start, periodEnd: end, locationId: groenlo.id, createdById: qhse?.id };
      rows.push({
        ...base,
        carrierId: diesel.id,
        quantity: Math.round(2400 * trend),
        equipmentId: shovel.id,
        disciplineId: shovel.disciplineId,
        description: "Tankpas shovel (voorbeeld)",
      });
      rows.push({
        ...base,
        carrierId: diesel.id,
        quantity: Math.round(3100 * trend),
        equipmentId: mixer.id,
        disciplineId: mixer.disciplineId,
        description: "Tankpas truckmixer (voorbeeld)",
      });
      rows.push({
        ...base,
        carrierId: stroom.id,
        quantity: Math.round(18000 * (1 - (y - 2024) * 0.03)),
        equipmentId: plant.id,
        disciplineId: plant.disciplineId,
        description: "Energienota (voorbeeld)",
      });
      rows.push({ ...base, carrierId: gas.id, quantity: Math.round(900 * winter), description: "Gasnota kantoor (voorbeeld)" });
      rows.push({ ...base, carrierId: km.id, quantity: 1500, createdById: mk?.id, description: "Declaraties (voorbeeld)" });
    }
  }
  for (const data of rows) await prisma.energyConsumption.create({ data });

  const target = await prisma.reductionTarget.create({
    data: {
      title: "Scope 1: −25 % in 2030 t.o.v. 2024 (voorbeeld)",
      scope: 1,
      baseYear: 2024,
      targetYear: 2030,
      reductionPct: 25,
      description: "Vooral door minder en schonere diesel.",
    },
  });
  await prisma.reductionTarget.create({
    data: { title: "Totale uitstoot: −15 % in 2028 t.o.v. 2024 (voorbeeld)", baseYear: 2024, targetYear: 2028, reductionPct: 15 },
  });
  await prisma.action.createMany({
    data: [
      {
        title: "Shovel vervangen door elektrische shovel (voorbeeld)",
        source: "CO2_REDUCTION",
        reductionTargetId: target.id,
        expectedReductionKg: 60000,
        ownerId: mk?.id,
        createdById: qhse?.id,
        deadline: new Date(Date.UTC(now.getUTCFullYear() + 1, 5, 30)),
      },
      {
        title: "Training Het Nieuwe Rijden voor chauffeurs (voorbeeld)",
        source: "CO2_REDUCTION",
        reductionTargetId: target.id,
        expectedReductionKg: 8000,
        ownerId: qhse?.id,
        createdById: qhse?.id,
        status: "IN_PROGRESS",
      },
    ],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
