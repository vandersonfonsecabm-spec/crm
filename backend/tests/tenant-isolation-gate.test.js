const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { test } = require("node:test");
const { Prisma } = require("@prisma/client");
const { relationSpecs } = require("../scripts/check-tenant-relation-integrity.cjs");
const {
  GLOBAL_RELATION_EXCEPTIONS,
  inspectArchitecture,
  migrationTouchesTenantRelations,
  runGate,
} = require("../scripts/tenant-isolation-gate.cjs");

const backendDir = path.resolve(__dirname, "..");
const migrationDir = path.join(backendDir, "prisma", "migrations");
const currentMigration = "20260801123000_enforce_tenant_safe_relations";
const runDir = requiredEnv("CRM_PRISMA_TEST_RUN_DIR");
const sourceDatabase = requiredEnv("CRM_TEST_BASE_DATABASE_PATH");

test("arquitetura atual cobre as 83 relacoes e as excecoes documentadas", () => {
  const result = inspectArchitecture();
  assert.deepEqual(result.failures, []);
  assert.equal(result.relationCount, 83);
  assert.deepEqual(Object.keys(GLOBAL_RELATION_EXCEPTIONS).sort(), [
    "AuditoriaFuncionalidade.usuarioId->Usuario",
    "PlatformTenantAudit.actorUserId->Usuario",
  ]);
});

test("relacao composta fora do manifesto reprova o gate", () => {
  const result = inspectArchitecture({ specs: relationSpecs.slice(0, -1) });
  assert.ok(result.failures.includes("TENANT_RELATION_NOT_REGISTERED"));
});

test("relacao simples sem excecao explicita reprova o gate", () => {
  const result = inspectArchitecture({ exceptions: {} });
  assert.ok(result.failures.includes("TENANT_RELATION_SIMPLE_UNDOCUMENTED"));
  const oneException = { "AuditoriaFuncionalidade.usuarioId->Usuario": GLOBAL_RELATION_EXCEPTIONS["AuditoriaFuncionalidade.usuarioId->Usuario"] };
  const missing = inspectArchitecture({ exceptions: oneException });
  assert.ok(missing.failures.includes("TENANT_RELATION_EXCEPTION_MISSING"));
});

test("mudanca de onDelete em relacao conhecida reprova a arquitetura", () => {
  const datamodel = structuredClone(Prisma.dmmf.datamodel);
  const nota = datamodel.models.find((model) => model.name === "Nota");
  nota.fields.find((field) => field.name === "cliente").relationOnDelete = "Restrict";
  const result = inspectArchitecture({ datamodel });
  assert.ok(result.failures.includes("TENANT_RELATION_DELETE_ACTION_MISMATCH"));
});

test("detector classifica DDL relacional sem depender de grep de linha", () => {
  const architecture = inspectArchitecture();
  assert.equal(migrationTouchesTenantRelations('ALTER TABLE "Cliente" ADD COLUMN "apelidoGate" TEXT;', architecture), false);
  assert.equal(migrationTouchesTenantRelations('ALTER TABLE "Cliente" ADD CONSTRAINT "fk_gate" FOREIGN KEY ("empresaId", "id") REFERENCES "Empresa"("id", "id");', architecture), true);
});

test("migration relacional futura sem registro reprova antes do DDL", async () => {
  const fixtureDir = path.join(runDir, "tenant-gate-unregistered-migration");
  const futureName = "20260802120000_future_tenant_relation";
  try {
    fs.mkdirSync(path.join(fixtureDir, futureName), { recursive: true });
    fs.copyFileSync(
      path.join(migrationDir, currentMigration, "migration.sql"),
      path.join(fixtureDir, futureName, "migration.sql"),
    );
    await assert.rejects(
      runGate({
        mode: "architecture",
        schemaPath: path.join(backendDir, "prisma", "schema.prisma"),
        migrationDir: fixtureDir,
        migrationName: futureName,
      }),
      (error) => error.code === "TENANT_GATE_MIGRATION_UNREGISTERED",
    );
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("migration registrada com SQL divergente reprova pelo hash", async () => {
  const fixtureDir = path.join(runDir, "tenant-gate-drift-migration");
  try {
    fs.mkdirSync(path.join(fixtureDir, currentMigration), { recursive: true });
    const source = fs.readFileSync(path.join(migrationDir, currentMigration, "migration.sql"), "utf8");
    fs.writeFileSync(path.join(fixtureDir, currentMigration, "migration.sql"), `${source}\n-- drift de fixture`);
    await assert.rejects(
      runGate({
      mode: "architecture",
      schemaPath: path.join(backendDir, "prisma", "schema.prisma"),
      sqliteMigrationDir: fixtureDir,
      migrationName: currentMigration,
      }),
      (error) => error.code === "TENANT_GATE_MIGRATION_HASH_MISMATCH",
    );
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("banco com relacao orfa reprova antes da verificacao de constraints", async () => {
  const databasePath = path.join(runDir, `tenant-gate-orphan-${process.pid}.db`);
  fs.copyFileSync(sourceDatabase, databasePath);
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = OFF");
  const tenantId = Number(database.prepare('SELECT COALESCE(MAX("id"), 0) + 1 AS nextId FROM "Empresa"').get().nextId);
  const createdAt = "2026-08-01T15:00:00.000Z";
  database.prepare('INSERT INTO "Empresa" ("id", "nome", "slug", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)')
    .run(tenantId, `Gate ${tenantId}`, `gate-${tenantId}`, createdAt, createdAt);
  const clientId = Number(database.prepare('SELECT COALESCE(MAX("id"), 0) + 1 AS nextId FROM "Cliente"').get().nextId);
  database.prepare('INSERT INTO "Cliente" ("id", "empresaId", "nome", "createdAt") VALUES (?, ?, ?, ?)')
    .run(clientId, tenantId, "Cliente Gate", createdAt);
  const notaId = Number(database.prepare('SELECT COALESCE(MAX("id"), 0) + 1 AS nextId FROM "Nota"').get().nextId);
  database.prepare('INSERT INTO "Nota" ("id", "empresaId", "clienteId", "texto", "createdAt") VALUES (?, ?, ?, ?, ?)')
    .run(notaId, tenantId, clientId + 999999, "Orfa Gate", createdAt);
  database.close();

  try {
    await assert.rejects(
      runGate({
        mode: "post-migration",
        env: { ...process.env, DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}` },
        schemaPath: path.join(backendDir, "prisma", "schema.prisma"),
        migrationDir,
        migrationName: currentMigration,
      }),
      (error) => error.code === "TENANT_GATE_DATA_INTEGRITY_FAILED",
    );
  } finally {
    removeDatabase(databasePath);
  }
});

test("scripts oficiais nao mantem deploy manual fora do gate", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(backendDir, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["db:migrate:manual"], "node scripts/migrate-with-tenant-gate.cjs");
  assert.equal(packageJson.scripts["db:tenant-gate"], "node scripts/tenant-isolation-gate.cjs");
  const rootPackage = JSON.parse(fs.readFileSync(path.join(backendDir, "..", "package.json"), "utf8"));
  assert.equal(rootPackage.scripts["legacy:nest:prisma:migrate"], "node scripts/legacy-nest-migration-block.cjs");
});

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value || !path.isAbsolute(value)) throw new Error(`${name} absoluto e obrigatorio.`);
  return value;
}

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}
