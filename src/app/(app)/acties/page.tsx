import Link from "next/link";
import type { ActionStatus, Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getLookups, getRequirementOptions } from "@/lib/lookups";
import { formatDate, isOverdue } from "@/lib/format";
import { ACTION_PRIORITY_LABEL, ACTION_SOURCE_LABEL, ACTION_STATUS_CLASS, ACTION_STATUS_LABEL } from "@/lib/labels";
import { Badge, Disclosure, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { createAction } from "./actions";

export const metadata = { title: "Acties" };

type Search = { status?: string; eigenaar?: string; discipline?: string; locatie?: string; q?: string };

export default async function ActionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = sp.status ?? "lopend";

  const statusFilter: Prisma.ActionWhereInput =
    status === "lopend"
      ? { status: { in: ["OPEN", "IN_PROGRESS"] } }
      : status === "verlopen"
        ? { status: { in: ["OPEN", "IN_PROGRESS"] }, deadline: { lt: startOfToday() } }
        : status === "alle"
          ? {}
          : { status: status as ActionStatus };

  const where: Prisma.ActionWhereInput = {
    ...statusFilter,
    ...(sp.eigenaar === "mij" ? { ownerId: user.id } : sp.eigenaar ? { ownerId: sp.eigenaar } : {}),
    ...(sp.discipline ? { disciplineId: sp.discipline } : {}),
    ...(sp.locatie ? { locationId: sp.locatie } : {}),
    ...(sp.q ? { title: { contains: sp.q, mode: "insensitive" } } : {}),
  };

  const [actions, lookups, requirementGroups] = await Promise.all([
    prisma.action.findMany({
      where,
      orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { number: "desc" }],
      include: { owner: { select: { name: true } }, discipline: true, location: true },
      take: 500,
    }),
    getLookups(),
    getRequirementOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Acties en verbeterpunten"
        description="Alle acties uit audits, risico's, afwijkingen, directiebeoordeling en overige bronnen op één plek."
      />

      {can(user.role, "actions.create") && (
        <div className="mb-6">
          <Disclosure summary="Nieuwe actie">
            <ActionForm formAction={createAction} lookups={lookups} requirementGroups={requirementGroups} submitLabel="Actie aanmaken" />
          </Disclosure>
        </div>
      )}

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <Field label="Zoeken">
          <input name="q" defaultValue={sp.q} className="input w-56" />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className="input">
            <option value="lopend">Lopend (open + in uitvoering)</option>
            <option value="verlopen">Deadline verstreken</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In uitvoering</option>
            <option value="DONE">Gereed</option>
            <option value="CANCELLED">Vervallen</option>
            <option value="alle">Alle</option>
          </select>
        </Field>
        <Field label="Eigenaar">
          <Select name="eigenaar" options={[{ value: "mij", label: "Mijn acties" }, ...lookups.users]} defaultValue={sp.eigenaar} placeholder="Iedereen" />
        </Field>
        <Field label="Discipline">
          <Select name="discipline" options={lookups.disciplines} defaultValue={sp.discipline} placeholder="Alle" />
        </Field>
        <Field label="Locatie">
          <Select name="locatie" options={lookups.locations} defaultValue={sp.locatie} placeholder="Alle" />
        </Field>
        <button className="btn-secondary">Filteren</button>
      </form>

      {actions.length === 0 ? (
        <EmptyState>Geen acties gevonden met deze filters.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Actie</th>
                <th>Eigenaar</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Prioriteit</th>
                <th>Discipline / locatie</th>
                <th>Bron</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => {
                const overdue = (a.status === "OPEN" || a.status === "IN_PROGRESS") && isOverdue(a.deadline);
                return (
                  <tr key={a.id}>
                    <td className="tabular-nums text-neutral-500">{a.number}</td>
                    <td>
                      <Link href={`/acties/${a.id}`} className="font-medium">
                        {a.title}
                      </Link>
                    </td>
                    <td>{a.owner?.name ?? <span className="text-brand-red">Geen eigenaar</span>}</td>
                    <td className={`whitespace-nowrap ${overdue ? "font-semibold text-brand-red" : ""}`}>
                      {formatDate(a.deadline)}
                      {overdue && " ⚠"}
                    </td>
                    <td>
                      <Badge className={ACTION_STATUS_CLASS[a.status]}>{ACTION_STATUS_LABEL[a.status]}</Badge>
                    </td>
                    <td className={a.priority === "HIGH" ? "font-semibold text-brand-red-dark" : ""}>{ACTION_PRIORITY_LABEL[a.priority]}</td>
                    <td className="text-xs">
                      {a.discipline?.name ?? "Bedrijfsbreed"}
                      <br />
                      <span className="text-neutral-500">{a.location?.name ?? "Alle locaties"}</span>
                    </td>
                    <td className="text-xs">{ACTION_SOURCE_LABEL[a.source]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
