/**
 * Basisvulling van de database. Idempotent: kan veilig vaker gedraaid worden.
 *
 *   npm run db:seed                 → normen, disciplines, locatie, functies (+ testgebruikers lokaal)
 *   SEED_DEMO=true npm run db:seed  → idem, plus een voorbeeldproces en voorbeeldacties
 *
 * Normeisen: alleen de hoofdstukstructuur (High Level Structure) van ISO 9001 en
 * ISO 14001 is ingevuld. De overige normen staan klaar zonder eisen; KAM vult die
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
    description: "Eisen per niveau en invalshoek nog in te voeren door KAM.",
  },
  { code: "SCL", name: "Safety Culture Ladder", category: "SAFETY", description: "Eisen nog in te voeren door KAM." },
  {
    code: "VCA**",
    name: "VCA** — Veiligheid, gezondheid en milieu Checklist Aannemers",
    category: "SAFETY",
    description: "Gedeeltelijk van toepassing; welke onderdelen is een open punt.",
  },
  { code: "BRL 2000", name: "BRL 2000", category: "PRODUCT", description: "Eisen nog in te voeren door KAM." },
  { code: "BRL 7000", name: "BRL 7000", category: "PRODUCT", description: "Eisen nog in te voeren door KAM." },
  { code: "SVMS-007", name: "SVMS-007", category: "PRODUCT", description: "Eisen nog in te voeren door KAM." },
  { code: "SC-530", name: "Asbestcertificering SC-530 (asbestinventarisatie)", category: "SAFETY", description: "Eisen nog in te voeren door KAM." },
  { code: "SC-540", name: "Asbestcertificering SC-540 (asbestverwijdering)", category: "SAFETY", description: "Eisen nog in te voeren door KAM." },
  // BRL's voor grondbank en granulaat: nummers nog te bevestigen (open punt) — toevoegen via Normenbeheer.
];

const DISCIPLINES = ["Prefab", "Beton", "Afvalrecycling", "Infra"];
const LOCATIONS = [{ name: "Groenlo", address: "Hoofdvestiging" }];
const FUNCTIONS = [
  "Directeur",
  "KAM-coördinator",
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

  const isProd = process.env.NODE_ENV === "production";
  if (!isProd && process.env.AUTH_DEV_LOGIN === "true") {
    console.log("Seed: testgebruikers voor de ontwikkel-login…");
    const testUsers = [
      { email: "test.kam@ims.local", name: "Test KAM", role: "KAM" as const },
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
  }
  console.log("Seed klaar.");
}

/** Voorbeelddata om de app te verkennen. Niet gebruiken in productie. */
async function seedDemo() {
  console.log("Seed: voorbeelddata…");
  if (await prisma.process.findFirst({ where: { code: "DEMO-BET-01" } })) return;

  const beton = await prisma.discipline.findUniqueOrThrow({ where: { name: "Beton" } });
  const groenlo = await prisma.location.findUniqueOrThrow({ where: { name: "Groenlo" } });
  const kam = await prisma.user.findFirst({ where: { role: "KAM" } });
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
      ownerName: "KAM",
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
      ownerId: kam?.id,
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
        ["C", "KAM-coördinator"],
      ],
    },
    {
      name: "Kwaliteitscontrole en vrijgave",
      raci: [
        ["R", "Productieleider"],
        ["A", "Bedrijfsleider"],
        ["I", "KAM-coördinator"],
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
        createdById: kam?.id,
        deadline: new Date(Date.now() - 5 * 86_400_000),
        disciplineId: beton.id,
        locationId: groenlo.id,
      },
      {
        title: "Werkinstructie mengen actualiseren (voorbeeld)",
        source: "MANUAL",
        priority: "MEDIUM",
        ownerId: kam?.id,
        createdById: kam?.id,
        deadline: new Date(Date.now() + 14 * 86_400_000),
        disciplineId: beton.id,
      },
      {
        title: "Toolbox stofbeheersing breker plannen (voorbeeld)",
        source: "RISK",
        priority: "MEDIUM",
        ownerId: mk?.id,
        createdById: kam?.id,
        deadline: new Date(Date.now() + 30 * 86_400_000),
        status: "IN_PROGRESS",
        locationId: groenlo.id,
      },
    ],
  });
}

/** Voorbeeldrisico's en -kansen (idempotent op titel). */
async function seedDemoRisks() {
  const kam = await prisma.user.findFirst({ where: { role: "KAM" } });
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
      disciplineId: await disc("Afvalrecycling"),
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
      ownerId: kam?.id,
      disciplineId: await disc("Beton"),
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
      ownerId: kam?.id,
      disciplineId: await disc("Beton"),
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
      ownerId: kam?.id,
      disciplineId: await disc("Beton"),
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
      disciplineId: await disc("Afvalrecycling"),
      locationId: groenlo.id,
      reviewDate: null,
      requirements: [],
      processes: [],
    },
  ];

  for (const { requirements, processes, ...r } of risks) {
    if (await prisma.risk.findFirst({ where: { title: r.title } })) continue;
    const risk = await prisma.risk.create({
      data: { ...r, createdById: kam?.id, requirements: { connect: requirements }, processes: { connect: processes } },
    });
    if (r.category === "QUALITY") {
      await prisma.action.create({
        data: {
          title: "Vochtmeting toeslagmateriaal per partij invoeren (voorbeeld)",
          source: "RISK",
          riskId: risk.id,
          ownerId: mk?.id,
          createdById: kam?.id,
          disciplineId: r.disciplineId,
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
  const kam = await prisma.user.findFirst({ where: { role: "KAM" } });
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
      auditor: "Test KAM",
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
      createdById: kam?.id,
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
  const kam = await prisma.user.findFirst({ where: { role: "KAM" } });
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
      disciplineId: await disc("Afvalrecycling"),
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
      ownerId: kam?.id,
      disciplineId: await disc("Afvalrecycling"),
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
      ownerId: kam?.id,
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
      ownerId: kam?.id,
      disciplineId: null,
      locationId: null,
      requirements: [await req("6.1.3")],
      risks: [],
    },
  ];

  for (const { requirements, risks, ...data } of items) {
    const created = await prisma.legalRequirement.create({
      data: { ...data, createdById: kam?.id, requirements: { connect: requirements }, risks: { connect: risks } },
    });
    if (data.status !== "NOT_ASSESSED" && data.lastReviewDate) {
      await prisma.complianceAssessment.create({
        data: { legalRequirementId: created.id, date: data.lastReviewDate, status: data.status, explanation: data.explanation, assessedById: kam?.id },
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
          createdById: kam?.id,
          deadline: ahead(30),
          locationId: groenlo.id,
        },
      });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
