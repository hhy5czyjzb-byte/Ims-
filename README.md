# IMS Rouwmaat Groep

Integraal managementsysteem (IMS) voor alle certificeringen van Rouwmaat Groep (Groenlo) in één webapplicatie, voor de disciplines prefab, beton, afvalrecycling en infra.

> Specificatie: [`docs/specificatie.docx`](docs/specificatie.docx) · Huisstijl: [`docs/huisstijl.pdf`](docs/huisstijl.pdf) · Architectuur en keuzes: [`CLAUDE.md`](CLAUDE.md)

## Status (versie 0.1, fase 1)

| Module                                                                                                                                      | Status                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Lokale modus zonder inloggen (fase 1), met "Bekijken als" voor de andere rollen                                                             | ✅                                            |
| Inloggen met Microsoft 365 (Entra ID), rollen uit Entra ID-groepen                                                                          | ✅ gebouwd, nog niet gekoppeld (fase 2)       |
| Normenbeheer: normen, eisen/hoofdstukken, dekking met bewijs                                                                                | ✅                                            |
| Processen: proceskaart per discipline, processtappen, RACI, koppelingen                                                                     | ✅                                            |
| Documentbeheer: verwijzingen naar SharePoint, sync via Graph, koppelingen                                                                   | ✅ (sync nog te testen met echte bibliotheek) |
| Risico's en kansen (incl. RI&E): 5×5-matrix vóór/na maatregelen, filters, acties, CSV-export                                                | ✅                                            |
| Audits (intern, extern, klant): planning, checklist per norm, bevindingen met opvolging, planning over de certificatiecyclus                | ✅                                            |
| Wet- en regelgeving: register met compliancestatus, toetsingen (evaluatie naleving), acties, Excel-import met kolommen koppelen, CSV-export | ✅                                            |
| Milieuaspecten: register met scoring (F × E × O), significantie (instelbare drempel), acties, Excel-import, CSV-export                      | ✅                                            |
| Acties en verbeterpunten                                                                                                                    | ✅                                            |
| Dashboard                                                                                                                                   | ✅ eenvoudige versie                          |
| Stamgegevens (locaties, disciplines, functies) en logboek (audit trail)                                                                     | ✅                                            |
| Datamodel voor leveranciers en stakeholders                                                                                                 | ✅ in database, schermen volgen               |
| CO2, directiebeoordeling, …                                                                                                                 | ⏳ volgende fasen                             |

## Snel starten (lokaal, laptop)

Vereisten: **Node.js 22** (LTS) en **PostgreSQL 16** (lokaal geïnstalleerd, of via Docker Desktop).

```bash
# 1. Database starten (met Docker; of gebruik een lokale PostgreSQL)
docker compose up -d

# 2. Configuratie
cp .env.example .env
#    - vul NEXTAUTH_SECRET in:  openssl rand -base64 32
#    - laat AUTH_MODE="local" staan: je komt zonder inloggen binnen (zet LOCAL_USER_NAME op je eigen naam)

# 3. Installeren, database aanmaken en vullen
npm install
npm run db:deploy        # tabellen aanmaken
npm run db:seed          # normen, disciplines, functies, lokale gebruiker en testgebruikers
# of, met voorbeeldproces en voorbeeldacties:
SEED_DEMO=true npm run db:seed

# 4. Starten
npm run dev              # → http://localhost:3000
```

**Inloggen is in fase 1 niet nodig.** Je komt direct binnen als de lokale gebruiker (`LOCAL_USER_NAME`, rol QHSE). Met **"Bekijken als"** onderin het menu kijk je mee met de rechten van een andere rol (testgebruikers QHSE, Directie, Middenkader); kies "jijzelf" om terug te gaan.

Veiligheid van de lokale modus: de app is dan alleen bereikbaar via `localhost` (andere adressen krijgen een foutmelding) en `npm run dev` / `npm run start:local` luisteren alleen op de eigen laptop. Gebruik de lokale modus nooit op een server; daar geldt `AUTH_MODE="entra"` (Microsoft 365).

## Handige commando's

| Commando                                                | Wat                                                            |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                                           | Ontwikkelserver                                                |
| `npm run build` / `npm run start:local`                 | Productiebuild / starten op de eigen laptop (alleen localhost) |
| `npm start`                                             | Productiebuild / starten                                       |
| `npm test`                                              | Unit tests (Node test runner)                                  |
| `npm run lint` / `npm run typecheck` / `npm run format` | Codekwaliteit                                                  |
| `npm run db:migrate -- --name <naam>`                   | Nieuwe migratie na wijziging van `prisma/schema.prisma`        |
| `npm run db:deploy`                                     | Migraties toepassen (test/productie)                           |
| `npm run db:seed`                                       | Basisgegevens (idempotent)                                     |
| `npm run db:studio`                                     | Database bekijken in de browser                                |

## Microsoft 365 koppelen (Entra ID) — fase 2

Zet daarna `AUTH_MODE="entra"` in `.env` (of laat het leeg zodra de AZURE_AD_* zijn ingevuld). Het loginscherm verschijnt dan en de lokale modus en "Bekijken als" verdwijnen.

Door de IT-beheerder van Rouwmaat in [Entra ID](https://entra.microsoft.com):

1. **App-registratie** → _Nieuwe registratie_, naam `IMS Rouwmaat`, _alleen accounts in deze organisatiemap_ (single tenant).
   Redirect-URI (Web): `http://localhost:3000/api/auth/callback/azure-ad` (later ook de Azure-URL).
2. **Certificaten en geheimen** → nieuw clientgeheim. Zet in `.env`: `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`.
3. **API-machtigingen** (gedelegeerd, Microsoft Graph): `User.Read`, `GroupMember.Read.All`, `Sites.Read.All`, `offline_access` → _beheerderstoestemming verlenen_.
4. **Tokenconfiguratie** → _groepsclaim toevoegen_ → _beveiligingsgroepen_ (groeps-ID's in het ID-token).
5. **Beveiligingsgroepen** aanmaken (bijv. `IMS-QHSE`, `IMS-Directie`, `IMS-Middenkader`) en de object-ID's invullen bij `ENTRA_GROUP_QHSE`, `ENTRA_GROUP_DIRECTIE`, `ENTRA_GROUP_MIDDENKADER`.
6. **MFA en conditional access** regel je in Entra ID (bijv. via een conditional-access-beleid op deze app). De app zelf bewaart geen wachtwoorden.

Wie in geen van de drie groepen zit, komt er niet in. Rollen wijzig je **alleen in Microsoft 365**: bij de volgende login neemt de app de rol over.

## SharePoint-documentbibliotheek koppelen

De documenten staan in één SharePoint-bibliotheek (_IMS-documenten_). De app slaat **geen kopieën** op: alleen een verwijzing en de metadata (status, versie, eigenaar, revisiedatum).

1. Zoek het drive-ID van de bibliotheek op, bijvoorbeeld in [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer):
   `GET https://graph.microsoft.com/v1.0/sites/{tenant}.sharepoint.com:/sites/{sitenaam}` → `id` = site-ID,
   daarna `GET /sites/{site-id}/drives` → `id` van _IMS-documenten_ = drive-ID.
2. Vul `SHAREPOINT_SITE_ID` en `SHAREPOINT_DRIVE_ID` in `.env` in.
3. Controleer de interne kolomnamen van de bibliotheek (bijv. `Revisiedatum`, `Eigenaar`) en pas zo nodig `FIELD_MAP` in `src/lib/graph.ts` aan.
4. In Documentbeheer verschijnt dan de knop _Synchroniseren met SharePoint_ (alleen voor QHSE, met de SharePoint-rechten van de ingelogde gebruiker).

Zolang de koppeling nog niet actief is, kan QHSE documenten handmatig registreren met een link naar SharePoint.

## Omgevingen

| Omgeving              | Waar                                                  | Database                                                          |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| Ontwikkeling (fase 1) | laptop, `localhost:3000`                              | lokale PostgreSQL                                                 |
| Test (fase 2)         | Azure App Service (EU, _West Europe_), apart slot/app | Azure Database for PostgreSQL                                     |
| Productie (fase 2)    | Azure App Service (EU)                                | Azure Database for PostgreSQL, dagelijkse back-up met hersteltest |

Wijzigingen gaan altijd eerst naar test. De build levert een zelfstandige Node-server (`output: "standalone"`), geschikt voor Azure App Service of een container.

## Beveiliging (samenvatting)

- Inloggen alleen via Microsoft 365 (Entra ID, single tenant), MFA via Entra ID; geen wachtwoorden in de app.
- Rollen uit Entra ID-groepen; SharePoint-gegevens worden opgehaald met het token van de gebruiker (_least privilege_).
- Audit trail van inloggen, bekijken en wijzigen (Stamgegevens → Logboek).
- Invoer gevalideerd met zod op de server; security headers (HSTS, X-Frame-Options e.d.); geen geheimen in de code (`.env` staat in `.gitignore`).
- CI controleert bij elke push op kwetsbare pakketten (`npm audit`); Dependabot houdt pakketten bij.
- Nog te doen vóór livegang: pentest door een externe partij, AVG-check (verwerkingsregister), back-up/hersteltest.

## Overdracht

Broncode hoort in een bedrijfsaccount van Rouwmaat Groep (GitHub-organisatie of Azure DevOps), niet op een persoonlijk account. Alle architectuurkeuzes en conventies staan in [`CLAUDE.md`](CLAUDE.md).
