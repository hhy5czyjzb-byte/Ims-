"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ActionPriority, AuditStatus, ComplianceStatus, type Prisma } from "@prisma/client";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { optionalDate, optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";
import { AUDIT_STATUS_LABEL } from "@/lib/labels";
import { canFillLocationAudit, completionProblems, locationAuditCode, questionKey } from "@/lib/location-audit";
import { parseStatus } from "@/lib/legal-import";
import { stripLeadingSymbols, type ImportResult, type ImportRow } from "@/lib/spreadsheet-import";

const BASE = "/wetgeving/vestigingen";

function revalidateAll(auditId?: string) {
  revalidatePath(BASE);
  if (auditId) revalidatePath(`${BASE}/${auditId}`);
  revalidatePath("/wetgeving");
  revalidatePath("/beheer");
  revalidatePath("/");
}

const requiredDate = z
  .string()
  .trim()
  .min(1, "Datum is verplicht")
  .transform((v, ctx) => {
    const d = new Date(`${v}T00:00:00Z`);
    if (isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Ongeldige datum" });
      return z.NEVER;
    }
    return d;
  });

// ── Vragenbank ────────────────────────────────────────────────

const questionSchema = z.object({
  question: requiredText(1000),
  evidenceHint: optionalText,
  theme: optionalText,
  legalRequirementId: optionalId,
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
});

async function themeFor(legalRequirementId: string | null | undefined, theme: string | null | undefined) {
  if (theme) return theme;
  if (!legalRequirementId) return null;
  const req = await prisma.legalRequirement.findUnique({ where: { id: legalRequirementId }, select: { theme: true } });
  return req?.theme ?? null;
}

export async function createQuestion(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("legal.edit");
    const data = parseForm(questionSchema, formData);
    const sortOrder = data.sortOrder || ((await prisma.complianceQuestion.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 10;
    const q = await prisma.complianceQuestion.create({ data: { ...data, sortOrder, theme: await themeFor(data.legalRequirementId, data.theme) } });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "ComplianceQuestion",
      entityId: q.id,
      summary: `Auditvraag toegevoegd: "${q.question.slice(0, 80)}"`,
    });
    revalidatePath(`${BASE}/vragen`);
  });
}

export async function updateQuestion(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("legal.edit");
    const data = parseForm(questionSchema.extend({ active: z.literal("on").optional() }), formData);
    const { active, ...rest } = data;
    await prisma.complianceQuestion.update({
      where: { id },
      data: { ...rest, active: active === "on", theme: await themeFor(rest.legalRequirementId, rest.theme) },
    });
    await logAudit({ user, action: "UPDATE", entityType: "ComplianceQuestion", entityId: id, summary: "Auditvraag gewijzigd" });
    revalidatePath(`${BASE}/vragen`);
  });
}

export async function deleteQuestion(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("legal.edit");
    const used = await prisma.locationAuditAnswer.count({ where: { questionId: id } });
    if (used) throw new UserError(`Deze vraag is al in ${used} audit(s) gebruikt. Zet hem op 'niet actief' in plaats van verwijderen.`);
    await prisma.complianceQuestion.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "ComplianceQuestion", entityId: id, summary: "Auditvraag verwijderd" });
    revalidatePath(`${BASE}/vragen`);
  });
}

// ── Audits ────────────────────────────────────────────────────

const auditSchema = z.object({
  date: requiredDate,
  auditorId: optionalId,
  auditorText: optionalText,
  notes: optionalText,
});

async function activeQuestions() {
  return prisma.complianceQuestion.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

function answerData(q: Awaited<ReturnType<typeof activeQuestions>>[number]) {
  return {
    questionId: q.id,
    legalRequirementId: q.legalRequirementId,
    questionText: q.question,
    evidenceHint: q.evidenceHint,
    theme: q.theme,
    sortOrder: q.sortOrder,
  };
}

export async function createLocationAudit(formData: FormData): Promise<ActionResult> {
  let newId = "";
  const result = await safeAction(async () => {
    const user = await requirePermission("legal.edit");
    const data = parseForm(auditSchema.extend({ locationId: z.string().min(1, "Kies een vestiging") }), formData);
    const questions = await activeQuestions();
    if (!questions.length) throw new UserError("Er staan nog geen actieve auditvragen in de vragenbank.");
    const audit = await prisma.locationAudit.create({
      data: { ...data, createdById: user.id, answers: { create: questions.map(answerData) } },
      include: { location: { select: { name: true } } },
    });
    newId = audit.id;
    await logAudit({
      user,
      action: "CREATE",
      entityType: "LocationAudit",
      entityId: audit.id,
      summary: `${locationAuditCode(audit.number)} gepland voor ${audit.location.name} (${questions.length} vragen)`,
    });
    revalidateAll();
  });
  if (result?.error) return result;
  redirect(`${BASE}/${newId}`);
}

export async function createAuditsForAllLocations(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("legal.edit");
    const data = parseForm(auditSchema.pick({ date: true, auditorId: true, auditorText: true }), formData);
    const questions = await activeQuestions();
    if (!questions.length) throw new UserError("Er staan nog geen actieve auditvragen in de vragenbank.");
    const locations = await prisma.location.findMany({ where: { active: true } });
    // Vestigingen met een lopende (geplande of gestarte) audit slaan we over.
    const busy = new Set(
      (await prisma.locationAudit.findMany({ where: { status: { in: ["PLANNED", "IN_PROGRESS"] } }, select: { locationId: true } })).map((a) => a.locationId),
    );
    const todo = locations.filter((l) => !busy.has(l.id));
    if (!todo.length) throw new UserError("Alle actieve vestigingen hebben al een geplande of lopende audit.");
    for (const l of todo) {
      await prisma.locationAudit.create({ data: { ...data, locationId: l.id, createdById: user.id, answers: { create: questions.map(answerData) } } });
    }
    await logAudit({ user, action: "CREATE", entityType: "LocationAudit", summary: `Compliance-audit gepland voor ${todo.length} vestiging(en)` });
    revalidateAll();
  });
}

async function loadAudit(id: string) {
  const audit = await prisma.locationAudit.findUnique({ where: { id } });
  if (!audit) throw new UserError("Audit niet gevonden.");
  return audit;
}

export async function updateLocationAudit(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("legal.edit");
    const audit = await loadAudit(id);
    const data = parseForm(auditSchema, formData);
    await prisma.locationAudit.update({ where: { id }, data });
    await logAudit({ user, action: "UPDATE", entityType: "LocationAudit", entityId: id, summary: `${locationAuditCode(audit.number)} gewijzigd` });
    revalidateAll(id);
  });
}

export async function setLocationAuditStatus(id: string, status: AuditStatus): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const audit = await prisma.locationAudit.findUnique({ where: { id }, include: { answers: { include: { _count: { select: { actions: true } } } } } });
    if (!audit) throw new UserError("Audit niet gevonden.");
    const isQhse = can(user.role, "legal.edit");
    const isAuditor = audit.auditorId === user.id;
    // Auditor mag starten en afronden; heropenen, annuleren en terugzetten alleen QHSE.
    const allowed =
      isQhse || (isAuditor && audit.status !== "COMPLETED" && audit.status !== "CANCELLED" && (status === "IN_PROGRESS" || status === "COMPLETED"));
    if (!allowed) throw new UserError("Je hebt geen rechten voor deze handeling.");
    if (status === "COMPLETED") {
      const problems = completionProblems(audit.answers.map((a) => ({ verdict: a.verdict, actionCount: a._count.actions })));
      if (problems.length) throw new UserError(`Afronden kan nog niet: ${problems.join(" ")}`);
    }
    await prisma.locationAudit.update({ where: { id }, data: { status } });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "LocationAudit",
      entityId: id,
      summary: `${locationAuditCode(audit.number)}: status ${AUDIT_STATUS_LABEL[status].toLowerCase()}`,
    });
    revalidateAll(id);
  });
}

export async function syncQuestions(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("legal.edit");
    const audit = await prisma.locationAudit.findUnique({ where: { id }, include: { answers: { select: { questionId: true } } } });
    if (!audit) throw new UserError("Audit niet gevonden.");
    if (audit.status === "COMPLETED" || audit.status === "CANCELLED") throw new UserError("Deze audit is afgesloten.");
    const have = new Set(audit.answers.map((a) => a.questionId));
    const missing = (await activeQuestions()).filter((q) => !have.has(q.id));
    if (!missing.length) throw new UserError("Alle actieve vragen staan al op de checklist.");
    await prisma.locationAuditAnswer.createMany({ data: missing.map((q) => ({ ...answerData(q), auditId: id })) });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "LocationAudit",
      entityId: id,
      summary: `${missing.length} nieuwe vraag/vragen toegevoegd aan ${locationAuditCode(audit.number)}`,
    });
    revalidateAll(id);
  });
}

export async function saveAnswers(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser();
    const audit = await prisma.locationAudit.findUnique({ where: { id }, include: { answers: true } });
    if (!audit) throw new UserError("Audit niet gevonden.");
    if (!canFillLocationAudit(user, audit)) throw new UserError("Je kunt deze checklist niet (meer) invullen.");
    const verdictEnum = z.enum(ComplianceStatus);
    const updates: Prisma.PrismaPromise<unknown>[] = [];
    for (const a of audit.answers) {
      const raw = formData.get(`verdict_${a.id}`);
      if (raw === null) continue;
      const verdict = verdictEnum.parse(String(raw));
      const f = String(formData.get(`finding_${a.id}`) ?? "")
        .trim()
        .slice(0, 5000);
      const finding = f === "" ? null : f;
      if (verdict !== a.verdict || finding !== a.finding) updates.push(prisma.locationAuditAnswer.update({ where: { id: a.id }, data: { verdict, finding } }));
    }
    if (updates.length && audit.status === "PLANNED") updates.push(prisma.locationAudit.update({ where: { id }, data: { status: "IN_PROGRESS" } }));
    else if (updates.length) updates.push(prisma.locationAudit.update({ where: { id }, data: { updatedAt: new Date() } }));
    if (updates.length) await prisma.$transaction(updates);
    await logAudit({ user, action: "UPDATE", entityType: "LocationAudit", entityId: id, summary: `${locationAuditCode(audit.number)}: checklist ingevuld` });
    revalidateAll(id);
  });
}

export async function deleteLocationAudit(id: string): Promise<ActionResult> {
  const result = await safeAction(async () => {
    const user = await requirePermission("legal.edit");
    const audit = await loadAudit(id);
    await prisma.locationAudit.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "LocationAudit", entityId: id, summary: `${locationAuditCode(audit.number)} verwijderd` });
    revalidateAll();
  });
  if (result?.error) return result;
  redirect(BASE);
}

const actionSchema = z.object({
  answerId: z.string().min(1, "Kies de vraag waar de actie bij hoort"),
  title: requiredText(300),
  description: optionalText,
  ownerId: optionalId,
  deadline: optionalDate,
  priority: z.enum(ActionPriority).default("MEDIUM"),
});

export async function createLocationAuditAction(auditId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("actions.create");
    const audit = await loadAudit(auditId);
    if (!can(user.role, "legal.edit") && audit.auditorId !== user.id) throw new UserError("Alleen QHSE of de auditor kan hier acties aanmaken.");
    const { answerId, ...data } = parseForm(actionSchema, formData);
    const answer = await prisma.locationAuditAnswer.findFirst({ where: { id: answerId, auditId } });
    if (!answer) throw new UserError("Vraag niet gevonden.");
    const action = await prisma.action.create({
      data: {
        ...data,
        source: "LOCATION_AUDIT",
        locationAuditAnswerId: answer.id,
        legalRequirementId: answer.legalRequirementId,
        locationId: audit.locationId,
        createdById: user.id,
      },
    });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Action",
      entityId: action.id,
      summary: `Actie #${action.number} aangemaakt vanuit ${locationAuditCode(audit.number)}`,
    });
    revalidateAll(auditId);
    revalidatePath("/acties");
  });
}

// ── Import (tabblad Compliance-audit) ─────────────────────────

const importRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  location: z.string().trim().max(200).optional(),
  legalRef: z.string().trim().max(100).optional(),
  obligation: z.string().trim().max(500).optional(),
  theme: z.string().trim().max(200).optional(),
  question: z.string().trim().min(1).max(1000),
  evidenceHint: z.string().trim().max(1000).optional(),
  verdict: z.string().trim().max(100).optional(),
  finding: z.string().trim().max(5000).optional(),
  action: z.string().trim().max(2000).optional(),
  actionOwner: z.string().trim().max(200).optional(),
  actionDue: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  auditDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  auditor: z.string().trim().max(200).optional(),
});

/**
 * Importeert de auditvragen (uniek op nr. wettelijke eis + vraagtekst; de regels per vestiging zijn dezelfde vragen)
 * en, waar een oordeel of bevinding is ingevuld, de antwoorden als audit per vestiging en datum.
 */
export async function importLocationAudit(rowsInput: ImportRow[], options: { updateExisting: boolean }): Promise<ImportResult> {
  try {
    const user = await requirePermission("legal.edit");
    if (!Array.isArray(rowsInput) || rowsInput.length === 0) return { error: "Geen regels om te importeren." };
    if (rowsInput.length > 10000) return { error: "Maximaal 10.000 regels per import." };

    const key = (s: string) => s.trim().toLowerCase();
    const [legal, locations, users, existingQuestions] = await Promise.all([
      prisma.legalRequirement.findMany({ where: { externalRef: { not: null } }, select: { id: true, externalRef: true, theme: true } }),
      prisma.location.findMany({ select: { id: true, name: true } }),
      prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } }),
      prisma.complianceQuestion.findMany({ include: { legalRequirement: { select: { externalRef: true } } } }),
    ]);
    const legalByRef = new Map(legal.map((l) => [l.externalRef!.toUpperCase(), l]));
    const locByName = new Map(locations.map((l) => [key(l.name), l.id]));
    const userMap = new Map(users.flatMap((u) => [[key(u.name), u.id] as const, [key(u.email), u.id] as const]));
    const questionByKey = new Map(existingQuestions.map((q) => [questionKey(q.legalRequirement?.externalRef, q.question), q]));
    let maxSort = Math.max(0, ...existingQuestions.map((q) => q.sortOrder));

    const warnings: string[] = [];
    const warnedRefs = new Set<string>();
    const warnedLocations = new Set<string>();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let answersSaved = 0;
    let actionsCreated = 0;
    const auditCache = new Map<string, string>(); // vestiging|datum → audit-id
    const touchedAudits = new Set<string>();
    const seenQuestions = new Set<string>();
    const today = new Date().toISOString().slice(0, 10);

    for (const input of rowsInput) {
      const parsed = importRowSchema.safeParse(input);
      if (!parsed.success) {
        skipped++;
        warnings.push(`Rij ${(input as ImportRow).rowNumber ?? "?"}: auditvraag ontbreekt of ongeldige waarde — overgeslagen`);
        continue;
      }
      const r = parsed.data;
      const ref = r.legalRef?.toUpperCase();
      const req = ref ? legalByRef.get(ref) : undefined;
      if (ref && !req && !warnedRefs.has(ref)) {
        warnedRefs.add(ref);
        warnings.push(`Rij ${r.rowNumber}: wettelijke eis ${ref} niet gevonden (importeer eerst het register) — vraag zonder koppeling`);
      }

      // 1. Vraag in de vragenbank
      const qKey = questionKey(ref, r.question);
      let question = questionByKey.get(qKey);
      const theme = r.theme ? stripLeadingSymbols(r.theme) : (req?.theme ?? undefined);
      if (!question) {
        maxSort += 10;
        const q = await prisma.complianceQuestion.create({
          data: { question: r.question, evidenceHint: r.evidenceHint, theme, legalRequirementId: req?.id, sortOrder: maxSort },
        });
        question = { ...q, legalRequirement: ref ? { externalRef: ref } : null };
        questionByKey.set(qKey, question);
        seenQuestions.add(qKey);
        created++;
      } else if (!seenQuestions.has(qKey)) {
        seenQuestions.add(qKey);
        if (options.updateExisting) {
          await prisma.complianceQuestion.update({
            where: { id: question.id },
            data: {
              ...(r.evidenceHint ? { evidenceHint: r.evidenceHint } : {}),
              ...(theme ? { theme } : {}),
              ...(req ? { legalRequirementId: req.id } : {}),
            },
          });
          updated++;
        }
      }

      // 2. Ingevuld oordeel → antwoord in de audit van die vestiging op die datum
      const verdict = r.verdict ? parseStatus(r.verdict) : null;
      if (r.verdict && verdict === null) warnings.push(`Rij ${r.rowNumber}: oordeel "${r.verdict}" niet herkend — niet overgenomen`);
      const hasAnswer = (verdict && verdict !== "NOT_ASSESSED") || r.finding || r.action;
      if (!hasAnswer) continue;
      const locationId = r.location ? locByName.get(key(r.location)) : undefined;
      if (!locationId) {
        const name = r.location ?? "(leeg)";
        if (!warnedLocations.has(name)) {
          warnedLocations.add(name);
          warnings.push(`Rij ${r.rowNumber}: vestiging "${name}" niet gevonden (importeer eerst de vestigingen) — oordeel niet overgenomen`);
        }
        continue;
      }
      const date = r.auditDate ?? today;
      if (!r.auditDate) warnings.push(`Rij ${r.rowNumber}: geen datum audit — datum van vandaag gebruikt`);
      const cacheKey = `${locationId}|${date}`;
      let auditId = auditCache.get(cacheKey);
      if (!auditId) {
        const auditorId = r.auditor ? userMap.get(key(r.auditor)) : undefined;
        const existingAudit = await prisma.locationAudit.findFirst({ where: { locationId, date: new Date(`${date}T00:00:00Z`) } });
        auditId =
          existingAudit?.id ??
          (
            await prisma.locationAudit.create({
              data: {
                locationId,
                date: new Date(`${date}T00:00:00Z`),
                status: "IN_PROGRESS",
                auditorId,
                auditorText: auditorId ? undefined : r.auditor,
                notes: "Overgenomen uit import",
                createdById: user.id,
              },
            })
          ).id;
        auditCache.set(cacheKey, auditId);
      }
      touchedAudits.add(auditId);
      const answer = await prisma.locationAuditAnswer.upsert({
        where: { auditId_questionId: { auditId, questionId: question.id } },
        update: { ...(verdict ? { verdict } : {}), ...(r.finding ? { finding: r.finding } : {}) },
        create: {
          auditId,
          questionId: question.id,
          legalRequirementId: question.legalRequirementId,
          questionText: question.question,
          evidenceHint: question.evidenceHint,
          theme: question.theme,
          sortOrder: question.sortOrder,
          verdict: verdict ?? "NOT_ASSESSED",
          finding: r.finding,
        },
      });
      answersSaved++;
      // "#12 …" komt uit onze eigen export: die actie bestaat al.
      if (r.action && !/^#\d+\s/.test(r.action)) {
        const title = r.action.slice(0, 300);
        const exists = await prisma.action.findFirst({ where: { locationAuditAnswerId: answer.id, title } });
        if (!exists) {
          const ownerId = r.actionOwner ? userMap.get(key(r.actionOwner)) : undefined;
          await prisma.action.create({
            data: {
              title,
              description:
                [r.action.length > 300 ? r.action : null, r.actionOwner && !ownerId ? `Eigenaar: ${r.actionOwner}` : null].filter(Boolean).join("\n") ||
                undefined,
              source: "LOCATION_AUDIT",
              locationAuditAnswerId: answer.id,
              legalRequirementId: question.legalRequirementId,
              locationId,
              ownerId,
              deadline: r.actionDue ? new Date(`${r.actionDue}T00:00:00Z`) : undefined,
              createdById: user.id,
            },
          });
          actionsCreated++;
        }
      }
    }

    // Vragen die nog niet in de geïmporteerde audits stonden aanvullen, zodat elke audit de volledige checklist heeft.
    if (touchedAudits.size) {
      const questions = await activeQuestions();
      for (const auditId of touchedAudits) {
        const have = new Set((await prisma.locationAuditAnswer.findMany({ where: { auditId }, select: { questionId: true } })).map((a) => a.questionId));
        const missing = questions.filter((q) => !have.has(q.id));
        if (missing.length) await prisma.locationAuditAnswer.createMany({ data: missing.map((q) => ({ ...answerData(q), auditId })) });
      }
    }
    if (answersSaved)
      warnings.unshift(`${answersSaved} oordeel/oordelen overgenomen in ${touchedAudits.size} audit(s), ${actionsCreated} actie(s) aangemaakt.`);

    await logAudit({
      user,
      action: "CREATE",
      entityType: "ComplianceQuestion",
      summary: `Import compliance-audit: ${created} vragen nieuw, ${updated} bijgewerkt, ${answersSaved} oordelen, ${actionsCreated} acties`,
      details: { created, updated, skipped, answersSaved, actionsCreated, warnings: warnings.slice(0, 200) },
    });
    revalidateAll();
    revalidatePath(`${BASE}/vragen`);
    return { created, updated, skipped, warnings };
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    console.error("[import] compliance-audit mislukt", err);
    return { error: "Import mislukt. Probeer het opnieuw." };
  }
}
