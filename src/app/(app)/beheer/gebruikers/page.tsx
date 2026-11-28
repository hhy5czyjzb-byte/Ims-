import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import { Badge, PageHeader } from "@/components/ui";
import { BeheerNav } from "../beheer-nav";

export const metadata = { title: "Gebruikers" };

export default async function UsersPage() {
  await requireUser();
  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    include: { jobFunction: true, _count: { select: { ownedActions: true } } },
  });
  return (
    <>
      <PageHeader
        title="Stamgegevens"
        description="De rol (QHSE, middenkader, directie) komt uit Microsoft 365 en wordt bij elke login overgenomen. Naam, functie en actief/niet actief kun je hier aanpassen."
      />
      <BeheerNav active="/beheer/gebruikers" />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Naam</th>
              <th>E-mail</th>
              <th>Rol</th>
              <th>Functie</th>
              <th className="text-right">Acties (eigenaar)</th>
              <th>Laatste login</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "text-neutral-400"}>
                <td>
                  <Link href={`/beheer/gebruikers/${u.id}`} className="font-medium">
                    {u.name}
                  </Link>
                  {!u.active && <Badge className="ml-2 bg-neutral-100 text-neutral-500">niet actief</Badge>}
                </td>
                <td className="text-neutral-600">{u.email}</td>
                <td>
                  <Badge className={u.role === "QHSE" ? "bg-brand-red text-white" : u.role === "DIRECTIE" ? "bg-neutral-800 text-white" : undefined}>
                    {ROLE_LABEL[u.role]}
                  </Badge>
                </td>
                <td>{u.jobFunction?.name ?? "—"}</td>
                <td className="text-right tabular-nums">
                  {u._count.ownedActions > 0 ? <Link href={`/acties?eigenaar=${u.id}`}>{u._count.ownedActions}</Link> : 0}
                </td>
                <td className="text-neutral-600">{formatDateTime(u.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
