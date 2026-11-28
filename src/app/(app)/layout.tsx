import { Sidebar } from "@/components/sidebar";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LOCAL_USER, localMode } from "@/lib/env";
import { ROLE_LABEL } from "@/lib/labels";
import { brand } from "@/theme/brand";
import { PrintDate } from "@/components/print-date";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Lokale modus: keuzelijst "Bekijken als" om met de rechten van een andere rol mee te kijken.
  const viewAs = localMode
    ? {
        currentId: user.id,
        users: (
          await prisma.user.findMany({
            where: { active: true },
            orderBy: [{ role: "asc" }, { name: "asc" }],
            select: { id: true, name: true, role: true, email: true },
          })
        ).map((u) => ({
          id: u.email === LOCAL_USER.email ? "" : u.id,
          label: `${u.name} (${ROLE_LABEL[u.role]})${u.email === LOCAL_USER.email ? " — jijzelf" : ""}`,
          isSelf: u.email === LOCAL_USER.email,
          realId: u.id,
        })),
      }
    : null;
  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: user.name, roleLabel: ROLE_LABEL[user.role] }} viewAs={viewAs} />
      <main className="min-w-0 flex-1 px-8 py-6" data-user-name={user.name}>
        <div className="mx-auto max-w-7xl">
          {/* Alleen bij afdrukken / PDF: logo en kenmerk bovenaan, zodat elke uitdraai herkenbaar van Rouwmaat Groep is. */}
          <div className="print-header hidden print:flex" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.logo.color} alt="Rouwmaat Groep" className="h-[12mm] w-auto" />
            <div className="text-right text-[8pt] leading-tight text-neutral-500">
              <div>Integraal managementsysteem</div>
              <div>
                Uitgedraaid op <PrintDate /> door {user.name}
              </div>
            </div>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
