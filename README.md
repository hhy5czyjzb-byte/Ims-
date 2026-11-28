# IMS Rouwmaat Groep

Integraal managementsysteem (IMS) voor alle certificeringen van Rouwmaat Groep (Groenlo) in één webapplicatie, voor de BU's infra, beton, prefab, afval/transport en asbestinventarisatie.

> Specificatie: [`docs/specificatie.docx`](docs/specificatie.docx) · Huisstijl: [`docs/huisstijl.pdf`](docs/huisstijl.pdf) · Architectuur en keuzes: [`CLAUDE.md`](CLAUDE.md)

## Status (versie 0.1, fase 1)

| Module                                                                                                                                                                                                        | Status                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Lokale modus zonder inloggen (fase 1), met "Bekijken als" voor de andere rollen                                                                                                                               | ✅                                            |
| Inloggen met Microsoft 365 (Entra ID), rollen uit Entra ID-groepen                                                                                                                                            | ✅ gebouwd, nog niet gekoppeld (fase 2)       |
| Normenbeheer: normen, eisen/hoofdstukken, dekking met bewijs                                                                                                                                                  | ✅                                            |
| Context en stakeholders: analyse uit Word (tekst met afbeeldingen), bewerken als conceptversie, vaststellen, contextfactoren, stakeholders en verplichtingen                                                  | ✅                                            |
| Processen: proceskaart per discipline, processtappen, RACI, koppelingen                                                                                                                                       | ✅                                            |
| Documentbeheer: verwijzingen naar SharePoint, sync via Graph, koppelingen                                                                                                                                     | ✅ (sync nog te testen met echte bibliotheek) |
| Risico's en kansen (incl. RI&E): 5×5-matrix vóór/na maatregelen, prioriteit (★ strategisch), filters, acties, Excel-import, CSV-export                                                                        | ✅                                            |
| Audits (intern, extern, klant): planning, checklist per norm, bevindingen met opvolging, planning over de certificatiecyclus                                                                                  | ✅                                            |
| Wet- en regelgeving: register met compliancestatus, toetsingen (evaluatie naleving), acties, Excel-import met kolommen koppelen, CSV-export                                                                   | ✅                                            |
| Compliance-audit per vestiging: vragenbank, checklist per vestiging met oordeel en bevinding, score, acties, Excel-import en -export                                                                          | ✅                                            |
| Milieuaspecten (MAR): risico E × B × W, prio H/M/L (significant), signaal prio ≠ risico, levenscyclus, overzicht per BU/locatie/thema, Excel-import, CSV-export                                               | ✅                                            |
| CO2-prestatieladder: energiedragers met emissiefactoren (met ingangsdatum), verbruik per periode/discipline/locatie/materieel, footprint scope 1-2-3, doelstellingen en maatregelen, Excel-import, CSV-export | ✅                                            |
| Meldingen (afwijkingen, klachten, ongevallen, bijna-ongevallen, milieu-incidenten) met oorzaakanalyse en effectiviteit; actielijst met alle bronnen, import en export; grafieken                              | ✅                                            |
| Dashboard                                                                                                                                                                                                     | ✅ eenvoudige versie                          |
| Stamgegevens (locaties, disciplines, functies) en logboek (audit trail)                                                                                                                                       | ✅                                            |
| Datamodel voor leveranciers                                                                                                                                                                                   | ✅ in database, schermen volgen               |
| Directiebeoordeling, …                                                                                                                                                                                        | ⏳ volgende fasen                             |

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

## Bestaande registers inlezen (eerste vulling)

Importeer in deze volgorde (elk via de knop "Importeren uit Excel"; kolommen worden automatisch gekoppeld, eerst controleren, dan importeren):

1. **Vestigingen** — Stamgegevens → Vestigingen importeren, bestand _register wet- en regelgeving_, tabblad _Vestigingen_.
2. **Risico's** — Risico's en kansen → Importeren, bestand _risico- en kansenregister_, tabblad _Risico's_.
3. **Kansen** — zelfde bestand, tabblad _Kansen_.
4. **Wet- en regelgeving** — Wet- en regelgeving → Importeren, tabblad _Register_ (koppelt de risico's uit kolom "Risicoregister", daarom na de risico's).
5. **Auditvragen** — Wet- en regelgeving → Compliance-audit per vestiging → Importeren, tabblad _Compliance-audit_.
6. **Milieuaspecten** — Milieuaspecten → Importeren, bestand _Milieuaspectenregister (MAR)_, tabblad _MAR_ (koppelt de W- en R/K-nummers, daarom na het register wet- en regelgeving en het risico- en kansenregister).
7. **Context- en stakeholderanalyse** — Context en stakeholders → Versies → Word-bestand inlezen (vul "Al vastgesteld op" in als de directie hem al heeft vastgesteld).

Opnieuw importeren werkt bij (op het nummer R01/K01/W001) en maakt geen dubbele regels. Maak vooraf een back-up.

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

## Back-up en herstel (fase 1, laptop)

Zolang de app op de laptop draait, staan alle gegevens alleen daar. Maak daarom dagelijks een back-up.

| Commando                              | Wat                                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run backup`                      | Back-up maken **met hersteltest**: de back-up wordt teruggezet in een tijdelijke database en per tabel gecontroleerd |
| `npm run backup:plan`                 | Dagelijkse back-up inplannen (Windows Taakplanner, standaard 12:30; andere tijd: `npm run backup:plan -- 09:15`)     |
| `npm run backup:lijst`                | Overzicht van de back-ups en de uitkomst van de hersteltest                                                          |
| `npm run backup:test`                 | Hersteltest van de nieuwste back-up (of `-- <bestand>`)                                                              |
| `npm run backup:herstel -- <bestand>` | Back-up terugzetten (stop eerst de app). Maakt eerst automatisch een veiligheidskopie van de huidige stand           |

- Werkt met de database in Docker (`docker compose`) of met een lokale PostgreSQL-installatie.
- Map: `BACKUP_DIR` in `.env` (standaard `backups/` in het project, staat niet in git). **Tip: kies een map in OneDrive**, dan staat er ook een kopie buiten de laptop.
- De nieuwste `BACKUP_KEEP` (standaard 30) back-ups blijven bewaard.
- In de app: Stamgegevens → Back-ups (knop "Nu back-up maken" en overzicht). Het dashboard waarschuwt QHSE als de laatste geteste back-up ouder is dan 2 dagen.
- Back-upbestanden bevatten bedrijfsgegevens: niet mailen of in git zetten.

## Online op Vercel (zonder iets te installeren)

Alles gaat in de browser. De app draait dan in Frankfurt (EU) met een Neon-database (Postgres, Frankfurt).

1. **Account**: ga naar [vercel.com](https://vercel.com) → _Sign Up_ → _Continue with GitHub_ (het GitHub-account waar deze repository staat).
2. **Project**: _Add New…_ → _Project_ → kies de repository **Ims-** → nog niet op _Deploy_ klikken.
3. **Database**: in het project → _Storage_ → _Create Database_ → **Neon** (Postgres) → regio **Frankfurt (eu-central-1)** → koppelen aan het project. De verbindingsgegevens (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`) worden automatisch ingevuld.
4. **Instellingen**: _Settings_ → _Environment Variables_ → voeg toe (voor _Production_):

   | Naam              | Waarde                                                                                       |
   | ----------------- | -------------------------------------------------------------------------------------------- |
   | `AUTH_MODE`       | `password`                                                                                   |
   | `ADMIN_EMAIL`     | je eigen e-mailadres                                                                         |
   | `ADMIN_PASSWORD`  | een sterk wachtwoord van minimaal 12 tekens (alleen hier, nergens anders opschrijven)        |
   | `ADMIN_NAME`      | je naam (bijv. `Eelco`)                                                                      |
   | `NEXTAUTH_SECRET` | een lange willekeurige reeks tekens (minimaal 32), bijv. uit een wachtwoordgenerator         |
   | `NEXTAUTH_URL`    | het adres van de app, bijv. `https://ims-rouwmaat.vercel.app` (na de eerste deploy invullen) |

5. **Deploy**: _Deployments_ → _Redeploy_ (of de eerste _Deploy_). Bij elke deploy worden de database-migraties en de basisvulling (normen, disciplines) automatisch uitgevoerd (`scripts/vercel-build.sh`).
6. **Inloggen** op het adres van de app met `ADMIN_EMAIL` en `ADMIN_PASSWORD`. Na 10 mislukte pogingen is inloggen 15 minuten geblokkeerd; elke poging staat in het logboek.
7. **Vullen**: lees de registers in (zie _Bestaande registers inlezen_).

Goed om te weten:

- **Kosten en voorwaarden**: het gratis Hobby-abonnement van Vercel is voor niet-commercieel gebruik; voor zakelijk gebruik is Vercel _Pro_ nodig. Neon heeft een gratis instap.
- **AVG**: Vercel en Neon zijn Amerikaanse bedrijven (servers in de EU). Sluit hun verwerkersovereenkomst (DPA) af en leg dit voor aan directie/IT. De specificatie gaat voor fase 2 uit van Azure.
- **Wachtwoordmodus is tijdelijk** en alleen voor één beheerder (rol QHSE). Voordat het middenkader erbij komt: Microsoft 365 koppelen (hieronder) en `AUTH_MODE` op `entra` zetten.
- **Back-ups** regelt Neon (herstel naar een eerder moment); de back-upknop in de app is alleen voor de lokale modus.
- Per verzoek geldt bij Vercel een limiet van 4,5 MB; Word-documenten worden daarom in de browser omgezet en in delen verstuurd (afbeeldingen max. 4 MB per stuk).

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
