const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const sqlite = fs.readFileSync(path.join(root, "prisma/migrations/20260823200000_add_stock_rules_h8_projection/migration.sql"), "utf8");
const postgres = fs.readFileSync(path.join(root, "prisma-postgres/migrations/20260823200000_add_stock_rules_h8_projection/migration.sql"), "utf8");
const postgresEnumFix = fs.readFileSync(path.join(root, "prisma-postgres/migrations/20260824120000_fix_stock_postgres_enum_types/migration.sql"), "utf8");

test("E3 migration is additive, mirrored and keeps the existing H8 center", () => {
  for (const sql of [sqlite, postgres]) {
    assert.match(sql, /ConfiguracaoRegraEstoque/);
    assert.match(sql, /OverrideEstoque/);
    assert.match(sql, /AvaliacaoRegraEstoque/);
    assert.match(sql, /ALTER TABLE "Notificacao" ADD COLUMN "stockTargetType"/);
    assert.doesNotMatch(sql, /^\s*(?:DROP|DELETE|UPDATE|TRUNCATE)\b/im);
  }
  assert.match(sqlite, /AUTOINCREMENT/);
  assert.match(postgres, /SERIAL/);
  assert.match(postgres, /BEGIN;/);
  assert.match(postgres, /COMMIT;/);
});

test("E3 evaluation FKs are composite tenant-scoped", () => {
  for (const sql of [sqlite, postgres]) {
    assert.match(sql, /AvaliacaoRegraEstoque_empresaId_produtoEstoqueId_fkey/);
    assert.match(sql, /AvaliacaoRegraEstoque_empresaId_loteEstoqueId_fkey/);
    assert.match(sql, /AvaliacaoRegraEstoque_empresaId_localEstoqueId_fkey/);
    assert.match(sql, /AvaliacaoRegraEstoque_empresaId_sourceConnectionId_fkey/);
    assert.match(sql, /\("empresaId", "produtoEstoqueId"\)/);
  }
});

test("PostgreSQL corrective migration aligns stock enum columns with Prisma", () => {
  assert.match(postgresEnumFix, /CREATE TYPE "StockSourceType" AS ENUM/);
  assert.match(postgresEnumFix, /CREATE TYPE "StockImportStatus" AS ENUM/);
  assert.match(postgresEnumFix, /ALTER COLUMN "tipoFonte" TYPE "StockSourceType"/);
  assert.match(postgresEnumFix, /ALTER COLUMN "status" TYPE "StockOutboxStatus"/);
  assert.match(postgresEnumFix, /stock_lot_validade_precision_ck/);
  assert.match(postgresEnumFix, /stock_import_active_file_uq/);
  assert.match(postgresEnumFix, /^BEGIN;\s*$/m);
  assert.match(postgresEnumFix, /COMMIT;\s*$/m);
});
