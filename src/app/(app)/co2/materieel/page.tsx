import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { EURO_CLASSES, FUEL_TYPES, VEHICLE_TYPES, euroLabel, fuelLabel, vehicleLabel } from "@/lib/fleet";
import { formatDate } from "@/lib/format";
import { Badge, Disclosure, EmptyState, Field, PageHeader } from "@/components/ui";
import { Co2Nav } from "@/components/co2-nav";
import { VehicleForm } from "@/components/vehicle-form";
import { createVehicle } from "../wagenpark/actions";
import { Filters } from "@/components/mobile-filters";

export const metadata = { title: "Voertuigen en materieel" };

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ soort?: string; brandstof?: string; klasse?: string; status?: string; q?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const canManage = can(user.role, "co2.manage");
  const where: Prisma.EquipmentWhereInput[] = [];
  if (sp.soort) where.push({ vehicleType: sp.soort === "geen" ? null : sp.soort });
  if (sp.brandstof) where.push({ fuelType: sp.brandstof === "geen" ? null : sp.brandstof });
  if (sp.klasse) where.push({ euroClass: sp.klasse === "geen" ? null : sp.klasse });
  if (sp.status === "actief") where.push({ active: true });
  if (sp.status === "uit") where.push({ active: false });
  if (sp.q)
    where.push({
      OR: [
        { name: { contains: sp.q, mode: "insensitive" } },
        { code: { contains: sp.q, mode: "insensitive" } },
        { brand: { contains: sp.q, mode: "insensitive" } },
      ],
    });
  const [equipment, total, carriers, lookups] = await Promise.all([
    prisma.equipment.findMany({
      where: { AND: where },
      orderBy: [{ active: "desc" }, { vehicleType: "asc" }, { name: "asc" }],
      include: { defaultCarrier: true, discipline: true, location: true, _count: { select: { consumptions: true } } },
      take: 1000,
    }),
    prisma.equipment.count(),
    prisma.energyCarrier.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getLookups(),
  ]);
  const missing = equipment.filter((e) => e.vehicleType && (!e.fuelType || !e.euroClass)).length;
  const opt = (list: readonly { key: string; label: string }[], label = (k: string) => list.find((x) => x.key === k)!.label) => [
    ...list.map((x) => (
      <option key={x.key} value={x.key}>
        {label(x.key)}
      </option>
    )),
    <option key="geen" value="geen">
      (niet ingevuld)
    </option>,
  ];

  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description="Voertuigen en materieel: kenteken, soort, brandstof, Euroklasse en in/uit dienst. Hieruit berekent de wagenparkpagina per jaar de brandstoftypes en de milieuclassificatie; verbruik kan per voertuig worden vastgelegd."
      />
      <Co2Nav />
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/co2/wagenpark" className="btn-secondary">
          Naar wagenpark (grafieken)
        </Link>
        {canManage && (
          <Link href="/co2/materieel/import" className="btn-secondary">
            Voertuigenlijst inlezen uit Excel
          </Link>
        )}
        {missing > 0 && (
          <Badge className="bg-amber-100 text-amber-900">{missing} voertuig(en) zonder brandstof of Euroklasse — tellen als &lsquo;onbekend&rsquo;</Badge>
        )}
      </div>
      {canManage && (
        <div className="mb-6">
          <Disclosure summary="Voertuig of materieel toevoegen">
            <VehicleForm
              formAction={createVehicle}
              lookups={{ carriers: carriers.map((c) => ({ value: c.id, label: c.name })), disciplines: lookups.disciplines, locations: lookups.locations }}
              submitLabel="Toevoegen"
            />
          </Disclosure>
        </div>
      )}
      <Filters>
        <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
          <Field label="Zoeken">
            <input name="q" defaultValue={sp.q} className="input w-48" placeholder="kenteken, naam, merk" />
          </Field>
          <Field label="Soort">
            <select name="soort" defaultValue={sp.soort ?? ""} className="input">
              <option value="">Alle</option>
              {opt(VEHICLE_TYPES)}
            </select>
          </Field>
          <Field label="Brandstof">
            <select name="brandstof" defaultValue={sp.brandstof ?? ""} className="input">
              <option value="">Alle</option>
              {opt(FUEL_TYPES)}
            </select>
          </Field>
          <Field label="Euroklasse">
            <select name="klasse" defaultValue={sp.klasse ?? ""} className="input">
              <option value="">Alle</option>
              {opt(EURO_CLASSES, euroLabel)}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={sp.status ?? ""} className="input">
              <option value="">Alle</option>
              <option value="actief">In gebruik</option>
              <option value="uit">Buiten gebruik</option>
            </select>
          </Field>
          <button className="btn-secondary">Filteren</button>
        </form>
      </Filters>
      {equipment.length === 0 ? (
        <EmptyState>
          {total ? "Geen voertuigen gevonden met deze filters." : "Nog geen voertuigen of materieel vastgelegd. Voeg ze toe of lees een voertuigenlijst in."}
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <p className="px-4 pt-3 text-xs text-neutral-500">
            {equipment.length} van {total}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Kenteken / nr.</th>
                <th>Voertuig / materieel</th>
                <th>Soort</th>
                <th>Brandstof</th>
                <th>Euroklasse</th>
                <th>Bouwjaar</th>
                <th>In / uit dienst</th>
                <th>Bedrijfsonderdeel</th>
                <th className="text-center">Verbruik</th>
              </tr>
            </thead>
            <tbody>
              {equipment.map((e) => (
                <tr key={e.id} className={e.active ? "" : "opacity-50"}>
                  <td className="font-mono text-xs whitespace-nowrap">
                    <Link href={`/co2/materieel/${e.id}`}>{e.code ?? "—"}</Link>
                  </td>
                  <td>
                    <Link href={`/co2/materieel/${e.id}`} className="font-medium">
                      {e.name}
                    </Link>
                    {(e.brand || e.model) && e.name !== [e.brand, e.model].filter(Boolean).join(" ") && (
                      <span className="ml-1 text-xs text-neutral-500">{[e.brand, e.model].filter(Boolean).join(" ")}</span>
                    )}
                    {!e.active && <Badge className="ml-1 bg-neutral-200">Buiten gebruik</Badge>}
                  </td>
                  <td>{e.vehicleType ? vehicleLabel(e.vehicleType) : <span className="text-neutral-400">{e.type ?? "—"}</span>}</td>
                  <td>{e.fuelType ? fuelLabel(e.fuelType) : e.vehicleType ? <span className="text-amber-700">?</span> : "—"}</td>
                  <td>{e.euroClass ? euroLabel(e.euroClass) : e.vehicleType ? <span className="text-amber-700">?</span> : "—"}</td>
                  <td className="tabular-nums">{e.buildYear ?? "—"}</td>
                  <td className="text-xs whitespace-nowrap">
                    {e.inServiceFrom ? formatDate(e.inServiceFrom) : "—"} – {e.inServiceUntil ? formatDate(e.inServiceUntil) : ""}
                  </td>
                  <td className="text-xs">{e.discipline?.name ?? "Bedrijfsbreed"}</td>
                  <td className="text-center tabular-nums">{e._count.consumptions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
