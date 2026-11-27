/**
 * Dagelijkse back-up inplannen.
 *   npm run backup:plan              dagelijks om 12:30 (laptop staat dan meestal aan)
 *   npm run backup:plan -- 09:15     andere tijd
 * Windows: maakt een taak in Taakplanner ("IMS Rouwmaat back-up"). macOS/Linux: toont de cron-regel.
 */
import { spawnSync } from "node:child_process";
import { cronLine, windowsScheduleCommand } from "../src/lib/backup";

try {
  process.loadEnvFile(".env");
} catch {
  // geen .env
}
const time =
  process.argv
    .slice(2)
    .find((a) => /^\d{1,2}:\d{2}$/.test(a))
    ?.padStart(5, "0") ?? "12:30";
const dir = process.cwd();

if (process.platform === "win32") {
  const c = windowsScheduleCommand(dir, time);
  const r = spawnSync(c.cmd, c.args, { stdio: "inherit" });
  if (r.status === 0) {
    console.log(`✔ Dagelijkse back-up ingepland om ${time} (Taakplanner: "IMS Rouwmaat back-up").`);
    console.log("  Staat de laptop op dat moment uit, dan wordt die dag overgeslagen; het dashboard waarschuwt als de laatste back-up ouder is dan 2 dagen.");
  } else {
    console.error("✖ Inplannen mislukt. Probeer het in een opdrachtprompt als beheerder, of plan 'npm run backup' handmatig in via Taakplanner.");
    process.exit(1);
  }
} else {
  console.log("Voeg deze regel toe met 'crontab -e':\n");
  console.log(cronLine(dir, time));
}
