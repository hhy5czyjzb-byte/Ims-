"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { localMode } from "@/lib/env";
import { VIEW_AS_COOKIE } from "@/lib/local-user";

/** "Bekijken als" (alleen lokale modus): meekijken met de rechten van een andere (test)gebruiker. Leeg = jezelf. */
export async function setViewAs(userId: string): Promise<void> {
  if (!localMode) throw new Error("Alleen beschikbaar in de lokale modus.");
  const store = await cookies();
  if (!userId) {
    store.delete(VIEW_AS_COOKIE);
  } else {
    const user = await prisma.user.findFirst({ where: { id: userId, active: true }, select: { id: true } });
    if (!user) throw new Error("Gebruiker niet gevonden.");
    store.set(VIEW_AS_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  }
  revalidatePath("/", "layout");
}
