import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDatabaseUrl, toolCommand } from "./backup";

test("parseDatabaseUrl", () => {
  const db = parseDatabaseUrl("postgresql://ims:geheim%21@localhost:5433/ims?schema=public");
  assert.deepEqual({ ...db, url: undefined }, { user: "ims", password: "geheim!", host: "localhost", port: "5433", database: "ims", url: undefined });
  assert.throws(() => parseDatabaseUrl(undefined), /DATABASE_URL ontbreekt/);
});

test("toolCommand: lokaal met PGPASSWORD, Docker via compose exec; wachtwoord nooit op de commandoregel", () => {
  const db = parseDatabaseUrl("postgresql://ims:geheim@localhost:5432/ims");
  const local = toolCommand({ kind: "local" }, "pg_dump", db, ["-d", "ims", "-Fc"]);
  assert.equal(local.cmd, "pg_dump");
  assert.deepEqual(local.args, ["-h", "localhost", "-p", "5432", "-U", "ims", "-d", "ims", "-Fc"]);
  assert.equal(local.env.PGPASSWORD, "geheim");
  const docker = toolCommand({ kind: "docker" }, "pg_restore", db, ["-d", "ims"]);
  assert.equal(docker.cmd, "docker");
  assert.deepEqual(docker.args, ["compose", "exec", "-T", "db", "pg_restore", "-U", "ims", "-d", "ims"]);
  for (const c of [local, docker]) assert.ok(!c.args.join(" ").includes("geheim"));
});

test("planning: Windows Taakplanner en cron", async () => {
  const { windowsScheduleCommand, cronLine } = await import("./backup");
  const w = windowsScheduleCommand("C:\\Projecten\\ims", "12:30");
  assert.equal(w.cmd, "schtasks");
  assert.deepEqual(w.args.slice(0, 3), ["/Create", "/TN", "IMS Rouwmaat back-up"]);
  assert.ok(w.args[4].includes('cd /d "C:\\Projecten\\ims" && npm run backup'));
  assert.deepEqual(w.args.slice(5), ["/SC", "DAILY", "/ST", "12:30", "/F"]);
  assert.throws(() => windowsScheduleCommand("x", "25:00"), /Ongeldige tijd/);
  assert.match(cronLine("/home/eelco/ims", "07:05"), /^5 7 \* \* \* cd "\/home\/eelco\/ims" && npm run backup/);
});
