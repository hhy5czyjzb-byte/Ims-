import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getSignificanceRule } from "@/lib/aspect-settings";
import { describeSignificanceRule } from "@/lib/aspects";
import { PageHeader } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { AspectNav } from "@/components/aspect-nav";
import { setSignificanceRule } from "../actions";

export const metadata = { title: "Significantie milieuaspecten" };

export default async function SignificancePage() {
  const user = await requireUser();
  const canEdit = can(user.role, "aspects.edit");
  const rule = await getSignificanceRule();
  const [significant, total] = await Promise.all([
    prisma.environmentalAspect.count({ where: { active: true, inOperation: true, significant: true } }),
    prisma.environmentalAspect.count({ where: { active: true, inOperation: true } }),
  ]);
  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/milieuaspecten", label: "Milieuaspecten" }]}
        title="Wanneer is een aspect significant?"
        description="ISO 14001 §6.1.2 vraagt vast te leggen welke criteria je gebruikt om significante milieuaspecten te bepalen. Hier stel je die criteria in; de app past ze op alle aspecten toe."
      />
      <AspectNav />
      <section className="card mb-6 max-w-3xl text-sm">
        <p>
          Nu: significant bij <strong>{describeSignificanceRule(rule)}</strong>. Dat geldt voor <strong>{significant}</strong> van de {total} aspecten op
          locaties die in werking zijn (<Link href="/milieuaspecten?significant=ja&werking=ja">bekijken</Link>).
        </p>
        <p className="mt-2 text-neutral-600">
          Per aspect bepaal je de prio (H/M/L) in het aspect zelf: open een aspect → &ldquo;Aspect wijzigen, beoordelen of koppelen&rdquo; → Prio.
        </p>
      </section>
      {canEdit ? (
        <section className="card max-w-3xl">
          <Form key={JSON.stringify(rule)} action={setSignificanceRule} className="space-y-3 text-sm">
            <p className="text-xs text-neutral-600">
              Een aspect is significant als het aan minstens één aangevinkt criterium voldoet. Standaard: prio H, risico hoog of hoger, of een wettelijke eis
              (wetgeving is altijd significant). Bij opslaan wordt de significantie van alle aspecten opnieuw bepaald.
            </p>
            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <legend className="mb-1 text-xs font-medium text-neutral-700">Prio (eigen weging)</legend>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="prioHigh" defaultChecked={rule.priorities.includes("HIGH")} /> H · hoog
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="prioMedium" defaultChecked={rule.priorities.includes("MEDIUM")} /> M · middel
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="prioLow" defaultChecked={rule.priorities.includes("LOW")} /> L · laag
              </label>
            </fieldset>
            <label className="block max-w-xs">
              <span className="mb-1 block text-xs font-medium text-neutral-700">Óók significant bij risiconiveau (E × B × W)</span>
              <select name="minRiskLevel" defaultValue={rule.minRiskLevel ?? ""} className="input">
                <option value="">— niet (alleen de prio telt) —</option>
                <option value="medium">Middel of hoger (&gt; 20)</option>
                <option value="high">Hoog of hoger (&gt; 70)</option>
                <option value="veryHigh">Zeer hoog (&gt; 200)</option>
              </select>
            </label>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="legal" defaultChecked={rule.legal} /> Óók bij een wettelijke eis (kolom &ldquo;Wettelijke eis&rdquo; = ja)
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="complaints" defaultChecked={rule.complaints} /> Óók bij klachten
              </label>
            </div>
            <SubmitButton variant="secondary">Opslaan en opnieuw bepalen</SubmitButton>
          </Form>
        </section>
      ) : (
        <p className="text-sm text-neutral-500">Alleen QHSE kan de criteria wijzigen.</p>
      )}
    </>
  );
}
