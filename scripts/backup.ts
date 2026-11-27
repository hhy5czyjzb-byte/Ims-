/**
 * Back-up en herstel vanaf de commandoregel.
 *
 *   npm run backup                      back-up maken + hersteltest
 *   npm run backup -- --zonder-test     back-up zonder hersteltest
 *   npm run backup:test [-- bestand]    hersteltest van de nieuwste (of opgegeven) back-up
 *   npm run backup:lijst                overzicht van de back-ups
 *   npm run backup:herstel -- bestand   back-up terugzetten (vraagt om bevestiging; --ja om over te slaan)
 */
import path from "node:path";
import readline from "node:readline/promises";
import { backupDir, createBackup, listBackups, restoreBackup, verifyBackup } from "../src/lib/backup";

try {
  process.loadEnvFile(".env");
} catch {
  // geen .env: dan alleen omgevingsvariabelen
}

const [cmd = "maak", ...rest] = process.argv.slice(2).filter((a) => a !== "--");
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const fileArg = rest.find((a) => !a.startsWith("--"));
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(2).replace(".", ",")} MB`;
const resolveFile = (f: string) => (path.isAbsolute(f) || f.includes(path.sep) ? path.resolve(f) : path.join(backupDir(), f));

async function main() {
  if (cmd === "maak" || cmd.startsWith("--")) {
    if (cmd.startsWith("--")) flags.add(cmd);
    console.log(`Back-up maken naar ${backupDir()} …`);
    const b = await createBackup({ verify: !flags.has("--zonder-test") });
    console.log(`✔ ${b.name} (${mb(b.sizeBytes)}, ${Object.values(b.tables).reduce((a, n) => a + n, 0)} rijen)`);
    if (b.verify) {
      console.log(`${b.verify.ok ? "✔" : "✖"} ${b.verify.message}`);
      for (const m of b.verify.mismatches) console.log(`   ${m.table}: verwacht ${m.expected}, teruggezet ${m.actual ?? "ontbreekt"}`);
      if (!b.verify.ok) process.exitCode = 2;
    }
    return;
  }
  if (cmd === "lijst") {
    const list = listBackups();
    if (!list.length) return console.log(`Geen back-ups in ${backupDir()}.`);
    for (const b of list) console.log(`${b.name}  ${mb(b.sizeBytes)}  ${b.verify ? (b.verify.ok ? "hersteltest ✔" : "hersteltest ✖") : "niet getest"}`);
    return;
  }
  if (cmd === "test") {
    const file = fileArg ? resolveFile(fileArg) : listBackups()[0]?.file;
    if (!file) throw new Error("Geen back-up gevonden.");
    const r = await verifyBackup(file);
    console.log(`${r.ok ? "✔" : "✖"} ${path.basename(file)}: ${r.message}`);
    if (!r.ok) process.exitCode = 2;
    return;
  }
  if (cmd === "herstel") {
    if (!fileArg) throw new Error("Geef het back-upbestand op, bijv.: npm run backup:herstel -- ims-20261127-210000.dump");
    const file = resolveFile(fileArg);
    if (!flags.has("--ja")) {
      console.log(`LET OP: de huidige database wordt vervangen door ${path.basename(file)}.`);
      console.log("Stop eerst de app (npm run dev). Er wordt automatisch een veiligheidskopie van de huidige stand gemaakt.");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question("Typ HERSTEL om door te gaan: ");
      rl.close();
      if (answer.trim() !== "HERSTEL") return console.log("Afgebroken.");
    }
    const { safety } = await restoreBackup(file);
    console.log(`✔ Teruggezet. Veiligheidskopie van de vorige stand: ${safety.name}`);
    return;
  }
  throw new Error(`Onbekend commando "${cmd}". Gebruik: maak, test, lijst of herstel.`);
}

main().catch((err) => {
  console.error(`✖ ${(err as Error).message}`);
  process.exit(1);
});
