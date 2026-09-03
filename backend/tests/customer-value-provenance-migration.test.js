const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { test } = require("node:test");

const runDir = process.env.CRM_PRISMA_TEST_RUN_DIR;
if (!runDir) throw new Error("customer-value-provenance-migration.test.js exige a sandbox oficial do Prisma.");

const backendDir = path.resolve(__dirname, "..");
const migrationPath = path.join(
  backendDir,
  "prisma",
  "migrations",
  "20260903050000_add_cliente_value_provenance",
  "migration.sql",
);

test("migration SQLite preserva zero legado como desconhecido e valor nao-zero como informado", () => {
  const databasePath = path.join(runDir, `customer-value-provenance-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(`
      CREATE TABLE "Cliente" (
        "id" INTEGER PRIMARY KEY,
        "valor" INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO "Cliente" ("id", "valor") VALUES (1, 0), (2, 7500);
    `);
    database.exec(fs.readFileSync(migrationPath, "utf8"));
    const rows = database.prepare('SELECT "id", "valor", "valorInformado" FROM "Cliente" ORDER BY "id"').all()
      .map((row) => ({ id: row.id, valor: row.valor, valorInformado: row.valorInformado }));
    assert.deepEqual(rows, [
      { id: 1, valor: 0, valorInformado: 0 },
      { id: 2, valor: 7500, valorInformado: 1 },
    ]);
  } finally {
    database.close();
    fs.rmSync(databasePath, { force: true });
  }
});
