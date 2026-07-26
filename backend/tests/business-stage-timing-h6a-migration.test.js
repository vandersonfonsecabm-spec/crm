const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { copyMigrationsBefore, copyTargetMigration } = require("./fixtures/migration-sandbox");

const backendDir = path.resolve(__dirname, "..");
const migrationName = "20260726123000_add_business_stage_timing";

test("H6A adiciona tempo de etapa sem alterar dados comerciais existentes", () => {
  const runRoot = process.env.CRM_PRISMA_TEST_RUN_DIR;
  if (!runRoot || !path.isAbsolute(runRoot)) throw new Error("CRM_PRISMA_TEST_RUN_DIR absoluto e obrigatorio.");
  const workDir = path.join(runRoot, "h6a-representative-migration");
  const prismaDir = path.join(workDir, "prisma");
  const migrationsDir = path.join(prismaDir, "migrations");
  const schemaPath = path.join(prismaDir, "schema.prisma");
  const databasePath = path.join(prismaDir, "representative.db");
  fs.mkdirSync(prismaDir, { recursive: true });
  fs.copyFileSync(path.join(backendDir, "prisma", "schema.prisma"), schemaPath);
  copyMigrationsBefore({ backendDir, migrationsDir, migrationName });
  fs.writeFileSync(databasePath, "");

  runPrisma(schemaPath, databasePath);
  let database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  const createdAt = "2026-07-25T12:00:00.000Z";
  database.prepare('INSERT INTO "Empresa" ("nome", "slug", "ativo", "createdAt", "updatedAt") VALUES (?, ?, 1, ?, ?)').run("Empresa H6A", "empresa-h6a", createdAt, createdAt);
  database.prepare('INSERT INTO "Usuario" ("empresaId", "nome", "email", "senhaHash", "papel", "ativo", "createdAt", "updatedAt") VALUES (1, ?, ?, ?, ?, 1, ?, ?)').run("Admin H6A", "admin@h6a.test", "hash", "ADMIN", createdAt, createdAt);
  database.prepare('INSERT INTO "Cliente" ("empresaId", "nome", "createdAt") VALUES (1, ?, ?)').run("Cliente preservado H6A", createdAt);
  database.prepare('INSERT INTO "Lead" ("empresaId", "clienteId", "responsavelId", "status", "createdAt", "updatedAt") VALUES (1, 1, 1, ?, ?, ?)').run("CONVERTIDO", createdAt, createdAt);
  database.prepare('INSERT INTO "Negocio" ("empresaId", "clienteId", "leadId", "responsavelId", "titulo", "etapa", "valor", "createdAt", "updatedAt") VALUES (1, 1, 1, 1, ?, ?, 25000, ?, ?)').run("Negocio preservado H6A", "PROPOSTA", createdAt, createdAt);
  database.prepare('INSERT INTO "HistoricoAtribuicao" ("empresaId", "negocioId", "responsavelNovoId", "alteradoPorId", "tipo", "origem", "motivo", "createdAt") VALUES (1, 1, 1, 1, ?, ?, ?, ?)').run("ATRIBUIR", "MANUAL", "Historico preservado", createdAt);
  const before = fingerprint(database);
  database.close();

  copyTargetMigration({ backendDir, migrationsDir, migrationName });
  runPrisma(schemaPath, databasePath);

  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  const businessColumns = tableColumns(database, "Negocio");
  const historyColumns = tableColumns(database, "HistoricoAtribuicao");
  for (const name of ["etapaEntrouEm", "ultimaMovimentacaoEm"]) {
    assert.ok(businessColumns[name], `Coluna ausente: Negocio.${name}`);
    assert.equal(businessColumns[name].notnull, 0);
  }
  for (const name of ["etapaAnterior", "etapaNova", "etapaEntrouEm", "etapaSaiuEm", "duracaoEtapaSegundos", "duracaoEtapaEstimada"]) {
    assert.ok(historyColumns[name], `Coluna ausente: HistoricoAtribuicao.${name}`);
    assert.equal(historyColumns[name].notnull, 0);
  }
  assert.equal(Number(database.prepare('SELECT COUNT(*) AS total FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL').get().total), 23);
  assert.equal(fingerprint(database), before);
  assert.deepEqual(
    { ...database.prepare('SELECT "etapaEntrouEm", "ultimaMovimentacaoEm" FROM "Negocio" WHERE "id" = 1').get() },
    { etapaEntrouEm: null, ultimaMovimentacaoEm: null },
  );
  assert.deepEqual(
    { ...database.prepare('SELECT "etapaAnterior", "etapaNova", "etapaEntrouEm", "etapaSaiuEm", "duracaoEtapaSegundos", "duracaoEtapaEstimada" FROM "HistoricoAtribuicao" WHERE "id" = 1').get() },
    { etapaAnterior: null, etapaNova: null, etapaEntrouEm: null, etapaSaiuEm: null, duracaoEtapaSegundos: null, duracaoEtapaEstimada: null },
  );
  assert.equal(database.prepare("PRAGMA quick_check").get().quick_check, "ok");
  assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  database.close();
});

function tableColumns(database, table) {
  return Object.fromEntries(database.prepare(`PRAGMA table_info("${table}")`).all().map((column) => [column.name, column]));
}

function fingerprint(database) {
  const business = database.prepare('SELECT "id", "empresaId", "clienteId", "leadId", "responsavelId", "titulo", "etapa", "valor", "createdAt", "updatedAt" FROM "Negocio" ORDER BY "id"').all();
  const history = database.prepare('SELECT "id", "empresaId", "negocioId", "responsavelNovoId", "alteradoPorId", "tipo", "origem", "motivo", "createdAt" FROM "HistoricoAtribuicao" ORDER BY "id"').all();
  return crypto.createHash("sha256").update(JSON.stringify({ business, history })).digest("hex");
}

function runPrisma(schemaPath, databasePath) {
  const packageJsonPath = require.resolve("prisma/package.json", { paths: [backendDir] });
  const prismaPackage = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const relativeBin = typeof prismaPackage.bin === "string" ? prismaPackage.bin : prismaPackage.bin?.prisma;
  const prismaCli = path.resolve(path.dirname(packageJsonPath), relativeBin);
  const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}` },
    stdio: "pipe",
    windowsHide: true,
    shell: false,
  });
  if (result.error || result.status !== 0) throw new Error(`Prisma migrate deploy falhou com codigo ${result.status ?? "SPAWN"}.`);
}
