"use server";

import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getGraphAccessToken, requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { env, sharePointConfigured } from "@/lib/env";
import { listLibraryFiles, mapFields } from "@/lib/graph";
import { optionalDate, optionalText, parseForm, requiredText } from "@/lib/forms";

/**
 * Handmatige registratie (fase 1, zolang de Graph-koppeling nog niet actief is).
 * Er wordt alleen een verwijzing opgeslagen — nooit het bestand zelf.
 */
const manualSchema = z.object({
  title: requiredText(300),
  documentNumber: optionalText,
  webUrl: z.url({ protocol: /^https$/, error: "Gebruik een https-link naar SharePoint" }),
  status: optionalText,
  version: optionalText,
  ownerName: optionalText,
  revisionDate: optionalDate,
});

export async function createManualDocument(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("documents.edit");
    const data = parseForm(manualSchema, formData);
    const doc = await prisma.document.create({ data });
    await logAudit({ user, action: "CREATE", entityType: "Document", entityId: doc.id, summary: `Document "${doc.title}" geregistreerd` });
    revalidatePath("/documenten");
    redirect(`/documenten/${doc.id}`);
  });
}

export async function updateManualDocument(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("documents.edit");
    const existing = await prisma.document.findUnique({ where: { id } });
    if (!existing) throw new UserError("Document niet gevonden.");
    if (existing.sharePointItemId) throw new UserError("Metadata van gesynchroniseerde documenten wijzig je in SharePoint.");
    const data = parseForm(manualSchema, formData);
    await prisma.document.update({ where: { id }, data });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Document",
      entityId: id,
      summary: `Document "${data.title}" gewijzigd`,
      details: { ...data, revisionDate: data.revisionDate?.toISOString() ?? null },
    });
    revalidatePath("/documenten");
    revalidatePath(`/documenten/${id}`);
  });
}

export async function deleteDocument(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("documents.edit");
    const doc = await prisma.document.delete({ where: { id } });
    await logAudit({
      user,
      action: "DELETE",
      entityType: "Document",
      entityId: id,
      summary: `Documentverwijzing "${doc.title}" verwijderd (bestand in SharePoint blijft bestaan)`,
    });
    revalidatePath("/documenten");
    redirect("/documenten");
  });
}

const linksSchema = z.object({
  requirementIds: z.array(z.string().min(1)).max(2000),
  processIds: z.array(z.string().min(1)).max(500),
  stepIds: z.array(z.string().min(1)).max(2000),
});

export async function setDocumentLinks(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("documents.edit");
    const { requirementIds, processIds, stepIds } = parseForm(linksSchema, formData, ["requirementIds", "processIds", "stepIds"]);
    await prisma.document.update({
      where: { id },
      data: {
        requirements: { set: requirementIds.map((r) => ({ id: r })) },
        processes: { set: processIds.map((p) => ({ id: p })) },
        processSteps: { set: stepIds.map((s) => ({ id: s })) },
      },
    });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Document",
      entityId: id,
      summary: "Koppelingen gewijzigd",
      details: { requirementIds, processIds, stepIds },
    });
    revalidatePath(`/documenten/${id}`);
    revalidatePath("/normen", "layout");
    revalidatePath("/processen", "layout");
  });
}

/**
 * Synchroniseer de SharePoint-bibliotheek "IMS-documenten" via Microsoft Graph,
 * met het token (en dus de rechten) van de ingelogde QHSE-gebruiker.
 */
export async function syncSharePoint(): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("documents.edit");
    if (!sharePointConfigured) throw new UserError("SharePoint is nog niet geconfigureerd (SHAREPOINT_DRIVE_ID in .env).");
    const token = await getGraphAccessToken();
    if (!token) throw new UserError("Geen geldig Microsoft 365-token. Log opnieuw in met Microsoft 365.");

    const files = await listLibraryFiles(token, env.sharePoint.driveId);
    const seen: string[] = [];
    let created = 0;
    let updated = 0;
    for (const f of files) {
      const meta = mapFields(f.listItem?.fields);
      const data = {
        title: meta.title || f.name.replace(/\.[^.]+$/, ""),
        documentNumber: meta.documentNumber ?? null,
        sharePointDriveId: f.parentReference?.driveId ?? env.sharePoint.driveId,
        webUrl: f.webUrl,
        fileType: f.name.includes(".") ? f.name.split(".").pop()!.toLowerCase() : null,
        status: meta.status ?? null,
        version: meta.version ?? null,
        ownerName: meta.ownerName ?? null,
        revisionDate: meta.revisionDate ?? null,
        lastModifiedAt: f.lastModifiedDateTime ? new Date(f.lastModifiedDateTime) : null,
        lastSyncedAt: new Date(),
        removedInSource: false,
      };
      const existing = await prisma.document.findUnique({ where: { sharePointItemId: f.id }, select: { id: true } });
      if (existing) {
        await prisma.document.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.document.create({ data: { ...data, sharePointItemId: f.id } });
        created++;
      }
      seen.push(f.id);
    }
    // Documenten die niet meer in SharePoint staan: markeren, niet verwijderen (koppelingen blijven zichtbaar).
    const removed = await prisma.document.updateMany({
      where: { sharePointItemId: { not: null, notIn: seen } },
      data: { removedInSource: true },
    });

    await logAudit({
      user,
      action: "SYNC",
      entityType: "Document",
      summary: `SharePoint-sync: ${created} nieuw, ${updated} bijgewerkt, ${removed.count} niet meer gevonden`,
    });
    revalidatePath("/documenten");
    redirect(`/documenten?sync=${created}-${updated}-${removed.count}`);
  });
}
