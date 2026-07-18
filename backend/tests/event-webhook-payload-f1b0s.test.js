const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const { createSiteLeadService } = require("../src/site-leads/service");

const backendDir = path.resolve(__dirname, "..");
const runDir = requiredEnv("CRM_PRISMA_TEST_RUN_DIR");
const auditDir = path.join(runDir, "event-webhook-payload-f1b0s");
const emptyDatabase = path.join(auditDir, "empty.db");
const representativeDatabase = path.join(auditDir, "representative.db");
const siteDatabase = path.join(auditDir, "site.db");
const previousPrismaDir = path.join(auditDir, "previous-prisma");
const previousSchema = path.join(previousPrismaDir, "schema.prisma");
const prismaCli = resolvePrismaCli();
const migrationName = "20260718205500_add_event_webhook_atomic_payload";
const migrationDir = path.join(backendDir, "prisma", "migrations", migrationName);
let legacyBefore;
let countsBefore;
let replayFingerprint;

before(async () => {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.writeFileSync(emptyDatabase, "");
  migrate(emptyDatabase);

  preparePreviousSchema();
  fs.writeFileSync(representativeDatabase, "");
  migrate(representativeDatabase, previousSchema);
  await createLegacyEvent(representativeDatabase);
  legacyBefore = await readLegacyEvent(representativeDatabase, false);
  countsBefore = await tableCounts(representativeDatabase);
  assert.equal(await migrationCount(representativeDatabase), 16);

  migrate(representativeDatabase);
  replayFingerprint = fingerprint(representativeDatabase);
  migrate(representativeDatabase);

  fs.copyFileSync(emptyDatabase, siteDatabase);
});

after(() => {
  for (const database of [emptyDatabase, representativeDatabase, siteDatabase]) removeDatabase(database);
});

test("migration adiciona somente payloadJson opcional", async () => {
  const sql = fs.readFileSync(path.join(migrationDir, "migration.sql"), "utf8");
  assert.match(sql, /^\s*-- AlterTable\s+ALTER TABLE "EventoWebhook" ADD COLUMN "payloadJson" TEXT;\s*$/);
  assert.doesNotMatch(sql, /\b(DROP|UPDATE|DELETE|INSERT|CREATE\s+(?:UNIQUE\s+)?INDEX|RedefineTables|dev\.db)\b/i);

  const prisma = clientFor(emptyDatabase);
  try {
    const columns = await prisma.$queryRawUnsafe('PRAGMA table_info("EventoWebhook")');
    const payloadJson = columns.find((column) => column.name === "payloadJson");
    assert.ok(payloadJson);
    assert.equal(payloadJson.type, "TEXT");
    assert.equal(Number(payloadJson.notnull), 0);
    assert.equal(payloadJson.dflt_value, null);
    assert.equal(await prisma.eventoWebhook.count(), 0);
    assert.deepEqual(await integrity(prisma), { quickCheck: "ok", foreignKeyViolations: 0 });
    assert.equal(await migrationCount(emptyDatabase), 17);
  } finally {
    await prisma.$disconnect();
  }
});

test("evento Site legado permanece identico e payloadJson inicia nulo", async () => {
  const legacyAfter = await readLegacyEvent(representativeDatabase, true);
  const { payloadJson, ...legacyWithoutPayload } = legacyAfter;
  assert.deepEqual(legacyWithoutPayload, legacyBefore);
  assert.equal(payloadJson, null);
  assert.deepEqual(await tableCounts(representativeDatabase), countsBefore);
  assert.equal(await migrationCount(representativeDatabase), 17);

  const prisma = clientFor(representativeDatabase);
  try {
    assert.deepEqual(await integrity(prisma), { quickCheck: "ok", foreignKeyViolations: 0 });
  } finally {
    await prisma.$disconnect();
  }
  assert.equal(fingerprint(representativeDatabase), replayFingerprint);
});

test("fluxo Site continua sem preencher payloadJson", async () => {
  const prisma = clientFor(siteDatabase);
  try {
    const empresa = await prisma.empresa.create({
      data: { nome: "Empresa Site F1B0S", slug: "empresa-site-f1b0s" },
    });
    const integration = await prisma.canalIntegracao.create({
      data: {
        empresaId: empresa.id,
        tipo: "SITE_FORM",
        nome: "Site F1B0S",
        chaveInterna: "site-f1b0s",
        status: "ATIVO",
        modoTeste: true,
        ativo: true,
      },
    });
    const service = createSiteLeadService({ prisma });
    const submissionId = crypto.randomUUID();
    const payload = {
      submissionId,
      nome: "Visitante F1B0S",
      email: "visitante-f1b0s@example.test",
      mensagem: "Interesse ficticio.",
      aceitePoliticaPrivacidade: true,
      versaoPoliticaPrivacidade: "f1b0s-v1",
    };

    assert.deepEqual(await service.capture(integration, payload), {
      accepted: true,
      submissionId,
      idempotent: false,
    });
    const event = await prisma.eventoWebhook.findFirstOrThrow({
      where: { canalIntegracaoId: integration.id, externalEventId: submissionId },
    });
    assert.equal(event.payloadJson, null);
    assert.match(event.payloadHash, /^[0-9a-f]{64}$/);
    assert.equal(event.provedor, "SITE_FORM");
    assert.equal(event.statusProcessamento, "PROCESSADO");

    assert.deepEqual(await service.capture(integration, payload), {
      accepted: true,
      submissionId,
      idempotent: true,
    });
    assert.equal(await prisma.eventoWebhook.count({
      where: { canalIntegracaoId: integration.id, externalEventId: submissionId },
    }), 1);
  } finally {
    await prisma.$disconnect();
  }
});

function preparePreviousSchema() {
  fs.mkdirSync(path.join(previousPrismaDir, "migrations"), { recursive: true });
  fs.copyFileSync(path.join(backendDir, "prisma", "schema.prisma"), previousSchema);
  const migrationsDir = path.join(backendDir, "prisma", "migrations");
  for (const entry of fs.readdirSync(migrationsDir, { withFileTypes: true })) {
    if (entry.name === migrationName) continue;
    const source = path.join(migrationsDir, entry.name);
    const target = path.join(previousPrismaDir, "migrations", entry.name);
    if (entry.isDirectory()) fs.cpSync(source, target, { recursive: true });
    else fs.copyFileSync(source, target);
  }
}

async function createLegacyEvent(databasePath) {
  const prisma = clientFor(databasePath);
  try {
    await prisma.$executeRawUnsafe(
      'INSERT INTO "Empresa" ("nome","slug","ativo","createdAt","updatedAt") VALUES (?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
      "Empresa legado F1B0S",
      "empresa-legado-f1b0s",
    );
    const empresa = await prisma.$queryRawUnsafe('SELECT "id" FROM "Empresa" WHERE "slug" = ?', "empresa-legado-f1b0s");
    await prisma.$executeRawUnsafe(
      'INSERT INTO "CanalIntegracao" ("empresaId","tipo","nome","chaveInterna","configuracaoJson","status","modoTeste","ativo","createdAt","updatedAt") VALUES (?,?,?,?,?,"ATIVO",1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
      Number(empresa[0].id),
      "SITE_FORM",
      "Site legado F1B0S",
      "site-legado-f1b0s",
      "{}",
    );
    const channel = await prisma.$queryRawUnsafe(
      'SELECT "id" FROM "CanalIntegracao" WHERE "chaveInterna" = ?',
      "site-legado-f1b0s",
    );
    await prisma.$executeRawUnsafe(
      'INSERT INTO "EventoWebhook" ("empresaId","canalIntegracaoId","provedor","externalEventId","tipoEvento","payloadHash","statusProcessamento","tentativas","recebidoEm","processadoEm","createdAt","updatedAt") VALUES (?,?,?,?,?,?,"PROCESSADO",1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
      Number(empresa[0].id),
      Number(channel[0].id),
      "SITE_FORM",
      "submission-legado-f1b0s",
      "SITE_LEAD_SUBMITTED",
      "a".repeat(64),
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function readLegacyEvent(databasePath, includePayloadJson) {
  const prisma = clientFor(databasePath);
  try {
    const payloadColumn = includePayloadJson ? ',"payloadJson"' : "";
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "empresaId","canalIntegracaoId","provedor","externalEventId","tipoEvento","payloadHash","statusProcessamento","tentativas","recebidoEm","processadoEm","createdAt","updatedAt"${payloadColumn} FROM "EventoWebhook" WHERE "externalEventId" = ?`,
      "submission-legado-f1b0s",
    );
    return rows[0];
  } finally {
    await prisma.$disconnect();
  }
}

async function tableCounts(databasePath) {
  const prisma = clientFor(databasePath);
  try {
    const tables = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' ORDER BY name",
    );
    const counts = {};
    for (const { name } of tables) {
      const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS total FROM "${name}"`);
      counts[name] = Number(rows[0].total);
    }
    return counts;
  } finally {
    await prisma.$disconnect();
  }
}

async function integrity(prisma) {
  const quick = await prisma.$queryRawUnsafe("PRAGMA quick_check");
  const foreignKeys = await prisma.$queryRawUnsafe("PRAGMA foreign_key_check");
  return { quickCheck: quick[0].quick_check, foreignKeyViolations: foreignKeys.length };
}

async function migrationCount(databasePath) {
  const prisma = clientFor(databasePath);
  try {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT COUNT(*) AS total FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    );
    return Number(rows[0].total);
  } finally {
    await prisma.$disconnect();
  }
}

function migrate(databasePath, schemaPath) {
  execFileSync(process.execPath, [
    prismaCli,
    "migrate",
    "deploy",
    ...(schemaPath ? ["--schema", schemaPath] : []),
  ], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl(databasePath),
      CRM_TEST_DATABASE_URL: databaseUrl(databasePath),
    },
    stdio: "pipe",
    windowsHide: true,
    shell: false,
  });
}

function clientFor(databasePath) {
  return new PrismaClient({ datasourceUrl: databaseUrl(databasePath) });
}

function fingerprint(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function databaseUrl(databasePath) {
  return `file:${path.resolve(databasePath).replace(/\\/g, "/")}`;
}

function requiredEnv(name) {
  if (!process.env[name]) throw new Error(`${name} deve ser definido pelo supervisor de testes.`);
  return process.env[name];
}

function resolvePrismaCli() {
  const packageJsonPath = require.resolve("prisma/package.json", { paths: [backendDir] });
  const prismaPackage = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const relativeBin = typeof prismaPackage.bin === "string"
    ? prismaPackage.bin
    : prismaPackage.bin?.prisma;
  if (!relativeBin) throw new Error("Prisma local nao declara o binario prisma.");
  const cliPath = path.resolve(path.dirname(packageJsonPath), relativeBin);
  if (!fs.existsSync(cliPath) || !fs.statSync(cliPath).isFile()) {
    throw new Error("Binario local do Prisma nao foi encontrado.");
  }
  return cliPath;
}

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}
