const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");

const backendDir = path.resolve(__dirname, "..");
const auditDir = path.join(os.tmpdir(), "crm-release-g1");
const emptyDatabase = path.join(auditDir, `g1-empty-${process.pid}.db`);
const copiedDatabase = path.join(auditDir, `g1-copy-${process.pid}.db`);
const sourceDatabase = path.join(backendDir, "prisma", "dev.db");
const prismaCli = path.join(backendDir, "node_modules", "prisma", "build", "index.js");
let sourceCounts;

before(async () => {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.writeFileSync(emptyDatabase, "");
  fs.copyFileSync(sourceDatabase, copiedDatabase);
  sourceCounts = await tableCounts(sourceDatabase);
  migrate(emptyDatabase);
  migrate(copiedDatabase);
});

after(() => {
  removeDatabase(emptyDatabase);
  removeDatabase(copiedDatabase);
});

test("migration G1 e aditiva e garante um Negocio por Lead", async () => {
  const empty = clientFor(emptyDatabase);
  const copied = clientFor(copiedDatabase);
  try {
    const sql = fs.readFileSync(path.join(
      backendDir,
      "prisma",
      "migrations",
      "20260717100000_add_lead_to_negocio_conversion_g1",
      "migration.sql",
    ), "utf8");
    assert.doesNotMatch(sql, /(^|;)\s*(DROP|DELETE|UPDATE)\s+/im);
    assert.doesNotMatch(sql, /CREATE\s+TABLE/i);
    assert.equal((sql.match(/ADD COLUMN/gi) || []).length, 4);

    const columns = await empty.$queryRawUnsafe('PRAGMA table_info("Negocio")');
    for (const name of ["convertidoPorId", "statusLeadAnterior", "titulo", "observacao"]) {
      assert.ok(columns.some((column) => column.name === name && Number(column.notnull) === 0), `coluna opcional ausente: ${name}`);
    }
    const indexes = await empty.$queryRawUnsafe('PRAGMA index_list("Negocio")');
    const leadIndex = indexes.find((index) => index.name === "Negocio_leadId_key");
    assert.ok(leadIndex);
    assert.equal(Number(leadIndex.unique), 1);
    assert.ok(indexes.some((index) => index.name === "Negocio_empresaId_convertidoPorId_createdAt_idx"));

    const migratedCounts = await tableCounts(copiedDatabase);
    for (const [table, count] of Object.entries(sourceCounts)) {
      assert.equal(migratedCounts[table], count, `contagem alterada: ${table}`);
    }
    assert.equal(await copied.negocio.count(), 0);
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
    env: { ...process.env, DATABASE_URL: databaseUrl(databasePath) },
    stdio: "pipe",
  });
}

function clientFor(databasePath) {
  return new PrismaClient({ datasources: { db: { url: databaseUrl(databasePath) } } });
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
      const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS total FROM \"${name}\"`);
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
