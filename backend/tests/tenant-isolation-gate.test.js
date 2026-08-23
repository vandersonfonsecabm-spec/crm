const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
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
  assertPendingRelationBoundary,
  createdTablesFromMigrationSql,
  inspectArchitecture,
  migrationRegistrationRequired,
  migrationTouchesTenantRelations,
  pendingMigrationBoundary,
  failureIfUnsafe,
  relationSpecsForExistingSchema,
  runGate,
  tenantRelationManifestHash,
  validateAppliedMigrationChecksums,
} = require("../scripts/tenant-isolation-gate.cjs");

const backendDir = path.resolve(__dirname, "..");
const migrationDir = path.join(backendDir, "prisma", "migrations");
const currentMigration = "20260801123000_enforce_tenant_safe_relations";
const latestMigration = "20260823152000_add_distributed_rate_limit";
const runDir = requiredEnv("CRM_PRISMA_TEST_RUN_DIR");
const sourceDatabase = requiredEnv("CRM_TEST_BASE_DATABASE_PATH");
const historicalSourceDatabase = requiredEnv("CRM_TEST_SOURCE_DATABASE_PATH");

test("arquitetura atual cobre as 91 relacoes e as excecoes documentadas", () => {
  const result = inspectArchitecture();
  assert.deepEqual(result.failures, []);
  assert.equal(result.relationCount, 91);
  assert.equal(result.relationManifestHash, EXPECTED_TENANT_RELATION_MANIFEST_SHA256);
  assert.equal(tenantRelationManifestHash(), EXPECTED_TENANT_RELATION_MANIFEST_SHA256);
  assert.equal(MIGRATION_REGISTRY[currentMigration].relationManifestSha256, EXPECTED_TENANT_RELATION_MANIFEST_SHA256);
  assert.deepEqual(Object.keys(GLOBAL_RELATION_EXCEPTIONS).sort(), [
    "AuditoriaFuncionalidade.usuarioId->Usuario",
    "CanalIntegracao.id->MetaCredential",
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
  const mensagem = datamodel.models.find((model) => model.name === "MensagemCanal");
  mensagem.fields.find((field) => field.name === "conversaCanal").relationOnDelete = "Restrict";
  const result = inspectArchitecture({ datamodel });
  assert.ok(result.failures.includes("TENANT_RELATION_DELETE_ACTION_MISMATCH"));
});

test("detector classifica DDL relacional sem depender de grep de linha", () => {
  const architecture = inspectArchitecture();
  assert.equal(migrationTouchesTenantRelations('ALTER TABLE "Cliente" ADD COLUMN "apelidoGate" TEXT;', architecture), false);
  assert.equal(migrationTouchesTenantRelations('ALTER TABLE "Cliente" ADD CONSTRAINT "fk_gate" FOREIGN KEY ("empresaId", "id") REFERENCES "Empresa"("id", "id");', architecture), true);
});

test("pre-migration aceita somente tabelas novas da migration registrada", () => {
  const migrationSql = fs.readFileSync(
    path.join(migrationDir, "20260801150000_add_user_security_foundation", "migration.sql"),
    "utf8",
  );
  const createdTables = createdTablesFromMigrationSql(migrationSql);
  assert.deepEqual([...createdTables].sort(), [
    "AUDITORIASEGURANCA",
    "CONVITEUSUARIO",
    "SESSAOREFRESHTOKEN",
    "SESSAOUSUARIO",
    "TOKENRECUPERACAOSENHA",
  ]);

  const existingTables = new Set();
  for (const [, child, , parent] of relationSpecs) {
    if (!createdTables.has(child.toUpperCase())) existingTables.add(child);
    if (!createdTables.has(parent.toUpperCase())) existingTables.add(parent);
  }
  existingTables.add("AutomacaoExecucao");
  existingTables.add("Lead");
  existingTables.add("Negocio");
  assert.equal(relationSpecsForExistingSchema(existingTables, { allowedMissingTables: createdTables }).length, 87);

  existingTables.delete("Cliente");
  assert.throws(
    () => relationSpecsForExistingSchema(existingTables, { allowedMissingTables: createdTables }),
    { code: "TENANT_GATE_SCHEMA_INCOMPLETE" },
  );
});

test("pre-migration preserva o upgrade canonico SQLite de 9 para 32 migrations", async () => {
  const databasePath = path.join(runDir, `tenant-gate-historical-upgrade-${process.pid}.db`);
  fs.copyFileSync(historicalSourceDatabase, databasePath);
  try {
    const historicalDatabase = new DatabaseSync(databasePath, { readOnly: true });
    const historicalTables = new Set(historicalDatabase.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => String(row.name)));
    const unavailableRelations = relationSpecs
      .filter(([, child, childField, parent]) => historicalTables.has(child) && historicalTables.has(parent)
        && !historicalDatabase.prepare(`PRAGMA table_info("${child}")`).all().some((row) => String(row.name) === childField))
      .map((spec) => `${spec[1]}.${spec[2]}->${spec[3]}`);
    historicalDatabase.close();
    assert.deepEqual(unavailableRelations, [
      "Acompanhamento.conversaCanalId->ConversaCanal",
      "Acompanhamento.responsavelId->Usuario",
      "Acompanhamento.autorId->Usuario",
      "Acompanhamento.concluidoPorId->Usuario",
      "Acompanhamento.canceladoPorId->Usuario",
      "IntegracaoOAuthState.canalIntegracaoId->CanalIntegracao",
      "ContatoCanal.clienteId->Cliente",
      "ConversaCanal.responsavelId->Usuario",
      "ConversaCanal.respostaReservadaPorId->Usuario",
      "MensagemCanal.autorUsuarioId->Usuario",
    ]);
    const result = await runGate({
      mode: "pre-migration",
      env: { ...process.env, DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}` },
      schemaPath: path.join(backendDir, "prisma", "schema.prisma"),
      migrationDir,
      migrationName: latestMigration,
    });
    assert.equal(result.safe, true);
    assert.equal(result.relationCount, 91);
    assert.ok(result.checkedRelationCount > 0 && result.checkedRelationCount < 91);
  } finally {
    removeDatabase(databasePath);
  }
});

test("pre-migration admite somente a relacao exata ligada a migration Meta pendente", () => {
  const architecture = inspectArchitecture();
  const tables = new Set(architecture.discovered.models.keys());
  const columnsByTable = new Map(
    [...architecture.discovered.models].map(([name, model]) => [
      name,
      new Set(model.fields.filter((field) => field.kind === "scalar").map((field) => field.name)),
    ]),
  );
  columnsByTable.get("IntegracaoOAuthState").delete("canalIntegracaoId");
  tables.delete("MetaCredential");
  columnsByTable.delete("MetaCredential");

  const options = {
    allowedMissingTables: new Set(["METACREDENTIAL"]),
    columnsByTable,
    unavailableRelationKeys: new Set(["IntegracaoOAuthState.canalIntegracaoId->CanalIntegracao"]),
  };
  assert.equal(relationSpecsForExistingSchema(tables, options).length, 89);
  assert.throws(
    () => relationSpecsForExistingSchema(tables, { ...options, unavailableRelationKeys: new Set() }),
    { code: "TENANT_GATE_SCHEMA_INCOMPLETE" },
  );
  assert.throws(
    () => relationSpecsForExistingSchema(tables, {
      ...options,
      unavailableRelationKeys: new Set(["IntegracaoOAuthState.usuarioId->Usuario"]),
    }),
    { code: "TENANT_GATE_SCHEMA_INCOMPLETE" },
  );
});

test("pre-migration inspeciona a relacao quando a coluna pendente ja existe", () => {
  const architecture = inspectArchitecture();
  const tables = new Set(architecture.discovered.models.keys());
  const columnsByTable = new Map(
    [...architecture.discovered.models].map(([name, model]) => [
      name,
      new Set(model.fields.filter((field) => field.kind === "scalar").map((field) => field.name)),
    ]),
  );
  assert.equal(relationSpecsForExistingSchema(tables, {
    columnsByTable,
    unavailableRelationKeys: new Set(["IntegracaoOAuthState.canalIntegracaoId->CanalIntegracao"]),
  }).length, 91);

  columnsByTable.get("IntegracaoOAuthState").delete("usuarioId");
  assert.throws(
    () => relationSpecsForExistingSchema(tables, {
      columnsByTable,
      unavailableRelationKeys: new Set(["IntegracaoOAuthState.canalIntegracaoId->CanalIntegracao"]),
    }),
    { code: "TENANT_GATE_SCHEMA_INCOMPLETE" },
  );
});

test("boundary pendente nao pode autorizar campo relacional obrigatorio", () => {
  const architecture = inspectArchitecture();
  const field = architecture.discovered.models.get("IntegracaoOAuthState").fields
    .find((candidate) => candidate.name === "canalIntegracaoId");
  const original = field.isRequired;
  field.isRequired = true;
  try {
    assert.throws(
      () => assertPendingRelationBoundary(architecture, "IntegracaoOAuthState.canalIntegracaoId->CanalIntegracao"),
      { code: "TENANT_GATE_PENDING_RELATION_BOUNDARY_INVALID" },
    );
  } finally {
    field.isRequired = original;
  }
});

test("migration relacional pendente sem registro nao concede ausencia de tabela", async () => {
  const fixtureDir = path.join(runDir, "tenant-gate-pending-unregistered");
  const databasePath = path.join(runDir, `tenant-gate-pending-unregistered-${process.pid}.db`);
  const futureName = "20260802120000_future_tenant_relation";
  const database = new DatabaseSync(databasePath);
  try {
    fs.mkdirSync(path.join(fixtureDir, currentMigration), { recursive: true });
    fs.mkdirSync(path.join(fixtureDir, futureName), { recursive: true });
    fs.copyFileSync(
      path.join(migrationDir, currentMigration, "migration.sql"),
      path.join(fixtureDir, currentMigration, "migration.sql"),
    );
    fs.copyFileSync(
      path.join(migrationDir, currentMigration, "migration.sql"),
      path.join(fixtureDir, futureName, "migration.sql"),
    );
    database.exec(`
      CREATE TABLE "Cliente" ("id" INTEGER PRIMARY KEY);
      CREATE TABLE "_prisma_migrations" (
        "id" TEXT PRIMARY KEY,
        "checksum" TEXT NOT NULL,
        "finished_at" DATETIME,
        "migration_name" TEXT NOT NULL,
        "rolled_back_at" DATETIME,
        "started_at" DATETIME NOT NULL
      );
    `);
    database.prepare('INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "rolled_back_at", "started_at") VALUES (?, ?, ?, ?, NULL, ?)')
      .run("v46-applied", MIGRATION_REGISTRY[currentMigration].sqliteSha256, "2026-08-13T00:00:00.000Z", currentMigration, "2026-08-13T00:00:00.000Z");
    database.close();

    await assert.rejects(
      pendingMigrationBoundary({
        url: `file:${databasePath.replace(/\\/g, "/")}`,
        directory: fixtureDir,
        migrationName: futureName,
        architecture: inspectArchitecture(),
      }),
      { code: "TENANT_GATE_MIGRATION_UNREGISTERED" },
    );
  } finally {
    try { database.close(); } catch {}
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    removeDatabase(databasePath);
  }
});

test("registro e obrigatorio para todo PostgreSQL e para novas migrations SQLite", () => {
  assert.equal(migrationRegistrationRequired("postgresql", "20260728090000_postgres_baseline"), true);
  assert.equal(migrationRegistrationRequired("sqlite", "20260727103000_add_platform_tenant_audit"), false);
  assert.equal(migrationRegistrationRequired("sqlite", currentMigration), true);
  assert.equal(migrationRegistrationRequired("sqlite", latestMigration), true);
  assert.equal(migrationRegistrationRequired("sqlite", "20990101000000_drop_tenant_table"), true);
});

test("checksum aplicado divergente reprova antes da verificacao de dados", () => {
  validateAppliedMigrationChecksums(migrationDir, [{
    migration_name: currentMigration,
    checksum: MIGRATION_REGISTRY[currentMigration].sqliteSha256,
  }]);
  assert.throws(
    () => validateAppliedMigrationChecksums(migrationDir, [{ migration_name: currentMigration, checksum: "0".repeat(64) }]),
    { code: "TENANT_GATE_MIGRATION_CHECKSUM_MISMATCH" },
  );
});

test("runGate reprova checksum aplicado divergente antes da verificacao de dados", async () => {
  const databasePath = path.join(runDir, `tenant-gate-checksum-${process.pid}.db`);
  fs.copyFileSync(sourceDatabase, databasePath);
  const database = new DatabaseSync(databasePath);
  database.prepare('UPDATE "_prisma_migrations" SET "checksum" = ? WHERE "migration_name" = ?')
    .run("0".repeat(64), currentMigration);
  database.close();
  try {
    await assert.rejects(
      runGate({
        mode: "post-migration",
        env: { ...process.env, DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}` },
        schemaPath: path.join(backendDir, "prisma", "schema.prisma"),
        migrationDir,
        migrationName: latestMigration,
      }),
      { code: "TENANT_GATE_MIGRATION_CHECKSUM_MISMATCH" },
    );
  } finally {
    removeDatabase(databasePath);
  }
});

test("historico aplicado sem nenhuma tabela de aplicacao reprova o bootstrap", async () => {
  const databasePath = path.join(runDir, `tenant-gate-history-without-schema-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE "_prisma_migrations" (
      "id" TEXT PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL
    );
  `);
  database.prepare('INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "rolled_back_at", "started_at") VALUES (?, ?, ?, ?, NULL, ?)')
    .run("v46-history-only", MIGRATION_REGISTRY[currentMigration].sqliteSha256, "2026-08-13T00:00:00.000Z", currentMigration, "2026-08-13T00:00:00.000Z");
  database.close();
  try {
    await assert.rejects(
      runGate({
        mode: "pre-migration",
        env: { ...process.env, DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}` },
        schemaPath: path.join(backendDir, "prisma", "schema.prisma"),
        migrationDir,
        migrationName: latestMigration,
      }),
      { code: "TENANT_GATE_MIGRATION_HISTORY_SCHEMA_MISSING" },
    );
  } finally {
    removeDatabase(databasePath);
  }
});

test("historico aplicado com tabela estranha nao e tratado como bootstrap vazio", async () => {
  const databasePath = path.join(runDir, `tenant-gate-history-with-unrelated-schema-${process.pid}.db`);
  const firstMigration = fs.readdirSync(migrationDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort()[0];
  const firstMigrationFile = path.join(migrationDir, firstMigration, "migration.sql");
  const firstMigrationChecksum = crypto.createHash("sha256").update(fs.readFileSync(firstMigrationFile)).digest("hex");
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE "ScratchV46" ("id" INTEGER PRIMARY KEY);
    CREATE TABLE "_prisma_migrations" (
      "id" TEXT PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL
    );
  `);
  database.prepare('INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "rolled_back_at", "started_at") VALUES (?, ?, ?, ?, NULL, ?)')
    .run("v46-corrupt-prefix", firstMigrationChecksum, "2026-08-13T00:00:00.000Z", firstMigration, "2026-08-13T00:00:00.000Z");
  database.close();
  try {
    await assert.rejects(
      runGate({
        mode: "pre-migration",
        env: { ...process.env, DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}` },
        schemaPath: path.join(backendDir, "prisma", "schema.prisma"),
        migrationDir,
        migrationName: latestMigration,
      }),
      { code: "TENANT_GATE_SCHEMA_EMPTY" },
    );
  } finally {
    removeDatabase(databasePath);
  }
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
        sqliteMigrationDir: fixtureDir,
        migrationName: futureName,
      }),
      (error) => error.code === "TENANT_GATE_MIGRATION_UNREGISTERED",
    );
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("architecture sem flags valida os dois pacotes canonicos", async () => {
  const result = await runGate({ mode: "architecture" });
  assert.equal(result.safe, true);
  assert.equal(result.migration.migrationName, latestMigration);
  assert.equal(result.migration.relationAffecting, false);
  assert.equal(result.migration.providers.sqlite.migrationName, latestMigration);
  assert.equal(result.migration.providers.sqlite.relationAffecting, false);
  assert.equal(result.migration.providers.postgresql.migrationName, latestMigration);
  assert.equal(result.migration.providers.postgresql.relationAffecting, false);
});

test("architecture rejeita migration-dir sem provider antes de confiar no hash", async () => {
  const fixtureDir = path.join(runDir, "tenant-gate-provider-unknown");
  try {
    fs.mkdirSync(path.join(fixtureDir, currentMigration), { recursive: true });
    const source = fs.readFileSync(path.join(migrationDir, currentMigration, "migration.sql"), "utf8");
    fs.writeFileSync(path.join(fixtureDir, currentMigration, "migration.sql"), `${source}\n-- drift em provider desconhecido`);
    await assert.rejects(
      runGate({
        mode: "architecture",
        schemaPath: path.join(backendDir, "prisma", "schema.prisma"),
        migrationDir: fixtureDir,
        migrationName: currentMigration,
      }),
      { code: "TENANT_GATE_MIGRATION_PROVIDER_UNKNOWN" },
    );
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("post-gate rejeita latest nao registrada para SQLite e PostgreSQL antes do banco", async () => {
  const fixtureDir = path.join(runDir, "tenant-gate-unregistered-latest");
  const futureName = "20990101000000_unregistered_latest";
  const schemaPath = path.join(backendDir, "prisma", "schema.prisma");
  try {
    fs.mkdirSync(path.join(fixtureDir, futureName), { recursive: true });
    fs.writeFileSync(
      path.join(fixtureDir, futureName, "migration.sql"),
      'CREATE TABLE "GateUnregisteredLatest" ("id" INTEGER PRIMARY KEY);\n',
    );
    await assert.rejects(
      runGate({
        mode: "post-migration",
        env: { ...process.env, DATABASE_URL: `file:${path.join(runDir, "not-opened.db").replace(/\\/g, "/")}` },
        schemaPath,
        sqliteMigrationDir: fixtureDir,
        migrationName: futureName,
      }),
      { code: "TENANT_GATE_MIGRATION_UNREGISTERED" },
    );
    await assert.rejects(
      runGate({
        mode: "post-migration",
        env: { ...process.env, POSTGRES_DATABASE_URL: "postgresql://127.0.0.1:1/not_opened", DATABASE_URL: "" },
        schemaPath,
        postgresMigrationDir: fixtureDir,
        migrationName: futureName,
      }),
      { code: "TENANT_GATE_MIGRATION_UNREGISTERED" },
    );
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("post-gate rejeita migration intermediaria nao registrada antes de latest registrada", async () => {
  const fixtureRoot = path.join(runDir, "tenant-gate-unregistered-middle");
  const middleName = "20260811125000_unregistered_middle";
  const postgresMigrations = path.join(backendDir, "prisma-postgres", "migrations");
  const schemaPath = path.join(backendDir, "prisma", "schema.prisma");
  try {
    for (const [provider, sourceRoot] of [["sqlite", migrationDir], ["postgresql", postgresMigrations]]) {
      const fixtureDir = path.join(fixtureRoot, provider);
      fs.mkdirSync(path.join(fixtureDir, middleName), { recursive: true });
      fs.writeFileSync(
        path.join(fixtureDir, middleName, "migration.sql"),
        'CREATE TABLE "GateUnregisteredMiddle" ("id" INTEGER PRIMARY KEY);\n',
      );
      fs.cpSync(
        path.join(sourceRoot, latestMigration),
        path.join(fixtureDir, latestMigration),
        { recursive: true },
      );
      const providerOptions = provider === "postgresql"
        ? {
          env: { ...process.env, POSTGRES_DATABASE_URL: "postgresql://127.0.0.1:1/not_opened", DATABASE_URL: "" },
          postgresMigrationDir: fixtureDir,
        }
        : {
          env: { ...process.env, DATABASE_URL: `file:${path.join(runDir, "not-opened-middle.db").replace(/\\/g, "/")}` },
          sqliteMigrationDir: fixtureDir,
        };
      await assert.rejects(
        runGate({
          mode: "post-migration",
          schemaPath,
          migrationName: latestMigration,
          ...providerOptions,
        }),
        { code: "TENANT_GATE_MIGRATION_UNREGISTERED" },
      );
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("post-gate reprova pacote canonico com migration ausente", async () => {
  const fixtureDir = path.join(runDir, "tenant-gate-missing-canonical-migration");
  try {
    fs.cpSync(migrationDir, fixtureDir, { recursive: true });
    fs.rmSync(path.join(fixtureDir, latestMigration), { recursive: true, force: true });
    const truncatedLatest = fs.readdirSync(fixtureDir, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort()
      .at(-1);
    await assert.rejects(
      runGate({
        mode: "post-migration",
        env: { ...process.env, DATABASE_URL: `file:${path.join(runDir, "not-opened-truncated.db").replace(/\\/g, "/")}` },
        schemaPath: path.join(backendDir, "prisma", "schema.prisma"),
        sqliteMigrationDir: fixtureDir,
        migrationName: truncatedLatest,
      }),
      { code: "TENANT_GATE_MIGRATION_SET_MISMATCH" },
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
        migrationName: latestMigration,
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

test("production-readonly sem flags resolve o diretorio PostgreSQL canonico", async () => {
  await assert.rejects(
    runGate({
      mode: "production-readonly",
      env: {
        ...process.env,
        POSTGRES_DATABASE_URL: "postgresql://127.0.0.1:1/v46_no_connection",
        DATABASE_URL: "",
      },
    }),
    (error) => error.code !== "TENANT_GATE_MIGRATION_HISTORY_UNKNOWN",
  );
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
