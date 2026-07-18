const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");

const backendDir = path.resolve(__dirname, "..");
const auditDir = path.join(requiredEnv("CRM_PRISMA_TEST_RUN_DIR"), "whatsapp-f1a1-migration");
const sourceDatabase = path.join(auditDir, `source-${process.pid}.db`);
const emptyDatabase = path.join(auditDir, `empty-${process.pid}.db`);
const copiedDatabase = path.join(auditDir, `copy-${process.pid}.db`);
const prismaCli = path.join(backendDir, "node_modules", "prisma", "build", "index.js");
const migrationDir = path.join(
  backendDir,
  "prisma",
  "migrations",
  "20260718184500_add_whatsapp_integration_foundation",
);
const newColumns = [
  "accessTokenRef",
  "connectedAt",
  "credentialStatus",
  "displayPhoneMasked",
  "graphApiVersion",
  "lastFailureAt",
  "lastFailureCode",
  "lastWebhookAt",
  "metaAppId",
  "metaBusinessId",
  "onboardingMethod",
  "phoneNumberId",
  "providerEnvironment",
  "qualityRating",
  "verifiedAt",
  "verifiedDisplayName",
  "wabaId",
];
let sourceCounts;

before(async () => {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.copyFileSync(requiredEnv("CRM_TEST_SOURCE_DATABASE_PATH"), sourceDatabase);
  fs.writeFileSync(emptyDatabase, "");
  fs.copyFileSync(sourceDatabase, copiedDatabase);
  sourceCounts = await tableCounts(sourceDatabase);
  migrate(emptyDatabase);
  migrate(copiedDatabase);
});

after(() => {
  removeDatabase(emptyDatabase);
  removeDatabase(copiedDatabase);
  removeDatabase(sourceDatabase);
});

test("migration F1A-1 e aditiva, preserva dados e tem deploy idempotente", async () => {
  const sql = fs.readFileSync(path.join(migrationDir, "migration.sql"), "utf8");
  assert.doesNotMatch(sql, /(^|;)\s*(DROP|DELETE|UPDATE|INSERT)\s+/im);
  assert.doesNotMatch(sql, /CREATE\s+TABLE|RedefineTables|dev\.db/i);
  assert.equal((sql.match(/ADD COLUMN/gi) || []).length, 17);
  assert.equal((sql.match(/CREATE (?:UNIQUE )?INDEX/gi) || []).length, 3);

  const empty = clientFor(emptyDatabase);
  const copied = clientFor(copiedDatabase);
  try {
    for (const prisma of [empty, copied]) {
      assert.deepEqual(await integrity(prisma), { quickCheck: "ok", foreignKeyViolations: 0 });
      const migrations = await prisma.$queryRawUnsafe(
        'SELECT COUNT(*) AS total FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
      );
      assert.equal(Number(migrations[0].total), 16);
      const columns = await prisma.$queryRawUnsafe('PRAGMA table_info("CanalIntegracao")');
      for (const field of newColumns) {
        const column = columns.find((item) => item.name === field);
        assert.ok(column, `coluna ausente: ${field}`);
        assert.equal(Number(column.notnull), 0, `coluna obrigatoria: ${field}`);
      }
      const indexes = await prisma.$queryRawUnsafe('PRAGMA index_list("CanalIntegracao")');
      assert.ok(indexes.some((item) => item.name === "CanalIntegracao_empresaId_tipo_ativo_idx"));
      assert.ok(indexes.some((item) => item.name === "CanalIntegracao_empresaId_tipo_wabaId_idx"));
      assert.ok(indexes.some((item) => item.name === "CanalIntegracao_tipo_providerEnvironment_metaAppId_phoneNumberId_key" && Number(item.unique) === 1));
    }

    const migratedCounts = await tableCounts(copiedDatabase);
    for (const [table, count] of Object.entries(sourceCounts)) {
      assert.equal(migratedCounts[table], count, `contagem alterada: ${table}`);
    }
    const existingChannels = await copied.canalIntegracao.count();
    const changedLegacyChannels = await copied.canalIntegracao.count({
      where: { OR: newColumns.map((field) => ({ [field]: { not: null } })) },
    });
    assert.equal(changedLegacyChannels, 0);
    assert.ok(existingChannels >= 0);
  } finally {
    await empty.$disconnect();
    await copied.$disconnect();
  }

  const beforeReplay = fingerprint(copiedDatabase);
  migrate(copiedDatabase);
  assert.equal(fingerprint(copiedDatabase), beforeReplay);
});

function migrate(databasePath) {
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl(databasePath),
      CRM_TEST_DATABASE_URL: databaseUrl(databasePath),
    },
    stdio: "pipe",
  });
}

function clientFor(databasePath) {
  return new PrismaClient({ datasourceUrl: databaseUrl(databasePath) });
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

function fingerprint(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function databaseUrl(databasePath) {
  return `file:${databasePath.replace(/\\/g, "/")}`;
}

function requiredEnv(name) {
  if (!process.env[name]) throw new Error(`${name} deve ser definido pelo supervisor de testes.`);
  return process.env[name];
}

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}
