import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { ImportWizard } from "@/components/import-wizard";
import { CO2_IMPORT_FIELDS } from "@/lib/co2-import";
import { importConsumptions } from "../actions";

export const metadata = { title: "Verbruik importeren" };

export default async function Co2ImportPage() {
  const user = await requireUser();
  if (!can(user.role, "co2.manage")) {
    return (
      <div className="card max-w-xl">
        <h2>Geen toegang</h2>
        <p className="mt-2 text-sm text-neutral-600">Alleen QHSE kan verbruik importeren.</p>
      </div>
    );
  }
  const carriers = await prisma.energyCarrier.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { name: true, unit: true, aliases: true },
  });
  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/co2", label: "CO2" }]}
        title="Verbruik importeren uit Excel"
        description={
          <>
            Lees bestaand verbruik in (bijv. tankpasoverzichten, energiefacturen of je eigen CO2-opzet). Elke regel = één energiedrager met een hoeveelheid over
            een periode. De energiedrager wordt herkend op naam of alias (
            {carriers.length ? carriers.map((c) => `${c.name} (${c.unit})`).join(", ") : "nog geen energiedragers"}).{" "}
            <Link href="/co2/factoren">Energiedragers en aliassen beheren →</Link>
          </>
        }
      />
      <ImportWizard
        fields={CO2_IMPORT_FIELDS}
        importAction={importConsumptions}
        registerHref="/co2/verbruik"
        matchHint="Herkend op kenmerk (zonder kenmerk wordt elke regel nieuw toegevoegd)."
      />
    </>
  );
}
