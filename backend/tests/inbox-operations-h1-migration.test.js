const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const backendDir = path.resolve(__dirname, "..");
const migrationName = "20260721123000_add_inbox_operational_history";

test("H1 aplica migration aditiva sobre historico legado e segunda execucao e inerte", () => {
  const supervisorRunDir = process.env.CRM_PRISMA_TEST_RUN_DIR;
  if (!supervisorRunDir || !path.isAbsolute(supervisorRunDir)) throw new Error("CRM_PRISMA_TEST_RUN_DIR absoluto e obrigatorio.");
  const workDir = path.join(supervisorRunDir, "h1-representative-migration");
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
    .run("Empresa historica H1", "empresa-historica-h1", "2026-07-21T12:00:00.000Z", "2026-07-21T12:00:00.000Z");
  database.prepare('INSERT INTO "HistoricoAtribuicao" ("empresaId", "tipo", "origem", "motivo", "createdAt") VALUES (1, ?, ?, ?, ?)')
    .run("ATRIBUIR", "MANUAL", "Registro legado preservado", "2026-07-21T12:05:00.000Z");
  const before = database.prepare('SELECT "id", "empresaId", "tipo", "origem", "motivo", "createdAt" FROM "HistoricoAtribuicao"').get();
  database.close();

  fs.cpSync(
    path.join(backendDir, "prisma", "migrations", migrationName),
    path.join(migrationsDir, migrationName),
    { recursive: true },
  );
  runPrisma(schemaPath, databasePath, ["migrate", "deploy"]);

  database = new DatabaseSync(databasePath, { readOnly: true });
  const after = database.prepare('SELECT "id", "empresaId", "tipo", "origem", "motivo", "createdAt", "acaoAtendimento", "estadoAnterior", "estadoNovo" FROM "HistoricoAtribuicao"').get();
  const migrations = database.prepare('SELECT COUNT(*) AS total FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL').get();
  const quick = database.prepare("PRAGMA quick_check").get();
  const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
  database.close();

  assert.deepEqual({ ...after, acaoAtendimento: undefined, estadoAnterior: undefined, estadoNovo: undefined }, { ...before, acaoAtendimento: undefined, estadoAnterior: undefined, estadoNovo: undefined });
  assert.equal(after.acaoAtendimento, null);
  assert.equal(after.estadoAnterior, null);
  assert.equal(after.estadoNovo, null);
  assert.equal(Number(migrations.total), 18);
  assert.equal(quick.quick_check, "ok");
  assert.equal(foreignKeys.length, 0);

  runPrisma(schemaPath, databasePath, ["migrate", "deploy"]);
  database = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(Number(database.prepare('SELECT COUNT(*) AS total FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL').get().total), 18);
  assert.equal(Number(database.prepare('SELECT COUNT(*) AS total FROM "HistoricoAtribuicao"').get().total), 1);
  database.close();

  const sql = fs.readFileSync(path.join(backendDir, "prisma", "migrations", migrationName, "migration.sql"), "utf8").trim().split(/\r?\n/);
  assert.deepEqual(sql, [
    'ALTER TABLE "HistoricoAtribuicao" ADD COLUMN "acaoAtendimento" TEXT;',
    'ALTER TABLE "HistoricoAtribuicao" ADD COLUMN "estadoAnterior" TEXT;',
    'ALTER TABLE "HistoricoAtribuicao" ADD COLUMN "estadoNovo" TEXT;',
  ]);
});

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
