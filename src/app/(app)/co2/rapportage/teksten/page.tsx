import { requirePagePermission } from "@/lib/auth";
import { getReportTexts, type ReportTexts } from "@/lib/co2-report";
import { PageHeader } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Co2Nav } from "@/components/co2-nav";
import { saveReportTexts } from "../actions";
import { TextsFile } from "./texts-file";

export const metadata = { title: "Teksten CO2-jaarverslag" };

type Field = { key: keyof ReportTexts; label: string; rows?: number; hint?: string; placeholder?: string };
const TABLE_HINT = "Tabel: kolommen gescheiden door |, eerste regel = kolomkoppen; een regel met alleen tekst in de eerste kolom wordt een tussenkop.";
const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: "Voorblad, leeswijzer en management statement",
    fields: [
      { key: "publication", label: "Regel op het voorblad", rows: 0, placeholder: "CO2-prestatieladder – Publicatie oktober 2026" },
      {
        key: "readingGuide",
        label: "Leeswijzer",
        rows: 10,
        hint: "Opbouw van het verslag en de ondersteunende documenten (dashboard, interne audit, directiebeoordeling, SKAO-pagina).",
      },
      {
        key: "statement",
        label: "Management statement & energiebeleid",
        rows: 14,
        hint: "Gebruik ## voor de kopjes (Inleiding, Doelstelling en strategische richting, …).",
      },
      { key: "statementDate", label: "Datum ondertekening", rows: 0, placeholder: "bijv. 21-10-2026" },
      { key: "statementName", label: "Naam (directie)", rows: 0 },
    ],
  },
  {
    title: "Algemene eisen",
    fields: [
      { key: "organisation", label: "Organisatiebeschrijving", rows: 8 },
      { key: "boundary", label: "Organisatiegrens (methode en entiteiten)", rows: 10, hint: "Entiteiten als opsomming: elke regel met - ervoor." },
      { key: "planning", label: "Planning (PDCA-cyclus)", rows: 8 },
      { key: "pdcaPlan", label: "PDCA-figuur: Plan", rows: 2 },
      { key: "pdcaDo", label: "PDCA-figuur: Do", rows: 2 },
      { key: "pdcaCheck", label: "PDCA-figuur: Check", rows: 2 },
      { key: "pdcaAct", label: "PDCA-figuur: Act", rows: 2 },
      { key: "legalRisk", label: "Wetgeving en risicobeheer", rows: 8 },
      { key: "projects", label: "CO2-prestatieladder projecten (gunningvoordeel)", rows: 4 },
    ],
  },
  {
    title: "Invalshoek A — CO2-uitstoot en energieverbruik",
    fields: [
      { key: "footprintText", label: "Toelichting CO2-footprint", rows: 4, hint: "Leeg = de app schrijft zelf een tekst met de cijfers." },
      { key: "nonCo2", label: "Niet-CO2-broeikasgassen", rows: 3 },
      {
        key: "energyReview",
        label: "Energiebeoordeling (inleiding)",
        rows: 5,
        hint: "De emissiestromen die samen 80% van het energieverbruik vormen rekent de app zelf uit.",
      },
      { key: "fuelText", label: "Brandstofgebruik", rows: 8, hint: "Leeg = de app schrijft zelf een tekst met de cijfers per jaar." },
      { key: "truckText", label: "Vrachtwagenpark (bij figuur V1)", rows: 6 },
      { key: "fleetText", label: "Wagenpark (bij figuur V3)", rows: 6 },
      { key: "conclusions", label: "Conclusies, aanbevelingen en genomen maatregelen", rows: 10 },
      { key: "flexibility", label: "Flexibiliteit van het energiesysteem", rows: 8 },
    ],
  },
  {
    title: "Invalshoek B — Doelstellingen, plan van aanpak en voortgang",
    fields: [
      { key: "strategy", label: "Algemene uitleg strategie", rows: 5 },
      {
        key: "co2TargetText",
        label: "Korte termijn CO2-doelstellingen (inleiding)",
        rows: 4,
        hint: "De doelstelling en de subdoelstellingen per scope komen uit het plan van aanpak.",
      },
      { key: "energyTargetText", label: "Korte termijn energiedoelstellingen (inleiding)", rows: 4 },
      {
        key: "energyGoals",
        label: "Subdoelstellingen energie",
        rows: 4,
        hint: "Eén per regel: onderwerp | doel",
        placeholder: "Zelf energie opwekken | Onderzoeken of er meer zonnepanelen geplaatst kunnen worden.",
      },
      { key: "shortTermStrategy", label: "Korte termijn strategie", rows: 6 },
      {
        key: "planText",
        label: "Plan van aanpak (maatregelen)",
        rows: 10,
        hint: "Leeg = de vijf maatregelen met de grootste reductie uit het plan van aanpak.",
      },
      { key: "justification", label: "Verantwoording doelstellingen", rows: 5 },
      { key: "progressText", label: "Voortgang op de doelstellingen (scope 1 en 2)", rows: 8, hint: "Leeg = de app schrijft zelf een tekst met de cijfers." },
      { key: "energyProgressText", label: "Voortgang energiedoelstelling", rows: 8 },
      { key: "peersIntro", label: "Vergelijking met sectorgenoten (inleiding)", rows: 5 },
      {
        key: "peers",
        label: "Vergelijking met sectorgenoten (tabel)",
        rows: 7,
        hint: TABLE_HINT,
        placeholder: " | Rouwmaat Groep | Sectorgenoot A\nTrede CO2 PL | Trede 1 | Trede 1\nBasisjaar | 2025 | 2023",
      },
      { key: "peersText", label: "Toelichting vergelijking", rows: 8 },
    ],
  },
  {
    title: "Invalshoek C — Sleutelpersonen en communicatie",
    fields: [
      { key: "keyPersonsIntro", label: "Sleutelpersonen (inleiding)", rows: 3 },
      {
        key: "keyPersons",
        label: "Sleutelpersonen (tabel)",
        rows: 10,
        hint: TABLE_HINT,
        placeholder: "Naam | Taak | CO2-bewustzijn\nDirectie/management | |\n… | Strategische leiding | Niveau 4: verantwoordelijk voelen",
      },
      { key: "support", label: "Ondersteuning (externe adviseur)", rows: 3 },
      { key: "communication", label: "Communicatieplan (inleiding)", rows: 4 },
      { key: "channels", label: "Middelen", rows: 4, hint: "Opsomming: elke regel met - ervoor." },
      { key: "audienceExternal", label: "Externe doelgroep (tabel)", rows: 8, hint: TABLE_HINT, placeholder: "Doelgroepen | Boodschap | Doel" },
      { key: "audienceInternal", label: "Interne doelgroep (tabel)", rows: 6, hint: TABLE_HINT, placeholder: "Doelgroepen | Boodschap | Doel" },
      {
        key: "commPlanning",
        label: "Verantwoordelijke en planning",
        rows: 12,
        hint: "Per middel een kopje met ### (bijv. ### 1. Eigen website) met daaronder planning, verantwoordelijke en toelichting.",
      },
    ],
  },
  {
    title: "Invalshoek D — Samenwerking en slot",
    fields: [
      {
        key: "collaboration",
        label: "Inventarisatie kennis- en samenwerkingsbehoeftes",
        rows: 12,
        hint: "Per behoefte een kopje met ### en daaronder de toelichting.",
      },
      { key: "partners", label: "Samenwerkingsverbanden", rows: 4, hint: "Eén per regel." },
      { key: "partnersText", label: "Toelichting samenwerkingsverbanden", rows: 6 },
      { key: "closing", label: "Slot (onder 'Bedankt voor het lezen')", rows: 3, placeholder: "Vragen of opmerkingen over dit verslag? Mail dan naar …" },
    ],
  },
];

/** Sleutel op de inhoud: na inlezen van een bestand tonen de velden de nieuwe teksten. */
function hashKey(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

export default async function ReportTextsPage() {
  await requirePagePermission("co2.manage");
  const texts = await getReportTexts();
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/co2", label: "CO2" },
          { href: "/co2/rapportage", label: "Jaarverslag" },
        ]}
        title="Teksten CO2-jaarverslag"
        description="De vaste teksten van het jaarverslag. Cijfers, tabellen, grafieken en de teksten bij de cijfers vult de app zelf in. Tip: kopieer de teksten uit het vorige jaarverslag en werk ze bij."
        print={false}
      />
      <Co2Nav />
      <TextsFile />
      <section className="card mb-6 text-sm print:hidden">
        <h2 className="mb-2">Opmaak in de teksten</h2>
        <ul className="grid gap-x-6 gap-y-1 text-neutral-700 sm:grid-cols-2">
          <li>Lege regel = nieuwe alinea</li>
          <li>
            <code>## Kop</code> en <code>### Tussenkop</code>
          </li>
          <li>
            <code>- punt</code> of <code>• punt</code> = opsomming
          </li>
          <li>
            <code>a | b | c</code> = tabel (eerste regel = kolomkoppen)
          </li>
        </ul>
      </section>
      <Form key={hashKey(JSON.stringify(texts))} action={saveReportTexts} className="space-y-6">
        {GROUPS.map((g) => (
          <section key={g.title} className="card space-y-3">
            <h2>{g.title}</h2>
            {g.fields.map((f) => (
              <label key={f.key} className="block">
                <span className="label">{f.label}</span>
                {f.rows === 0 ? (
                  <input name={f.key} defaultValue={texts[f.key]} placeholder={f.placeholder} className="input max-w-md" />
                ) : (
                  <textarea name={f.key} rows={f.rows ?? 4} defaultValue={texts[f.key]} placeholder={f.placeholder} className="input" />
                )}
                {f.hint && <span className="mt-1 block text-xs text-neutral-500">{f.hint}</span>}
              </label>
            ))}
          </section>
        ))}
        <div className="sticky bottom-0 -mx-1 bg-neutral-50/90 px-1 py-3 backdrop-blur">
          <SubmitButton>Teksten opslaan</SubmitButton>
        </div>
      </Form>
    </>
  );
}
