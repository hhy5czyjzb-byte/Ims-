/**
 * Back-up en herstel van de database (fase 1: op de laptop).
 *
 * - Back-up met pg_dump (custom-formaat, gecomprimeerd). Draait de database in Docker
 *   (docker compose-service "db"), dan via `docker compose exec`; anders met de lokale PostgreSQL-tools.
 * - Hersteltest: de back-up wordt teruggezet in een tijdelijke database en per tabel vergeleken
 *   met de aantallen op het moment van de back-up. Pas dan is de back-up "getest".
 * - Bewaarbeleid: de nieuwste BACKUP_KEEP back-ups (standaard 30) blijven staan in BACKUP_DIR.
 *
 * Geen afhankelijkheid van Next.js: wordt gebruikt door scripts/backup.ts én de app (Stamgegevens).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

export type DbConfig = { user: string; password: string; host: string; port: string; database: string; url: string };
export type VerifyResult = { at: string; ok: boolean; message: string; mismatches: { table: string; expected: number; actual: number | null }[] };
export type BackupInfo = {
  file: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
  label: string | null;
  tables: Record<string, number>;
  verify: VerifyResult | null;
};
export type Runner = { kind: "docker" } | { kind: "local" };

export function parseDatabaseUrl(url: string | undefined): DbConfig {
  if (!url) throw new Error("DATABASE_URL ontbreekt (zie .env).");
  const u = new URL(url);
  const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!database) throw new Error("DATABASE_URL bevat geen databasenaam.");
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: u.hostname || "localhost",
    port: u.port || "5432",
    database,
    url,
  };
}

export function backupDir(): string {
  return path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), "backups"));
}

export function keepCount(): number {
  const n = Number(process.env.BACKUP_KEEP);
  return Number.isInteger(n) && n >= 3 ? n : 30;
}

/** Docker als de compose-service "db" draait (of BACKUP_TOOL=docker), anders de lokale PostgreSQL-tools. */
export function detectRunner(cwd = process.cwd()): Runner {
  const forced = process.env.BACKUP_TOOL;
  if (forced === "docker") return { kind: "docker" };
  if (forced === "local") return { kind: "local" };
  try {
    const r = spawnSync("docker", ["compose", "ps", "-q", "db"], { cwd, encoding: "utf8", timeout: 10_000 });
    if (r.status === 0 && r.stdout.trim()) return { kind: "docker" };
  } catch {
    // Docker niet geïnstalleerd
  }
  return { kind: "local" };
}

/** Commandoregel voor pg_dump/pg_restore (los getest). Het wachtwoord gaat via PGPASSWORD, nooit op de commandoregel. */
export function toolCommand(
  runner: Runner,
  tool: "pg_dump" | "pg_restore",
  db: DbConfig,
  args: string[],
): { cmd: string; args: string[]; env: Record<string, string> } {
  if (runner.kind === "docker") {
    // In de container via de lokale socket; de gebruiker is dezelfde als in DATABASE_URL.
    return { cmd: "docker", args: ["compose", "exec", "-T", "db", tool, "-U", db.user, ...args], env: {} };
  }
  return { cmd: tool, args: ["-h", db.host, "-p", db.port, "-U", db.user, ...args], env: db.password ? { PGPASSWORD: db.password } : {} };
}

function run(
  runner: Runner,
  tool: "pg_dump" | "pg_restore",
  db: DbConfig,
  args: string[],
  io: { stdoutFile?: string; stdinFile?: string } = {},
): Promise<void> {
  const c = toolCommand(runner, tool, db, args);
  return new Promise((resolve, reject) => {
    const child = spawn(c.cmd, c.args, {
      env: { ...process.env, ...c.env },
      stdio: [io.stdinFile ? "pipe" : "ignore", io.stdoutFile ? "pipe" : "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr!.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) =>
      reject(
        new Error(
          (err as NodeJS.ErrnoException).code === "ENOENT"
            ? `${c.cmd} niet gevonden. Installeer PostgreSQL (met ${tool}) of start de database met docker compose.`
            : `${tool} kon niet starten: ${err.message}`,
        ),
      ),
    );
    if (io.stdoutFile) child.stdout!.pipe(fs.createWriteStream(io.stdoutFile));
    if (io.stdinFile) fs.createReadStream(io.stdinFile).pipe(child.stdin!);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${tool} mislukt (code ${code}): ${stderr.trim().slice(0, 800)}`))));
  });
}

/** Aantal rijen per tabel (zonder de migratietabel). */
export async function tableCounts(url: string): Promise<Record<string, number>> {
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    const tables = await client.$queryRawUnsafe<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name",
    );
    const out: Record<string, number> = {};
    for (const t of tables) {
      const [{ n }] = await client.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*)::bigint AS n FROM "${t.table_name.replace(/"/g, '""')}"`);
      out[t.table_name] = Number(n);
    }
    return out;
  } finally {
    await client.$disconnect();
  }
}

function sidecar(file: string) {
  return file.replace(/\.dump$/, ".json");
}

function timestamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Maak een back-up (en standaard direct een hersteltest). */
export async function createBackup(opts: { label?: string; verify?: boolean } = {}): Promise<BackupInfo> {
  const db = parseDatabaseUrl(process.env.DATABASE_URL);
  const runner = detectRunner();
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const label = opts.label ? opts.label.replace(/[^a-z0-9-]/gi, "").slice(0, 30) : null;
  const name = `ims-${timestamp()}${label ? `-${label}` : ""}.dump`;
  const file = path.join(dir, name);
  const tables = await tableCounts(db.url);
  await run(runner, "pg_dump", db, ["-d", db.database, "-Fc", "--no-owner", "--no-privileges"], { stdoutFile: file });
  const size = fs.statSync(file).size;
  if (size < 100) throw new Error("De back-up is leeg of onvolledig.");
  const info: BackupInfo = { file, name, createdAt: new Date().toISOString(), sizeBytes: size, label, tables, verify: null };
  fs.writeFileSync(sidecar(file), JSON.stringify(info, null, 2));
  if (opts.verify !== false) info.verify = await verifyBackup(file);
  pruneBackups();
  return { ...info, ...readInfo(file) };
}

/** Hersteltest: terugzetten in een tijdelijke database en per tabel vergelijken. */
export async function verifyBackup(file: string): Promise<VerifyResult> {
  const db = parseDatabaseUrl(process.env.DATABASE_URL);
  const runner = detectRunner();
  const info = readInfo(file);
  const temp = `${db.database}_herstelcontrole`;
  const admin = new PrismaClient({ datasourceUrl: db.url });
  let result: VerifyResult;
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${temp}"`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${temp}"`);
    await run(runner, "pg_restore", db, ["--no-owner", "--no-privileges", "--exit-on-error", "-d", temp], { stdinFile: file });
    const tempUrl = new URL(db.url);
    tempUrl.pathname = `/${temp}`;
    const actual = await tableCounts(tempUrl.toString());
    const mismatches = Object.entries(info?.tables ?? {})
      .filter(([t, n]) => actual[t] !== n)
      .map(([table, expected]) => ({ table, expected, actual: actual[table] ?? null }));
    const total = Object.values(actual).reduce((a, b) => a + b, 0);
    result = {
      at: new Date().toISOString(),
      ok: mismatches.length === 0 && Object.keys(actual).length > 0,
      message:
        mismatches.length === 0
          ? `Hersteltest geslaagd: ${Object.keys(actual).length} tabellen, ${total} rijen teruggezet en gecontroleerd.`
          : `Hersteltest: ${mismatches.length} tabel(len) wijken af.`,
      mismatches,
    };
  } catch (err) {
    result = { at: new Date().toISOString(), ok: false, message: `Hersteltest mislukt: ${(err as Error).message}`, mismatches: [] };
  } finally {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${temp}"`).catch(() => undefined);
    await admin.$disconnect();
  }
  if (info) fs.writeFileSync(sidecar(file), JSON.stringify({ ...info, verify: result }, null, 2));
  return result;
}

/** Zet een back-up terug in de database van de app. Maakt eerst een veiligheidskopie van de huidige stand. */
export async function restoreBackup(file: string): Promise<{ safety: BackupInfo }> {
  if (!fs.existsSync(file)) throw new Error(`Bestand niet gevonden: ${file}`);
  const db = parseDatabaseUrl(process.env.DATABASE_URL);
  const runner = detectRunner();
  const safety = await createBackup({ label: "voor-herstel", verify: false });
  await run(runner, "pg_restore", db, ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--single-transaction", "-d", db.database], {
    stdinFile: file,
  });
  return { safety };
}

export function readInfo(file: string): BackupInfo | null {
  try {
    const raw = JSON.parse(fs.readFileSync(sidecar(file), "utf8")) as BackupInfo;
    return { ...raw, file, name: path.basename(file) };
  } catch {
    if (!fs.existsSync(file)) return null;
    const st = fs.statSync(file);
    return { file, name: path.basename(file), createdAt: st.mtime.toISOString(), sizeBytes: st.size, label: null, tables: {}, verify: null };
  }
}

/** Back-ups in de map, nieuwste eerst. */
export function listBackups(): BackupInfo[] {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^ims-.*\.dump$/.test(f))
    .map((f) => readInfo(path.join(dir, f)))
    .filter((x): x is BackupInfo => !!x)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Verwijder de oudste back-ups boven het bewaaraantal. */
export function pruneBackups(keep = keepCount()): number {
  const old = listBackups().slice(keep);
  for (const b of old) {
    fs.rmSync(b.file, { force: true });
    fs.rmSync(sidecar(b.file), { force: true });
  }
  return old.length;
}

/** Commando om een dagelijkse back-up in te plannen (Windows Taakplanner), los getest. */
export function windowsScheduleCommand(projectDir: string, time = "12:30"): { cmd: string; args: string[] } {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`Ongeldige tijd "${time}" (gebruik UU:MM, bijv. 12:30).`);
  const log = path.join(backupDir(), "backup.log");
  const action = `cmd /c cd /d "${projectDir}" && npm run backup >> "${log}" 2>&1`;
  return { cmd: "schtasks", args: ["/Create", "/TN", "IMS Rouwmaat back-up", "/TR", action, "/SC", "DAILY", "/ST", time, "/F"] };
}

/** Cron-regel voor macOS/Linux. */
export function cronLine(projectDir: string, time = "12:30"): string {
  const [h, m] = time.split(":").map(Number);
  return `${m} ${h} * * * cd "${projectDir}" && npm run backup >> "${path.join(backupDir(), "backup.log")}" 2>&1`;
}
