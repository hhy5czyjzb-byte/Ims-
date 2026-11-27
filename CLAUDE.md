# CLAUDE.md — IMS Rouwmaat Groep

Instructies en context voor Claude Code (en voor een opvolger of IT-partij). Houd dit bestand bij als er architectuur of keuzes veranderen.

## Wat is dit

Integraal managementsysteem (webapp) voor Rouwmaat Groep: ISO 9001, ISO 14001, CO2-prestatieladder, SCL, VCA**, BRL 2000/7000 (+ BRL's grondbank/granulaat), SVMS-007, SC-530/540. Volledige specificatie: `docs/specificatie.docx`. Huisstijl: `docs/huisstijl.pdf`.

Gebruikers: KAM (beheer), middenkader (~40), directie. Overige medewerkers lezen documenten via SharePoint/Appy, niet via deze app. Interface is **Nederlands**.

## Stack

- **Next.js 15** (App Router, React 19, TypeScript strict), server components + server actions; geen aparte API-laag.
- **PostgreSQL 16** + **Prisma 6** (`prisma/schema.prisma`, migraties in `prisma/migrations`).
- **NextAuth v4** met Microsoft Entra ID (provider `azure-ad`), JWT-sessies.
- **Tailwind CSS 4**; huisstijl als CSS-variabelen (`src/app/globals.css`, `@theme`) en in `src/theme/brand.ts`.
- **zod 4** voor validatie van alle formulierinvoer.
- Tests: Node test runner via `tsx` (`npm test`, bestanden `*.test.ts` naast de code).

Versies zijn exact gepind in `package.json`. `overrides` pinnen postcss, effect en deepmerge-ts op versies zonder bekende kwetsbaarheden; controleer bij upgrades of ze nog nodig zijn.

## Mappenstructuur

```
prisma/schema.prisma        datamodel (code Engels, labels NL)
prisma/seed.ts              basisvulling (idempotent); SEED_DEMO=true voor voorbeelddata
src/app/login               loginpagina (Microsoft + alleen-lokale ontwikkel-login)
src/app/(app)/…             alle schermen achter login; per module: page.tsx + actions.ts
src/app/api/auth            NextAuth-route
src/components              UI-bouwstenen (ui.tsx, form.tsx, checkbox-picker.tsx, …)
src/lib/auth.ts             NextAuth-config, requireUser/requirePermission, Graph-token
src/lib/rbac.ts             rechtentabel per rol + rol uit Entra-groepen
src/lib/audit.ts            audit trail (logAudit)
src/lib/action-result.ts    safeAction/UserError: foutmeldingen naar formulieren
src/lib/forms.ts            zod-helpers voor FormData
src/lib/graph.ts            Microsoft Graph (groepen, SharePoint-bibliotheek, preview)
src/lib/labels.ts           NL-labels voor enums
src/theme/brand.ts          centrale huisstijl (kleuren, font, logo)
public/brand                logo's (tijdelijk uit huisstijlblad; vervangen door officiële SVG)
```

## Architectuurkeuzes

1. **Flexibel normenkader.** `Norm` → `NormRequirement` (hiërarchisch via `parentId`). Bewijs (documenten, processen, processtappen, risico's, acties, auditbevindingen) wordt via many-to-many-relaties aan eisen gekoppeld; één bewijsstuk kan meerdere normen afdekken. Dekking per norm = aandeel 'blad'-eisen met ≥ 1 gekoppeld bewijs (`src/lib/coverage.ts`). Basis voor de latere normmatrix en audit-ready-score.
2. **Locatie en discipline** zijn stamgegevens en optionele kenmerken op acties, risico's, audits, enz. "Leeg" betekent bedrijfsbreed / alle locaties.
3. **Rechten komen uit Microsoft 365.** De rol (KAM > DIRECTIE > MIDDENKADER) wordt bij elke login bepaald uit Entra ID-groepen (`roleFromGroups`; bij group overage via Graph `checkMemberGroups`) en in `User.role` gecachet. Geen groep = geen toegang. Wat een rol mag staat in `PERMISSIONS` in `src/lib/rbac.ts`. Acties: KAM alles; anderen alleen eigen acties (eigenaar of aanmaker).
4. **SharePoint is de enige bron voor documenten.** `Document` bevat alleen verwijzing + gecachete metadata. Sync en preview via Graph met het **gedelegeerde token van de gebruiker** (dus met diens SharePoint-rechten). Het token zit versleuteld in de NextAuth-JWT-cookie en verlaat de server niet. Handmatige registratie (link) is mogelijk zolang Graph nog niet is gekoppeld.
5. **Audit trail.** Elke mutatie (CREATE/UPDATE/DELETE/SYNC), elke login en het bekijken van detailpagina's (VIEW) wordt gelogd in `AuditLog`. Nieuwe server-acties en detailpagina's moeten `logAudit` aanroepen.
6. **Server actions-patroon.** Elke actie: `return safeAction(async () => { const user = await requirePermission(...); const data = parseForm(schema, formData); …; await logAudit(...); revalidatePath(...); })`. Gebruikersfouten gooi je als `UserError` (tekst in het Nederlands); die verschijnen boven het formulier. Formulieren gebruiken `<Form action={...}>` uit `src/components/form.tsx`, nooit een kale `<form action>`.
7. **Ontwikkel-login** (`AUTH_DEV_LOGIN=true`) is er alleen voor fase 1 op de laptop. Uitgeschakeld zodra `NODE_ENV=production`, ongeacht de variabele. Seed maakt dan testgebruikers `*@ims.local`.
8. **Huisstijl centraal.** Kleuren in `brand.ts` én `globals.css` (`brand.test.ts` bewaakt dat ze gelijk blijven). Gebruik Tailwind-klassen `bg-brand-red`, `text-brand-red-dark`, `bg-brand-grey-light`, enz. Lettertype Fira Sans via `@fontsource` (werkt offline). Dezelfde `brand.ts` wordt later gebruikt voor de PowerPoint-directiebeoordeling en Teams/Outlook-meldingen.

9. **Risico's en kansen** (`src/app/(app)/risicos`). Score = kans × effect (1–25), klassen laag 1–4 / middel 5–9 / hoog 10–14 / zeer hoog 15–25 (`src/lib/risk.ts`). Risico's op een rode schaal, kansen op een groene schaal (hoger = aantrekkelijker). _Restrisico_ = beoordeling na maatregelen, of de bruto score zolang die ontbreekt (`residual()`); "na" vereist kans én effect. Codes `R-001` / `K-001` uit `Risk.number`. Categorie `SAFETY` = arbo/RI&E. Rechten: KAM alles; middenkader maakt aan en wijzigt eigen risico's (eigenaar/aanmaker); directie leest. Maatregelen worden acties met bron `RISK` en `riskId`. Filters staan in `src/lib/risk-filters.ts` en worden gedeeld met de CSV-export (`/risicos/export`, Excel-NL: puntkomma, BOM, formule-injectie geneutraliseerd). Matrixcel- en klassefilters werken op de positie in de matrix en worden in code toegepast (niet in SQL); de export negeert die twee.
10. **Formulieren** verzenden via `onSubmit` + transition (zie `src/components/form.tsx`), níet via de `action`-prop: React 19 wist anders het formulier ook bij een foutmelding. Alleen 'toevoegen'-formulieren die op de pagina blijven krijgen `resetOnSuccess`. **Wijzigformulieren krijgen een `key` op de gegevensversie** (bijv. `key={entity.updatedAt.toISOString()}`): ongecontroleerde velden nemen nieuwe `defaultValue`s niet over, dus zonder key tonen ze na een wijziging elders (statusknop, andere actie) verouderde waarden en kan opslaan die terugzetten.
11. **Audits** (`src/app/(app)/audits`). Codes `AU-001`, bevindingen `AU-001/2` (volgnummer per audit, `src/lib/audit-plan.ts`). Checklist = `AuditChecklistItem` per normeis (alleen eisen van de normen van de audit; bij het verwijderen van een norm uit de scope vervallen de regels). Een bevinding op een eis zet de checklistregel op `FINDING`. Afhandelen van een bevinding kan pas als alle acties gereed/vervallen zijn, en bij major/minor pas na vastleggen van de oorzaakanalyse. Acties vanuit een bevinding krijgen bron `AUDIT`, `findingId` en de normeis. Cyclusplanning (`/audits/cyclus`): per blad-eis per kalenderjaar 'getoetst' (afgeronde audit met resultaat ≠ niet getoetst), 'gepland' of niet afgedekt; geannuleerde audits tellen niet mee. Rechten: KAM beheert audits en bevindingen; iedereen leest; acties aanmaken volgens `actions.create`.
12. **Sorteren van eisen**: `compareRequirement` alleen voor eisen op hetzelfde niveau (boom, `flattenTree`); voor platte lijsten over niveaus heen (keuzelijsten, checklists) `compareRequirementFlat` (op paragraafnummer).
13. **Wet- en regelgeving** (`src/app/(app)/wetgeving`). `LegalRequirement` (code `W-001`) met compliancestatus; de status verandert alleen via een **toetsing** (`ComplianceAssessment`, historie = bewijs voor ISO 14001 9.1.2). Alleen de meest recente toetsing bepaalt de actuele status; volgende toetsing = datum + `reviewIntervalMonths` (`addMonths`, `src/lib/compliance.ts`). Bij 'voldoet niet' is een actie verplicht (tenzij er al een open actie loopt); acties krijgen bron `COMPLIANCE` en `legalRequirementId`. Compliancegraad = voldoet / (alle statussen behalve n.v.t.). Wettelijke eisen tellen als bewijs in de normdekking. Rechten: KAM beheert en importeert; de eigenaar (middenkader) mag toetsen; directie leest. Filters in `src/lib/legal-filters.ts` (combineren via `AND`, gedeeld met export).
14. **Excel-import** (`/wetgeving/import`). Het bestand wordt **in de browser** gelezen (`read-excel-file/browser`, of de eigen CSV-parser); alleen de gekoppelde kolommen gaan als JSON naar de server-actie `importLegal` (limiet 5 MB, `next.config.ts`), die alles opnieuw valideert. Pure importfuncties in `src/lib/legal-import.ts` (kolommen voorstellen, kopregel vinden, status/categorie/datum herkennen; getest). Bijwerken op kenmerk, anders op wet + artikel; lege cellen wissen niets; disciplines/locaties/eigenaren op naam (eigenaar ook op e-mail). Een status uit de import wordt als toetsing vastgelegd ("Overgenomen uit import"). De CSV-export gebruikt kolommen die direct weer te importeren zijn. **Niet** het npm-pakket `xlsx` gebruiken (verouderd, bekende kwetsbaarheden).

## Conventies

- Code-identifiers Engels, alle UI-tekst Nederlands. Nieuwe enums krijgen labels in `src/lib/labels.ts`.
- Datums: opslaan als UTC, tonen met `formatDate` (Europe/Amsterdam).
- Geen geheimen in code of commits; alleen in `.env` (zie `.env.example`).
- Na schemawijziging: `npm run db:migrate -- --name <korte-naam>` en de migratie committen. Weigert `migrate dev` niet-interactief (waarschuwing), genereer dan de SQL met `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <lege db> --script`, controleer die, zet hem in een nieuwe map onder `prisma/migrations/` en pas toe met `npm run db:deploy`.
- Voor commit: `npm run format && npm run lint && npm run typecheck && npm test && npm run build`.
- Testen in de browser: `SEED_DEMO=true npm run db:seed`, `npm run dev`, inloggen via de ontwikkel-login als KAM/Middenkader/Directie.

## Fasering en open punten

- **Fase 1** (nu): lokaal op de laptop van Eelco, lokale database. **Fase 2**: Azure (EU), Entra ID-login voor pilotgroep, daarna middenkader. Test- en productieomgeving gescheiden.
- Volgende modules (datamodel deels klaar): milieuaspecten (Excel-import), CO2-module, leveranciersbeoordeling, stakeholders/context, directiebeoordeling (pptx in huisstijl), keuringen, toolbox/LMRA, klachten, KPI's, noodsituaties, MoC, communicatieplan, certificaten- en vergunningenarchief, normmatrix, herinneringen via Teams/Outlook, MCP-server (alleen-lezen, namens de gebruiker, gelogd).
- Middenkader "eigen afdeling inzien": nu ziet iedereen alles (alleen-lezen buiten eigen acties). Afdelings-/disciplinefilter per gebruiker nog uitwerken (bijv. via Entra-groepen per discipline).
- Audits: interne auditors uit het middenkader kunnen nu geen checklist invullen (alleen KAM). Eventueel later een recht 'auditor' per audit. Cyclusjaren zijn kalenderjaren; koppelen aan certificaatdata zodra het certificatenarchief er is.
- Wet- en regelgeving: koppeling aan vergunningen volgt met het certificaten- en vergunningenarchief. Herinneringen voor toetsingen via Teams/Outlook volgen met de meldingen.
- Open in de specificatie: exacte BRL-nummers grondbank/granulaat, welke VCA-onderdelen, hosting/ERP-koppeling.
- Officiële logo-SVG van marketing vervangen in `public/brand`.
