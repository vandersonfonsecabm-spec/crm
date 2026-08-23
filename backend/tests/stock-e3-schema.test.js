const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const sqlite = fs.readFileSync(path.join(root, "prisma/migrations/20260823200000_add_stock_rules_h8_projection/migration.sql"), "utf8");
const postgres = fs.readFileSync(path.join(root, "prisma-postgres/migrations/20260823200000_add_stock_rules_h8_projection/migration.sql"), "utf8");

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
    assert.match(sql, /\("empresaId", "produtoEstoqueId"\)/);
  }
});
