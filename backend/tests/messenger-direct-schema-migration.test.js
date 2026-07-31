const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const {
  copyMigrationsBefore,
  copyTargetMigration,
} = require("./fixtures/migration-sandbox");

const backendDir = path.resolve(__dirname, "..");
const migrationName = "20260731120000_add_messenger_direct_schema_foundation";
const auditDir = path.join(
  requiredEnv("CRM_PRISMA_TEST_RUN_DIR"),
  "messenger-direct-schema-migration",
);
const databasePath = path.join(auditDir, `upgrade-${process.pid}.db`);
const targetPrismaDir = path.join(auditDir, "prisma");
const targetSchema = path.join(targetPrismaDir, "schema.prisma");
const prismaCli = path.join(backendDir, "node_modules", "prisma", "build", "index.js");
let beforeCounts;

before(async () => {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.copyFileSync(requiredEnv("CRM_TEST_SOURCE_DATABASE_PATH"), databasePath);
  beforeCounts = await tableCounts(databasePath);
  prepareTargetSchema();
  migrate(databasePath);
});

after(() => {
  removeDatabase(databasePath);
});

test("migration Messenger e aditiva e preserva dados SQLite existentes", async () => {
  const sql = fs.readFileSync(path.join(
    backendDir,
    "prisma",
    "migrations",
    migrationName,
    "migration.sql",
  ), "utf8");
  assert.doesNotMatch(sql, /\b(?:DROP|DELETE|UPDATE|INSERT|TRUNCATE)\b/i);
  assert.equal((sql.match(/ADD COLUMN/gi) || []).length, 2);
  assert.equal((sql.match(/CREATE UNIQUE INDEX/gi) || []).length, 1);

  const prisma = clientFor(databasePath);
  try {
    const columns = await prisma.$queryRawUnsafe('PRAGMA table_info("CanalIntegracao")');
    for (const field of [
      "messengerPageId",
      "messengerPageNameMasked",
    ]) {
      const column = columns.find((item) => item.name === field);
      assert.ok(column, field);
      assert.equal(Number(column.notnull), 0, field);
    }
    const indexes = await prisma.$queryRawUnsafe('PRAGMA index_list("CanalIntegracao")');
    assert.ok(indexes.some((item) => (
      item.name === "CanalIntegracao_messengerPageId_key"
      && Number(item.unique) === 1
    )));
    const quick = await prisma.$queryRawUnsafe("PRAGMA quick_check");
    const foreignKeys = await prisma.$queryRawUnsafe("PRAGMA foreign_key_check");
    assert.equal(quick[0].quick_check, "ok");
    assert.equal(foreignKeys.length, 0);
  } finally {
    await prisma.$disconnect();
  }

  const afterCounts = await tableCounts(databasePath);
  for (const [table, count] of Object.entries(beforeCounts)) {
    assert.equal(afterCounts[table], count, table);
  }
});

function prepareTargetSchema() {
  fs.mkdirSync(targetPrismaDir, { recursive: true });
  fs.copyFileSync(path.join(backendDir, "prisma", "schema.prisma"), targetSchema);
  const migrationsDir = path.join(targetPrismaDir, "migrations");
  copyMigrationsBefore({ backendDir, migrationsDir, migrationName });
  copyTargetMigration({ backendDir, migrationsDir, migrationName });
}

function migrate(file) {
  execFileSync(process.execPath, [
    prismaCli,
    "migrate",
    "deploy",
    "--schema",
    targetSchema,
  ], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl(file),
      CRM_TEST_DATABASE_URL: databaseUrl(file),
    },
    stdio: "pipe",
  });
}

async function tableCounts(file) {
  const prisma = clientFor(file);
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

function clientFor(file) {
  return new PrismaClient({ datasourceUrl: databaseUrl(file) });
}

function databaseUrl(file) {
  return `file:${path.resolve(file).replace(/\\/g, "/")}`;
}

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} deve ser definido pelo supervisor de testes.`);
  return value;
}
