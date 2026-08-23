const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const schemaPath = path.join(backendDir, "prisma", "schema.prisma");
const sqliteMigrationPath = path.join(backendDir, "prisma", "migrations", "20260823180000_add_stock_core_e2", "migration.sql");
const postgresMigrationPath = path.join(backendDir, "prisma-postgres", "migrations", "20260823180000_add_stock_core_e2", "migration.sql");
const runDir = requiredEnv("CRM_PRISMA_TEST_RUN_DIR");
const sourceDatabase = requiredEnv("CRM_TEST_BASE_DATABASE_PATH");
const testDatabase = path.join(runDir, `stock-core-e2-schema-${process.pid}.db`);

test.after(() => fs.rmSync(testDatabase, { force: true }));

test("E2 congela enums e campos portaveis de estoque", () => {
  const schema = fs.readFileSync(schemaPath, "utf8");
  for (const [name, values] of Object.entries({
    StockSourceType: ["INTERNAL", "GENERIC_API_PULL", "GENERIC_WEBHOOK_PUSH", "DATABASE_READONLY", "FILE_IMPORT_CSV", "FILE_IMPORT_XLSX", "MANUAL_CONTROLLED", "VENDOR_SPECIFIC"],
    StockSyncStatus: ["PENDING", "RUNNING", "SUCCEEDED", "PARTIAL", "RETRY_WAIT", "FAILED", "CANCELLED", "QUARANTINED", "SUPERSEDED"],
    StockImportStatus: ["PREVIEW", "READY", "PROCESSING", "APPLIED", "PARTIAL", "CANCELLED", "EXPIRED", "FAILED"],
    StockAuditActorType: ["USER", "SYSTEM"],
  })) {
    const block = enumBlock(schema, name);
    assert.deepEqual(enumValues(block), values);
  }
  assert.match(modelBlock(schema, "MapeamentoProdutoExterno"), /sourceProductId\s+String\b/);
  assert.doesNotMatch(modelBlock(schema, "MapeamentoProdutoExterno"), /sourceProductId\s+String\?/);
  assert.match(modelBlock(schema, "MapeamentoProdutoExterno"), /sourceVersion\s+String\b/);
  assert.doesNotMatch(modelBlock(schema, "MapeamentoProdutoExterno"), /sourceVersion\s+String\?/);
  assert.match(modelBlock(schema, "LoteEstoque"), /validadeEm\s+String\?/);
  assert.match(modelBlock(schema, "LoteEstoque"), /fonteId\s+Int\b/);
  assert.doesNotMatch(modelBlock(schema, "LoteEstoque"), /fonteId\s+Int\?/);
  assert.match(modelBlock(schema, "LocalEstoque"), /fonteId\s+Int\?/);
  assert.match(modelBlock(schema, "ObservacaoEstoque"), /sourceVersion\s+String\b/);
  assert.doesNotMatch(modelBlock(schema, "ObservacaoEstoque"), /sourceVersion\s+String\?/);
  assert.match(modelBlock(schema, "SaldoEstoque"), /onHand\s+Decimal/);
  assert.match(modelBlock(schema, "SaldoEstoque"), /sourceVersion\s+String\b/);
  assert.doesNotMatch(modelBlock(schema, "SaldoEstoque"), /sourceVersion\s+String\?/);
  assert.match(modelBlock(schema, "ObservacaoEstoque"), /syncRunId\s+Int\b/);
  assert.doesNotMatch(modelBlock(schema, "ObservacaoEstoque"), /syncRunId\s+Int\?/);
  assert.match(modelBlock(schema, "ProblemaQualidadeEstoque"), /fonteId\s+Int\b/);
  assert.doesNotMatch(modelBlock(schema, "ProblemaQualidadeEstoque"), /fonteId\s+Int\?/);
  assert.match(modelBlock(schema, "ProdutoEstoque"), /skuCanonicoConfirmado\s+Boolean\s+@default\(false\)/);
  assert.match(modelBlock(schema, "ProdutoEstoque"), /barcodeCanonicoConfirmado\s+Boolean\s+@default\(false\)/);
  assert.match(modelBlock(schema, "EventoAuditoriaEstoque"), /actorType\s+StockAuditActorType/);
  assert.match(modelBlock(schema, "EventoAuditoriaEstoque"), /actorSystemKey\s+String\?/);
  assert.match(modelBlock(schema, "ImportacaoEstoque"), /@@unique\(\[empresaId, idempotencyKey\]\)/);
  assert.doesNotMatch(modelBlock(schema, "ImportacaoEstoque"), /@@unique\(\[empresaId, fonteId, fileHash, schemaVersion\]\)/);
});

test("E2 declara os indices parciais e constraints iguais nos pacotes SQLite/PostgreSQL", () => {
  const sqlite = fs.readFileSync(sqliteMigrationPath, "utf8");
  const postgres = fs.readFileSync(postgresMigrationPath, "utf8");
  for (const name of [
    "stock_mapping_external_identity_uq",
    "stock_location_external_identity_uq",
    "stock_lot_external_identity_uq",
    "stock_lot_code_identity_uq",
    "stock_product_confirmed_sku_uq",
    "stock_product_confirmed_barcode_uq",
    "stock_balance_product_only_uq",
    "stock_balance_product_location_uq",
    "stock_balance_product_lot_uq",
    "stock_balance_product_lot_location_uq",
    "stock_import_active_file_uq",
    "stock_audit_actor_shape_ck",
    "stock_lot_validade_precision_ck",
  ]) {
    assert.match(sqlite, new RegExp(name));
    assert.match(postgres, new RegExp(name));
  }
  assert.match(sqlite, /"status" IN \('PREVIEW', 'READY', 'PROCESSING', 'APPLIED', 'PARTIAL'\)/);
  assert.match(postgres, /"validadeEm" ~ '\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\$'/);
  assert.doesNotMatch(sqlite, /^\s*(?:DROP|DELETE|TRUNCATE)\b/im);
  assert.doesNotMatch(postgres, /^\s*(?:DROP|DELETE|TRUNCATE)\b/im);
});

test("E2 aplica isolamento composto e invariantes de importacao apenas no sandbox", () => {
  fs.copyFileSync(sourceDatabase, testDatabase, fs.constants.COPYFILE_EXCL);
  const database = new DatabaseSync(testDatabase);
  try {
    database.exec("PRAGMA foreign_keys = ON");
    const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
    for (const table of [
      "FonteEstoque",
      "CapacidadeFonteEstoque",
      "ExecucaoSincronizacaoEstoque",
      "CheckpointSincronizacaoEstoque",
      "ProdutoEstoque",
      "MapeamentoProdutoExterno",
      "LocalEstoque",
      "LoteEstoque",
      "SaldoEstoque",
      "ObservacaoEstoque",
      "ProblemaQualidadeEstoque",
      "EventoAuditoriaEstoque",
      "EventoOutboxEstoque",
      "ImportacaoEstoque",
      "LinhaImportacaoEstoque",
    ]) assert.equal(tables.has(table), true, `${table} ausente`);

    const indexSql = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?");
    assert.match(indexSql.get("stock_import_active_file_uq").sql, /WHERE "status" IN \('PREVIEW', 'READY', 'PROCESSING', 'APPLIED', 'PARTIAL'\)/);
    assert.match(indexSql.get("stock_lot_external_identity_uq").sql, /\("empresaId", "fonteId", "sourceLotId"\) WHERE "sourceLotId" IS NOT NULL/);
    assert.doesNotMatch(indexSql.get("stock_lot_external_identity_uq").sql, /produtoEstoqueId/);
    assert.doesNotMatch(indexSql.get("stock_lot_external_identity_uq").sql, /fonteId" IS NOT NULL/);
    assert.match(indexSql.get("stock_lot_code_identity_uq").sql, /WHERE "sourceLotId" IS NULL AND "codigoLote" IS NOT NULL/);
    assert.match(indexSql.get("stock_product_confirmed_sku_uq").sql, /"skuCanonico" IS NOT NULL AND "skuCanonicoConfirmado" = TRUE/);
    assert.match(indexSql.get("stock_product_confirmed_barcode_uq").sql, /"barcodeCanonico" IS NOT NULL AND "barcodeCanonicoConfirmado" = TRUE/);
    assert.match(indexSql.get("stock_balance_product_lot_location_uq").sql, /"loteId" IS NOT NULL AND "localId" IS NOT NULL/);
    assert.match(database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'EventoAuditoriaEstoque'").get().sql, /stock_audit_actor_shape_ck/);

    const now = "2026-08-23T18:00:00.000Z";
    const empresaA = nextId(database, "Empresa");
    const empresaB = empresaA + 1;
    insertEmpresa(database, empresaA, "Stock A", "stock-a-e2", now);
    insertEmpresa(database, empresaB, "Stock B", "stock-b-e2", now);
    const usuarioA = nextId(database, "Usuario");
    insertUsuario(database, usuarioA, empresaA, now);
    const fonteA = insertFonte(database, empresaA, "Fonte A", now);
    const fonteB = insertFonte(database, empresaB, "Fonte B", now);
    const produtoA = insertProduto(database, empresaA, now);
    const insertProductIdentity = database.prepare(`
      INSERT INTO "ProdutoEstoque" (
        "empresaId", "nomeExibicao", "skuCanonico", "skuCanonicoConfirmado",
        "barcodeCanonico", "barcodeCanonicoConfirmado", "unidadeCanonica", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, ?, ?, 'UN', ?, ?)
    `);
    assert.doesNotThrow(() => insertProductIdentity.run(empresaA, "SKU sem confirmacao A", "SKU-E2", 0, null, 0, now, now));
    assert.doesNotThrow(() => insertProductIdentity.run(empresaA, "SKU sem confirmacao B", "SKU-E2", 0, null, 0, now, now));
    assert.doesNotThrow(() => insertProductIdentity.run(empresaA, "SKU confirmado A", "SKU-E2", 1, "BAR-E2", 1, now, now));
    assert.throws(
      () => insertProductIdentity.run(empresaA, "SKU confirmado B", "SKU-E2", 1, "BAR-OTHER", 1, now, now),
      /UNIQUE|constraint/i,
    );
    assert.throws(
      () => insertProductIdentity.run(empresaA, "Barcode confirmado B", "SKU-OTHER", 1, "BAR-E2", 1, now, now),
      /UNIQUE|constraint/i,
    );

    const insertImport = database.prepare(`
      INSERT INTO "ImportacaoEstoque" (
        "empresaId", "fonteId", "actorUsuarioId", "status", "schemaVersion", "fileHash", "safeFilename",
        "byteSize", "idempotencyKey", "expiresAt", "retentionUntil", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, 'stock-csv.v1', ?, 'safe.csv', 1, ?, ?, ?, ?, ?)
    `);
    insertImport.run(empresaA, fonteA, usuarioA, "READY", "hash-one", "import-one", now, now, now, now);
    assert.throws(
      () => insertImport.run(empresaA, fonteA, usuarioA, "READY", "hash-one", "import-two", now, now, now, now),
      /UNIQUE|constraint/i,
    );
    assert.doesNotThrow(() => insertImport.run(empresaA, fonteA, usuarioA, "CANCELLED", "hash-one", "import-three", now, now, now, now));
    assert.throws(
      () => insertImport.run(empresaA, fonteB, usuarioA, "READY", "hash-cross-tenant", "import-cross", now, now, now, now),
      /FOREIGN KEY|constraint/i,
    );

    assert.throws(
      () => database.prepare('INSERT INTO "EventoAuditoriaEstoque" ("empresaId", "actorType", "actorSystemKey", "action", "createdAt") VALUES (?, ?, ?, ?, ?)')
        .run(empresaA, "SYSTEM", "invalid-system-key", "TEST", now),
      /CHECK|constraint/i,
    );
    assert.throws(
      () => database.prepare('INSERT INTO "LoteEstoque" ("empresaId", "produtoEstoqueId", "validadeEm", "precisaoValidade", "estado", "observedAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(empresaA, produtoA, "2026-08", "DAY", "ACTIVE", now, now),
      /CHECK|constraint/i,
    );
  } finally {
    database.close();
  }
});

function enumBlock(schema, name) {
  const match = schema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `enum ${name} ausente`);
  return match[1];
}

function enumValues(block) {
  return block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function modelBlock(schema, name) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `model ${name} ausente`);
  return match[1];
}

function nextId(database, table) {
  return Number(database.prepare(`SELECT COALESCE(MAX("id"), 0) + 1 AS nextId FROM "${table}"`).get().nextId);
}

function insertEmpresa(database, id, nome, slug, now) {
  database.prepare('INSERT INTO "Empresa" ("id", "nome", "slug", "ativo", "createdAt", "updatedAt") VALUES (?, ?, ?, true, ?, ?)')
    .run(id, nome, slug, now, now);
}

function insertUsuario(database, id, empresaId, now) {
  database.prepare('INSERT INTO "Usuario" ("id", "empresaId", "nome", "email", "senhaHash", "papel", "ativo", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, true, ?, ?)')
    .run(id, empresaId, "Stock Admin", `stock-${id}@example.test`, "hash", "ADMIN", now, now);
}

function insertFonte(database, empresaId, nome, now) {
  const id = nextId(database, "FonteEstoque");
  database.prepare('INSERT INTO "FonteEstoque" ("id", "empresaId", "tipoFonte", "nome", "statusCiclo", "prioridade", "schemaVersion", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, empresaId, "FILE_IMPORT_CSV", nome, "DRAFT", 100, "stock-csv.v1", now, now);
  return id;
}

function insertProduto(database, empresaId, now) {
  const id = nextId(database, "ProdutoEstoque");
  database.prepare('INSERT INTO "ProdutoEstoque" ("id", "empresaId", "nomeExibicao", "unidadeCanonica", "ativo", "revision", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, true, 1, ?, ?)')
    .run(id, empresaId, "Produto E2", "UN", now, now);
  return id;
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} obrigatoria para teste isolado.`);
  return value;
}
