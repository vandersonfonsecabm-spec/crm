const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");

const backendDir = path.resolve(__dirname, "..");
const auditDir = path.join(os.tmpdir(), "crm-leads-collaboration-b2");
const emptyDatabase = path.join(auditDir, `migration-empty-${process.pid}.db`);
const copiedDatabase = path.join(auditDir, `migration-copy-${process.pid}.db`);
const sourceDatabase = path.join(backendDir, "prisma", "dev.db");
const prismaCli = path.join(backendDir, "node_modules", "prisma", "build", "index.js");

let sourceCounts;

before(async () => {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.writeFileSync(emptyDatabase, "");
  fs.copyFileSync(sourceDatabase, copiedDatabase);
  sourceCounts = await legacyCounts(sourceDatabase);
  migrate(emptyDatabase);
  migrate(copiedDatabase);
});

after(() => {
  removeDatabase(emptyDatabase);
  removeDatabase(copiedDatabase);
});

test("migration B2 e aditiva, preserva dados e cria controles colaborativos opcionais", async () => {
  const empty = clientFor(emptyDatabase);
  const copied = clientFor(copiedDatabase);
  try {
    const sql = fs.readFileSync(path.join(backendDir, "prisma", "migrations", "20260716185853_add_collaborative_reply_controls_b2", "migration.sql"), "utf8");
    assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN)/i);
    assert.doesNotMatch(sql, /CREATE TABLE/i);
    assert.equal((sql.match(/ADD COLUMN/gi) || []).length, 3);

    const conversationColumns = await empty.$queryRawUnsafe('PRAGMA table_info("ConversaCanal")');
    const messageColumns = await empty.$queryRawUnsafe('PRAGMA table_info("MensagemCanal")');
    assert.ok(conversationColumns.some((column) => column.name === "respostaReservadaPorId" && Number(column.notnull) === 0));
    assert.ok(conversationColumns.some((column) => column.name === "respostaReservadaAte" && Number(column.notnull) === 0));
    assert.ok(messageColumns.some((column) => column.name === "autorUsuarioId" && Number(column.notnull) === 0));

    const indexes = await empty.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type = 'index'");
    const indexNames = new Set(indexes.map(({ name }) => name));
    for (const name of [
      "ConversaCanal_empresaId_respostaReservadaPorId_idx",
      "ConversaCanal_empresaId_respostaReservadaAte_idx",
      "MensagemCanal_empresaId_conversaCanalId_autorUsuarioId_idx",
    ]) assert.ok(indexNames.has(name), `indice ausente: ${name}`);

    const migratedCounts = await legacyCounts(copiedDatabase);
    for (const [table, count] of Object.entries(sourceCounts)) assert.equal(migratedCounts[table], count, `contagem alterada: ${table}`);
    assert.deepEqual(await integrity(empty), { quickCheck: "ok", foreignKeyViolations: 0 });
    assert.deepEqual(await integrity(copied), { quickCheck: "ok", foreignKeyViolations: 0 });
    assert.equal(await copied.mensagemCanal.count({ where: { autorUsuarioId: { not: null } } }), 0);
    assert.equal(await copied.conversaCanal.count({ where: { respostaReservadaPorId: { not: null } } }), 0);
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

async function legacyCounts(databasePath) {
  const prisma = clientFor(databasePath);
  try {
    const tables = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' ORDER BY name",
    );
    const result = {};
    for (const { name } of tables) {
      const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS total FROM \"${name}\"`);
      result[name] = Number(rows[0].total);
    }
    return result;
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
