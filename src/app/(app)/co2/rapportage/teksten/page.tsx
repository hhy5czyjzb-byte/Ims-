import { requirePagePermission } from "@/lib/auth";
import { getReportTexts, type ReportTexts } from "@/lib/co2-report";
import { PageHeader } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Co2Nav } from "@/components/co2-nav";
import { saveReportTexts } from "../actions";

export const metadata = { title: "Teksten CO2-jaarverslag" };

type Field = { key: keyof ReportTexts; label: string; rows?: number; hint?: string; placeholder?: string };
const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: "Management statement & organisatie",
    fields: [
      { key: "statement", label: "Management statement & energiebeleid", rows: 8 },
      { key: "statementDate", label: "Datum ondertekening", rows: 0, placeholder: "bijv. 21-10-2026" },
      { key: "statementName", label: "Naam (directie)", rows: 0 },
      { key: "organisation", label: "Organisatiebeschrijving", rows: 6 },
      { key: "boundary", label: "Organisatiegrens (methode en entiteiten)", rows: 8 },
      { key: "projects", label: "CO2-prestatieladder projecten met gunningvoordeel", rows: 3 },
    ],
  },
  {
    title: "Invalshoek A — CO2-uitstoot en energieverbruik",
    fields: [
      { key: "nonCo2", label: "Niet-CO2-broeikasgassen", rows: 3 },
      {
        key: "conclusions",
        label: "Conclusies, aanbevelingen en genomen maatregelen",
        rows: 8,
        hint: "De cijfers en de teksten bij het brandstofgebruik rekent de app zelf uit.",
      },
      { key: "flexibility", label: "Flexibiliteit van het energiesysteem", rows: 5 },
    ],
  },
  {
    title: "Invalshoek B — Doelstellingen en voortgang",
    fields: [
      {
        key: "strategy",
        label: "Strategie (korte termijn)",
        rows: 6,
        hint: "De doelstelling, subdoelstellingen per scope en de grootste maatregelen komen uit het plan van aanpak.",
      },
      {
        key: "energyGoals",
        label: "Subdoelstellingen energie",
        rows: 4,
        hint: "Eén per regel: onderwerp | doel",
        placeholder: "Zelf energie opwekken | Onderzoeken of er meer zonnepanelen geplaatst kunnen worden.",
      },
      { key: "justification", label: "Verantwoording doelstellingen", rows: 4 },
      {
        key: "peers",
        label: "Vergelijking met sectorgenoten",
        rows: 4,
        hint: "Eén organisatie per regel: naam | trede/niveau | basisjaar | intensiteit basisjaar | laatst bekende intensiteit | voortgang | korte termijn doelstelling (de eerste kolom blijft leeg).",
        placeholder: " | Rouwmaat Groep | Trede 1 | 2025 | 22,05 t/FTE | 22,05 t/FTE | basisjaar | 21% reductie in 2028 t.o.v. 2025 per FTE",
      },
      { key: "peersText", label: "Toelichting vergelijking", rows: 4 },
    ],
  },
  {
    title: "Invalshoek C — Communicatie",
    fields: [
      {
        key: "keyPersons",
        label: "Sleutelpersonen",
        rows: 6,
        hint: "Eén per regel: rol | naam | taak | CO2-bewustzijn",
        placeholder: "Projectleider | … | Coördinatie en beheer van het programma | Niveau 4: verantwoordelijk voelen",
      },
      { key: "communication", label: "Communicatieplan (doelgroepen, boodschap, doel)", rows: 6 },
      {
        key: "channels",
        label: "Communicatiemiddelen",
        rows: 4,
        hint: "Eén per regel: middel | planning | verantwoordelijke | toelichting",
        placeholder: "Eigen website | Jaarlijks in oktober | … | Resultaten en voortgang",
      },
    ],
  },
  {
    title: "Invalshoek D — Samenwerking",
    fields: [
      { key: "collaboration", label: "Kennis- en samenwerkingsbehoeftes", rows: 8 },
      { key: "partners", label: "Samenwerkingsverbanden", rows: 4, hint: "Eén per regel." },
    ],
  },
];

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
      <Form action={saveReportTexts} className="space-y-6">
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
