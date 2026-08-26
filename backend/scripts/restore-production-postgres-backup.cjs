"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const image = "postgres:18.6";
const backupPath = path.resolve(process.argv[2] || path.join(os.tmpdir(), "crm-v1-official-backup-20260826", "production.dump"));
const runId = `${Date.now()}-${process.pid}`;
const container = `crm-v1-restore-${runId}`.toLowerCase();
const volume = `crm-v1-restore-vol-${runId}`.toLowerCase();

async function main() {
  if (!fs.existsSync(backupPath) || fs.statSync(backupPath).size === 0) throw new Error("BACKUP_FILE_MISSING_OR_EMPTY");
  const backupBytes = fs.statSync(backupPath).size;
  const backupSha256 = crypto.createHash("sha256").update(fs.readFileSync(backupPath)).digest("hex");
  let started = false;
  try {
    const startedResult = docker([
      "run", "--detach", "--name", container,
      "--label", "com.crm.v1-restore=true",
      "--volume", `${volume}:/var/lib/postgresql`,
      "--publish", "127.0.0.1::5432",
      "--health-cmd=pg_isready -U restore -d restore",
      "--health-interval=2s", "--health-timeout=3s", "--health-retries=30",
      "--env", "POSTGRES_USER=restore",
      "--env", "POSTGRES_DB=restore",
      "--env", "POSTGRES_PASSWORD=throwaway-restore-only",
      image,
    ]);
    if (startedResult.status !== 0 || !startedResult.stdout.trim()) throw new Error("RESTORE_CONTAINER_START_FAILED");
    started = true;
    await waitHealthy();
    const copied = docker(["cp", backupPath, `${container}:/tmp/production.dump`]);
    if (copied.status !== 0) throw new Error("RESTORE_BACKUP_COPY_FAILED");
    const restored = docker(["exec", container, "pg_restore", "--username", "restore", "--dbname", "restore", "--no-owner", "--no-acl", "--exit-on-error", "/tmp/production.dump"], { timeoutMs: 180000 });
    if (restored.status !== 0) throw new Error("RESTORE_PG_RESTORE_FAILED");
    const listing = docker(["exec", container, "pg_restore", "--list", "/tmp/production.dump"]);
    if (listing.status !== 0) throw new Error("RESTORE_PG_RESTORE_LIST_FAILED");
    const listEntries = listing.stdout.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith(";")).length;
    if (listEntries < 10) throw new Error("RESTORE_LIST_TOO_SMALL");
    const version = psql("SELECT current_setting('server_version')");
    const migrationCount = Number(psql('SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'));
    const failedCount = Number(psql('SELECT COUNT(*) FROM "_prisma_migrations" WHERE rolled_back_at IS NOT NULL OR (finished_at IS NULL AND started_at IS NOT NULL)'));
    const counts = {};
    for (const table of ["Empresa", "PropostaComercial", "ItemPropostaComercial", "ProductOffer", "CommercialCatalogProduct"]) counts[table] = Number(psql(`SELECT COUNT(*) FROM "${table}"`));
    if (!version || !Number.isInteger(migrationCount) || failedCount !== 0) throw new Error("RESTORE_READONLY_VALIDATION_FAILED");
    console.log(JSON.stringify({ status: "passed", image, backupPath, backupBytes, backupSha256, restoreVersion: version, restoreListEntries: listEntries, restoreMigrationCount: migrationCount, restoreFailedMigrationCount: failedCount, restoreTableCounts: counts }, null, 2));
  } finally {
    if (started) docker(["rm", "--force", "--volumes", container]);
    docker(["volume", "rm", "--force", volume]);
  }
}

function psql(sql) {
  const result = docker(["exec", container, "psql", "--username", "restore", "--dbname", "restore", "--tuples-only", "--no-align", "--command", sql]);
  if (result.status !== 0) throw new Error("RESTORE_PSQL_VALIDATION_FAILED");
  return result.stdout.trim();
}

async function waitHealthy() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120000) {
    const result = docker(["inspect", `--format={{.State.Health.Status}}`, container]);
    if (result.stdout.trim() === "healthy") return;
    if (result.stdout.trim() === "unhealthy") throw new Error("RESTORE_CONTAINER_UNHEALTHY");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("RESTORE_CONTAINER_HEALTH_TIMEOUT");
}

function docker(args, { timeoutMs = 30000 } = {}) {
  const result = spawnSync("docker", args, { cwd: path.dirname(backupPath), env: process.env, encoding: "utf8", windowsHide: true, shell: false, timeout: timeoutMs });
  return { status: result.status, stdout: String(result.stdout || ""), stderr: String(result.stderr || "") };
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "failed", code: error.code || "RESTORE_DRILL_FAILED", message: error.message }));
  process.exitCode = 1;
});
