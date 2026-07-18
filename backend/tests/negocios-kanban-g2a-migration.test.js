const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");

const backendDir = path.resolve(__dirname, "..");
const auditDir = path.join(requiredEnv("CRM_PRISMA_TEST_RUN_DIR"), "g2a-migration");
const sourceDatabase = path.join(auditDir, `g2a-source-${process.pid}.db`);
const emptyDatabase = path.join(auditDir, `g2a-empty-${process.pid}.db`);
const copiedDatabase = path.join(auditDir, `g2a-copy-${process.pid}.db`);
const prismaCli = path.join(backendDir, "node_modules", "prisma", "build", "index.js");
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

test("migration G2A e aditiva, replayable e nao executa backfill", async () => {
  const empty = clientFor(emptyDatabase);
  const copied = clientFor(copiedDatabase);
  try {
    const sql = fs.readFileSync(path.join(
      backendDir,
      "prisma",
      "migrations",
      "20260718140000_add_negocios_kanban_g2a",
      "migration.sql",
    ), "utf8");
    assert.doesNotMatch(sql, /(^|;)\s*(DROP|DELETE|UPDATE|INSERT)\s+/im);
    assert.doesNotMatch(sql, /CREATE\s+TABLE|RedefineTables/i);
    assert.equal((sql.match(/ADD COLUMN/gi) || []).length, 1);

    const columns = await empty.$queryRawUnsafe('PRAGMA table_info("Negocio")');
    assert.ok(columns.some((column) => column.name === "legacyClienteId" && Number(column.notnull) === 0));
    const indexes = await empty.$queryRawUnsafe('PRAGMA index_list("Negocio")');
    assert.ok(indexes.some((index) => index.name === "Negocio_legacyClienteId_key" && Number(index.unique) === 1));
    assert.ok(indexes.some((index) => index.name === "Negocio_empresaId_legacyClienteId_idx"));

    const migratedCounts = await tableCounts(copiedDatabase);
    for (const [table, count] of Object.entries(sourceCounts)) {
      assert.equal(migratedCounts[table], count, `contagem alterada: ${table}`);
    }
    assert.equal(await copied.negocio.count(), sourceCounts.Negocio || 0);
    assert.deepEqual(await integrity(empty), { quickCheck: "ok", foreignKeyViolations: 0 });
    assert.deepEqual(await integrity(copied), { quickCheck: "ok", foreignKeyViolations: 0 });
  } finally {
    await empty.$disconnect();
    await copied.$disconnect();
  }
});

function migrate(databasePath) {
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: databaseUrl(databasePath), CRM_TEST_DATABASE_URL: databaseUrl(databasePath) },
    stdio: "pipe",
  });
}

function clientFor(databasePath) {
  return new PrismaClient({ datasourceUrl: databaseUrl(databasePath) });
}

function requiredEnv(name) {
  if (!process.env[name]) throw new Error(`${name} deve ser definido pelo supervisor de testes.`);
  return process.env[name];
}

function databaseUrl(databasePath) {
  return `file:${databasePath.replace(/\\/g, "/")}`;
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

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}
