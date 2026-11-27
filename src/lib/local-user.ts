import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { LOCAL_USER } from "@/lib/env";
import type { Role } from "@prisma/client";

/** Cookie met de gebruiker als wie je meekijkt ("Bekijken als") in de lokale modus. */
export const VIEW_AS_COOKIE = "ims_bekijk_als";

type SessionUser = { id: string; name: string; email: string; role: Role };

/** De lokale gebruiker (QHSE), aangemaakt bij het eerste gebruik. */
export async function getLocalUser() {
  return prisma.user.upsert({
    where: { email: LOCAL_USER.email },
    update: { name: LOCAL_USER.name, active: true },
    create: { email: LOCAL_USER.email, name: LOCAL_USER.name, role: "QHSE" },
  });
}

/** Huidige gebruiker in de lokale modus: de gekozen "Bekijken als"-gebruiker, anders de lokale gebruiker. */
export async function getLocalSessionUser(): Promise<SessionUser> {
  const viewAs = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (viewAs) {
    const u = await prisma.user.findFirst({ where: { id: viewAs, active: true } });
    if (u) return { id: u.id, name: u.name, email: u.email, role: u.role };
  }
  const me = await getLocalUser();
  return { id: me.id, name: me.name, email: me.email, role: me.role };
}
