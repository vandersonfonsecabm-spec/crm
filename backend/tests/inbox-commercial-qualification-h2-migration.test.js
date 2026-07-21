const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const backendDir = path.resolve(__dirname, "..");
const migrationName = "20260721213000_add_inbox_commercial_qualification";

test("H2 aplica somente historico comercial aditivo e preserva dados existentes", () => {
  const supervisorRunDir = process.env.CRM_PRISMA_TEST_RUN_DIR;
  if (!supervisorRunDir || !path.isAbsolute(supervisorRunDir)) throw new Error("CRM_PRISMA_TEST_RUN_DIR absoluto e obrigatorio.");
  const workDir = path.join(supervisorRunDir, "h2-representative-migration");
  const prismaDir = path.join(workDir, "prisma");
  const migrationsDir = path.join(prismaDir, "migrations");
  const schemaPath = path.join(prismaDir, "schema.prisma");
  const databasePath = path.join(prismaDir, "representative.db");
  fs.mkdirSync(prismaDir, { recursive: true });
  fs.copyFileSync(path.join(backendDir, "prisma", "schema.prisma"), schemaPath);
  fs.cpSync(path.join(backendDir, "prisma", "migrations"), migrationsDir, { recursive: true });
  fs.rmSync(path.join(migrationsDir, migrationName), { recursive: true, force: true });
  fs.writeFileSync(databasePath, "");

  runPrisma(schemaPath, databasePath, ["migrate", "deploy"]);
  let database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  database.prepare('INSERT INTO "Empresa" ("nome", "slug", "ativo", "createdAt", "updatedAt") VALUES (?, ?, 1, ?, ?)')
    .run("Empresa historica H2", "empresa-historica-h2", "2026-07-21T20:00:00.000Z", "2026-07-21T20:00:00.000Z");
  database.prepare('INSERT INTO "Cliente" ("empresaId", "nome", "createdAt") VALUES (1, ?, ?)')
    .run("Cliente preservado H2", "2026-07-21T20:05:00.000Z");
  const before = commercialFingerprint(database);
  database.close();

  fs.cpSync(path.join(backendDir, "prisma", "migrations", migrationName), path.join(migrationsDir, migrationName), { recursive: true });
  runPrisma(schemaPath, databasePath, ["migrate", "deploy"]);

  database = new DatabaseSync(databasePath, { readOnly: true });
  const columns = database.prepare('PRAGMA table_info("HistoricoQualificacaoConversa")').all().map((column) => column.name);
  const migrations = Number(database.prepare('SELECT COUNT(*) AS total FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL').get().total);
  assert.deepEqual(columns, [
    "id", "empresaId", "conversaCanalId", "clienteId", "leadId", "negocioId", "autorId", "acao",
    "interesse", "prioridade", "valorEstimado", "proximaAcao", "dataRetorno", "observacao", "createdAt",
  ]);
  assert.equal(migrations, 19);
  assert.equal(commercialFingerprint(database), before);
  assert.equal(database.prepare('PRAGMA quick_check').get().quick_check, "ok");
  assert.equal(database.prepare('PRAGMA foreign_key_check').all().length, 0);
  database.close();

  runPrisma(schemaPath, databasePath, ["migrate", "deploy"]);
  database = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(Number(database.prepare('SELECT COUNT(*) AS total FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL').get().total), 19);
  assert.equal(Number(database.prepare('SELECT COUNT(*) AS total FROM "HistoricoQualificacaoConversa"').get().total), 0);
  database.close();
});

function commercialFingerprint(database) {
  const rows = database.prepare('SELECT "id", "empresaId", "nome", "interesse", "status", "valor", "origem", "createdAt" FROM "Cliente" ORDER BY "id"').all();
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function runPrisma(schemaPath, databasePath, args) {
  const packageJsonPath = require.resolve("prisma/package.json", { paths: [backendDir] });
  const prismaPackage = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const relativeBin = typeof prismaPackage.bin === "string" ? prismaPackage.bin : prismaPackage.bin?.prisma;
  const prismaCli = path.resolve(path.dirname(packageJsonPath), relativeBin);
  const result = spawnSync(process.execPath, [prismaCli, ...args, "--schema", schemaPath], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}` },
    stdio: "pipe",
    windowsHide: true,
    shell: false,
  });
  if (result.error || result.status !== 0) throw new Error(`Prisma ${args.join(" ")} falhou com codigo ${result.status ?? "SPAWN"}.`);
}
