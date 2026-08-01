const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { test } = require("node:test");
const { Prisma } = require("@prisma/client");
const { relationSpecs } = require("../scripts/check-tenant-relation-integrity.cjs");
const {
  classifyPolymorphicRows,
  parsePilotSyntheticMetadata,
} = require("../scripts/tenant-isolation-verifier-utils.cjs");
const { sanitizePrismaOutput } = require("../scripts/tenant-isolation-log-utils.cjs");
const {
  EXPECTED_TENANT_RELATION_MANIFEST_SHA256,
  GLOBAL_RELATION_EXCEPTIONS,
  MIGRATION_REGISTRY,
  inspectArchitecture,
  migrationTouchesTenantRelations,
  failureIfUnsafe,
  runGate,
  tenantRelationManifestHash,
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
  assert.equal(result.relationManifestHash, EXPECTED_TENANT_RELATION_MANIFEST_SHA256);
  assert.equal(tenantRelationManifestHash(), EXPECTED_TENANT_RELATION_MANIFEST_SHA256);
  assert.equal(MIGRATION_REGISTRY[currentMigration].relationManifestSha256, EXPECTED_TENANT_RELATION_MANIFEST_SHA256);
  assert.deepEqual(Object.keys(GLOBAL_RELATION_EXCEPTIONS).sort(), [
    "AuditoriaFuncionalidade.usuarioId->Usuario",
    "PlatformTenantAudit.actorUserId->Usuario",
  ]);
});

test("hash do manifesto e deterministico e muda quando uma relacao muda", () => {
  const unchanged = tenantRelationManifestHash(relationSpecs);
  const changed = relationSpecs.map((spec, index) => index === 0 ? ["changed", ...spec.slice(1)] : spec);
  const reordered = [...relationSpecs].reverse();
  assert.equal(unchanged, EXPECTED_TENANT_RELATION_MANIFEST_SHA256);
  assert.equal(tenantRelationManifestHash(relationSpecs), unchanged);
  assert.notEqual(tenantRelationManifestHash(changed), unchanged);
  assert.notEqual(tenantRelationManifestHash(reordered), unchanged);
});

test("PILOT_SYNTHETIC exige JSON estruturado e contrato minimo", () => {
  const valid = parsePilotSyntheticMetadata(JSON.stringify({
    sourceType: "PILOT_SYNTHETIC",
    sourceId: "pilot-1",
    idempotencyKey: "pilot-1",
    synthetic: true,
    payload: { name: "Lead de teste", origin: "PILOT" },
  }));
  const invalid = parsePilotSyntheticMetadata('{"sourceType":"PILOT_SYNTHETIC","synthetic":true}');
  const malformed = parsePilotSyntheticMetadata('{"sourceType":"PILOT_SYNTHETIC"');
  assert.equal(valid.marked, true);
  assert.equal(valid.valid, true);
  assert.equal(invalid.marked, true);
  assert.equal(invalid.valid, false);
  assert.equal(malformed.marked, true);
  assert.equal(malformed.valid, false);
  assert.deepEqual(classifyPolymorphicRows([
    { entityType: "LEAD", entityId: "lead-1", leadId: null, businessId: null, tenantId: "tenant-1", summaryJson: JSON.stringify(valid.value), leadExists: null, leadTenantId: null, businessExists: null, businessTenantId: null },
    { entityType: "LEAD", entityId: "lead-2", leadId: null, businessId: null, tenantId: "tenant-1", summaryJson: '{"sourceType":"PILOT_SYNTHETIC"', leadExists: null, leadTenantId: null, businessExists: null, businessTenantId: null },
  ]), {
    synthetic: 1,
    invalid_pilot_synthetic: 1,
    orphaned_lead: 1,
    crossed_lead: 0,
    incoherent_lead: 1,
    orphaned_business: 0,
    crossed_business: 0,
    incoherent_business: 0,
  });
});

test("PILOT_SYNTHETIC invalido reprova a integridade do gate", () => {
  assert.throws(
    () => failureIfUnsafe({
      relations: [],
      polymorphic: {
        invalid_pilot_synthetic: 1,
        orphaned_lead: 0,
        crossed_lead: 0,
        incoherent_lead: 0,
        orphaned_business: 0,
        crossed_business: 0,
        incoherent_business: 0,
      },
    }),
    { code: "TENANT_GATE_DATA_INTEGRITY_FAILED" },
  );
});

test("saida Prisma e reduzida a categoria, codigo e contexto", () => {
  const safe = sanitizePrismaOutput(
    "PrismaClientKnownRequestError P2002 SELECT password FROM \"Usuario\" postgresql://user:redacted-secret@example.invalid/db C:\\private\\trace.js",
    "unit-test",
  );
  const serialized = JSON.stringify(safe);
  assert.equal(safe.category, "DATABASE");
  assert.equal(safe.code, "P2002");
  assert.equal(safe.context, "unit-test");
  assert.doesNotMatch(serialized, /SELECT|password|redacted-secret|example\.invalid|private|trace\.js/);
  assert.deepEqual(Object.keys(safe).sort(), ["category", "code", "context", "message"]);
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
