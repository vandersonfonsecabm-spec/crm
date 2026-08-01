const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const { test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const { copyMigrationsBefore, copyTargetMigration } = require("./fixtures/migration-sandbox");

const backendDir = path.resolve(__dirname, "..");
const migrationName = "20260801123000_enforce_tenant_safe_relations";
const runDir = requiredEnv("CRM_PRISMA_TEST_RUN_DIR");
const prismaCli = path.join(backendDir, "node_modules", "prisma", "build", "index.js");

test("upgrade preserva fixture tenant valida e aplica constraints compostas", async () => {
  const sandbox = prepareSandbox("valid");
  try {
    runPrisma(sandbox, true);
    const prisma = clientFor(sandbox.databasePath);
    const fixture = await seedRepresentativeFixture(prisma, false);
    const before = await fixtureFingerprint(prisma, fixture);
    await prisma.$disconnect();

    copyTargetMigration({ backendDir, migrationsDir: sandbox.migrationsDir, migrationName });
    runPrisma(sandbox, true);

    const migrated = clientFor(sandbox.databasePath);
    try {
      assert.equal(await fixtureFingerprint(migrated, fixture), before);
      assert.equal((await migrated.$queryRawUnsafe("PRAGMA foreign_key_check")).length, 0);
      assert.equal((await migrated.$queryRawUnsafe("PRAGMA quick_check"))[0].quick_check, "ok");
    } finally {
      await migrated.$disconnect();
    }
  } finally {
    fs.rmSync(sandbox.root, { recursive: true, force: true });
  }
});

test("preflight rejeita vinculo cruzado antes de qualquer rebuild", async () => {
  const sandbox = prepareSandbox("invalid");
  try {
    runPrisma(sandbox, true);
    const prisma = clientFor(sandbox.databasePath);
    const fixture = await seedRepresentativeFixture(prisma, true);
    await prisma.$disconnect();
    const before = databaseFingerprint(sandbox.databasePath);

    copyTargetMigration({ backendDir, migrationsDir: sandbox.migrationsDir, migrationName });
    const result = runPrisma(sandbox, false);
    assert.notEqual(result.status, 0);

    const database = new DatabaseSync(sandbox.databasePath, { readOnly: true });
    try {
      assert.equal(Number(database.prepare('SELECT COUNT(*) AS total FROM "Lead" WHERE "id" = ?').get(fixture.lead.id).total), 1);
      assert.equal(Number(database.prepare('SELECT COUNT(*) AS total FROM "Cliente" WHERE "id" = ?').get(fixture.clientB.id).total), 1);
      assert.equal(database.prepare('SELECT "clienteId" FROM "Lead" WHERE "id" = ?').get(fixture.lead.id).clienteId, fixture.clientB.id);
      assert.equal(Number(database.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name LIKE 'new_%'").get().total), 0);
      assert.equal(database.prepare("PRAGMA quick_check").get().quick_check, "ok");
    } finally {
      database.close();
    }
    assert.equal(dataFingerprint(sandbox.databasePath), before.data);
    assert.equal(schemaFingerprint(sandbox.databasePath), before.schema);
  } finally {
    fs.rmSync(sandbox.root, { recursive: true, force: true });
  }
});

function prepareSandbox(label) {
  const root = path.join(runDir, `tenant-isolation-migration-${label}-${process.pid}`);
  const prismaDir = path.join(root, "prisma");
  const migrationsDir = path.join(prismaDir, "migrations");
  const schemaPath = path.join(prismaDir, "schema.prisma");
  const databasePath = path.join(prismaDir, "test.db");
  fs.mkdirSync(prismaDir, { recursive: true });
  fs.copyFileSync(path.join(backendDir, "prisma", "schema.prisma"), schemaPath);
  copyMigrationsBefore({ backendDir, migrationsDir, migrationName });
  fs.writeFileSync(databasePath, "");
  return { root, migrationsDir, schemaPath, databasePath };
}

function runPrisma(sandbox, requireSuccess) {
  const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", sandbox.schemaPath], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: databaseUrl(sandbox.databasePath), CRM_TEST_DATABASE_URL: databaseUrl(sandbox.databasePath) },
    stdio: "pipe",
    windowsHide: true,
    shell: false,
  });
  if (requireSuccess && (result.error || result.status !== 0)) {
    throw new Error(`Prisma migrate deploy falhou com codigo ${result.status ?? "SPAWN"}.`);
  }
  return result;
}

async function seedRepresentativeFixture(prisma, crossTenant) {
  const tenantA = await prisma.empresa.create({ data: { nome: "Tenant migration A", slug: `tenant-migration-a-${process.pid}-${Date.now()}` } });
  const tenantB = await prisma.empresa.create({ data: { nome: "Tenant migration B", slug: `tenant-migration-b-${process.pid}-${Date.now()}` } });
  const userA = await prisma.usuario.create({ data: { empresaId: tenantA.id, nome: "User A", email: `migration-a-${Date.now()}@test.local`, senhaHash: "test" } });
  const clientA = await prisma.cliente.create({ data: { empresaId: tenantA.id, nome: "Client A" } });
  const clientB = await prisma.cliente.create({ data: { empresaId: tenantB.id, nome: "Client B" } });
  const lead = await prisma.lead.create({ data: { empresaId: tenantA.id, clienteId: crossTenant ? clientB.id : clientA.id, responsavelId: userA.id } });
  if (crossTenant) return { tenantA, tenantB, userA, clientA, clientB, lead };

  const business = await prisma.negocio.create({ data: { empresaId: tenantA.id, clienteId: clientA.id, leadId: lead.id, responsavelId: userA.id } });
  const integration = await prisma.integracao.create({ data: { empresaId: tenantA.id, nome: "Integration A", tipo: "BLING" } });
  const sync = await prisma.sincronizacaoIntegracao.create({ data: { empresaId: tenantA.id, integracaoId: integration.id } });
  const channel = await prisma.canalIntegracao.create({ data: { empresaId: tenantA.id, tipo: "SITE_FORM", nome: "Channel A", chaveInterna: `channel-a-${process.pid}-${Date.now()}` } });
  const contact = await prisma.contatoCanal.create({ data: { empresaId: tenantA.id, canalIntegracaoId: channel.id, clienteId: clientA.id, externalId: `contact-a-${process.pid}-${Date.now()}` } });
  const conversation = await prisma.conversaCanal.create({ data: { empresaId: tenantA.id, canalIntegracaoId: channel.id, contatoCanalId: contact.id, leadId: lead.id, responsavelId: userA.id } });
  const message = await prisma.mensagemCanal.create({ data: { empresaId: tenantA.id, canalIntegracaoId: channel.id, conversaCanalId: conversation.id, autorUsuarioId: userA.id, externalId: `message-a-${process.pid}-${Date.now()}`, direcao: "ENTRADA" } });
  return { tenantA, tenantB, userA, clientA, clientB, lead, business, integration, sync, channel, contact, conversation, message };
}

async function fixtureFingerprint(prisma, fixture) {
  const rows = await Promise.all([
    prisma.empresa.findMany({ where: { id: { in: [fixture.tenantA.id, fixture.tenantB.id] } }, orderBy: { id: "asc" } }),
    prisma.usuario.findMany({ where: { id: fixture.userA.id } }),
    prisma.cliente.findMany({ where: { id: { in: [fixture.clientA.id, fixture.clientB.id] } }, orderBy: { id: "asc" } }),
    prisma.lead.findMany({ where: { id: fixture.lead.id } }),
    prisma.negocio.findMany({ where: { id: fixture.business.id } }),
    prisma.integracao.findMany({ where: { id: fixture.integration.id } }),
    prisma.sincronizacaoIntegracao.findMany({ where: { id: fixture.sync.id } }),
    prisma.canalIntegracao.findMany({ where: { id: fixture.channel.id } }),
    prisma.contatoCanal.findMany({ where: { id: fixture.contact.id } }),
    prisma.conversaCanal.findMany({ where: { id: fixture.conversation.id } }),
    prisma.mensagemCanal.findMany({ where: { id: fixture.message.id } }),
  ]);
  return hash(JSON.stringify(rows, (_key, value) => typeof value === "bigint" ? value.toString() : value));
}

function databaseFingerprint(file) {
  return { data: dataFingerprint(file), schema: schemaFingerprint(file) };
}

function dataFingerprint(file) {
  const database = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = database.prepare('SELECT "id", "empresaId", "clienteId", "responsavelId" FROM "Lead" ORDER BY "id"').all();
    return hash(JSON.stringify(rows));
  } finally {
    database.close();
  }
}

function schemaFingerprint(file) {
  const database = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = database.prepare("SELECT name, type, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' ORDER BY type, name").all();
    return hash(JSON.stringify(rows));
  } finally {
    database.close();
  }
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function clientFor(file) {
  return new PrismaClient({ datasourceUrl: databaseUrl(file) });
}

function databaseUrl(file) {
  return `file:${path.resolve(file).replace(/\\/g, "/")}`;
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value || !path.isAbsolute(value)) throw new Error(`${name} absoluto e obrigatorio.`);
  return value;
}
