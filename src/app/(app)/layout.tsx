import { Sidebar } from "@/components/sidebar";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/labels";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: user.name, roleLabel: ROLE_LABEL[user.role] }} />
      <main className="min-w-0 flex-1 px-8 py-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
