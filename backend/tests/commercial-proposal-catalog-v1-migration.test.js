const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { copyMigrationsBefore, copyTargetMigration } = require("./fixtures/migration-sandbox");

const backendDir = path.resolve(__dirname, "..");
const migrationName = "20260825170000_add_commercial_proposal_catalog_items";
const now = "2026-08-25T17:00:00.000Z";

test("V1 backfills existing proposal items as tenant-safe legacy rows and enforces catalog invariants", () => {
  const sandbox = createSandbox("commercial-proposal-catalog-v1-");
  let database;
  try {
    const sqliteMigration = fs.readFileSync(path.join(
      backendDir,
      "prisma",
      "migrations",
      migrationName,
      "migration.sql",
    ), "utf8");
    assert.match(sqliteMigration, /__proposal_catalog_item_preflight/);
    assert.match(sqliteMigration, /CREATE TABLE "new_ItemPropostaComercial"/);
    assert.match(sqliteMigration, /DROP TABLE "ItemPropostaComercial"/);
    assert.match(sqliteMigration, /INNER JOIN "PropostaComercial" AS "proposal"/);
    assert.match(sqliteMigration, /'LEGACY_ITEM'/);
    assert.doesNotMatch(sqliteMigration, /^\s*(?:DELETE|TRUNCATE)\b/im);
    deployMigrationsBeforeTarget(sandbox);
    database = new DatabaseSync(sandbox.databasePath);
    database.exec("PRAGMA foreign_keys = ON");
    seedRepresentativeCommercialGraph(database);
    database.close();
    database = null;

    copyTargetMigration({ backendDir, migrationsDir: sandbox.migrationsDir, migrationName });
    runPrisma(sandbox.schemaPath, sandbox.databasePath, ["migrate", "deploy"]);

    database = new DatabaseSync(sandbox.databasePath);
    database.exec("PRAGMA foreign_keys = ON");
    const legacy = database.prepare(`
      SELECT "empresaId", "itemType", "descricao", "valorUnitarioCentavos", "productOfferId", "catalogProductId",
             "stockProductId", "productNameSnapshot", "skuSnapshot", "unitSnapshot", "currencySnapshot",
             "priceStatusSnapshot", "offerExpiresAt", "catalogRevision", "stockMaterialVersion"
      FROM "ItemPropostaComercial"
      WHERE "id" = 1
    `).get();
    assert.deepEqual({ ...legacy }, {
      empresaId: 1,
      itemType: "LEGACY_ITEM",
      descricao: "Servico historico",
      valorUnitarioCentavos: 1250,
      productOfferId: null,
      catalogProductId: null,
      stockProductId: null,
      productNameSnapshot: null,
      skuSnapshot: null,
      unitSnapshot: null,
      currencySnapshot: null,
      priceStatusSnapshot: null,
      offerExpiresAt: null,
      catalogRevision: null,
      stockMaterialVersion: null,
    });

    const tableSql = database.prepare(`SELECT "sql" FROM "sqlite_master" WHERE "type" = 'table' AND "name" = 'ItemPropostaComercial'`).get().sql;
    assert.match(tableSql, /ItemPropostaComercial_empresaId_propostaId_fkey/);
    assert.match(tableSql, /ItemPropostaComercial_empresaId_productOfferId_fkey/);
    assert.match(tableSql, /ItemPropostaComercial_catalog_contract_ck/);
    assert.match(tableSql, /'CATALOG_ITEM'/);
    assert.match(tableSql, /'LEGACY_ITEM'/);
    assert.equal(database.prepare("PRAGMA quick_check").get().quick_check, "ok");
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);

    insertCatalogItem(database, { id: 2, offerId: "offer-1", catalogId: 101, stockId: 11 });
    assert.doesNotThrow(() => insertCatalogItem(database, {
      id: 4,
      offerId: "offer-1",
      catalogId: 101,
      stockId: 11,
      skuSnapshot: null,
      stockMaterialVersion: null,
    }));
    assert.throws(
      () => insertCatalogItem(database, { id: 3, offerId: "offer-2", catalogId: 201, stockId: 21 }),
      /FOREIGN KEY constraint failed/,
    );
    assert.throws(
      () => database.prepare(`
        INSERT INTO "ItemPropostaComercial" (
          "empresaId", "propostaId", "itemType", "descricao", "quantidade", "valorUnitarioCentavos",
          "descontoCentavos", "subtotalCentavos", "totalCentavos", "ordem", "updatedAt"
        ) VALUES (1, 1, 'CATALOG_ITEM', 'Invalido', 1, 100, 0, 100, 100, 3, ?)
      `).run(now),
      /CHECK constraint failed/,
    );
    assert.throws(
      () => database.prepare(`
        INSERT INTO "ItemPropostaComercial" (
          "empresaId", "propostaId", "itemType", "productOfferId", "descricao", "quantidade", "valorUnitarioCentavos",
          "descontoCentavos", "subtotalCentavos", "totalCentavos", "ordem", "updatedAt"
        ) VALUES (1, 1, 'LEGACY_ITEM', 'offer-1', 'Invalido', 1, 100, 0, 100, 100, 4, ?)
      `).run(now),
      /CHECK constraint failed/,
    );
    assert.throws(
      () => database.prepare('DELETE FROM "ProductOffer" WHERE "id" = ?').run("offer-1"),
      /FOREIGN KEY constraint failed/,
    );
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
    database.close();
    database = null;

    runPrisma(sandbox.schemaPath, sandbox.databasePath, ["migrate", "deploy"]);
    database = new DatabaseSync(sandbox.databasePath, { readOnly: true });
    assert.equal(Number(database.prepare(`SELECT COUNT(*) AS "total" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`).get().total), 40);
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    database?.close();
    fs.rmSync(sandbox.root, { recursive: true, force: true });
  }
});

test("V1 aborts before the SQLite rebuild when a legacy item has no proposal parent", () => {
  const sandbox = createSandbox("commercial-proposal-catalog-v1-orphan-");
  let database;
  try {
    deployMigrationsBeforeTarget(sandbox);
    database = new DatabaseSync(sandbox.databasePath);
    database.exec("PRAGMA foreign_keys = OFF");
    database.prepare(`
      INSERT INTO "ItemPropostaComercial" (
        "propostaId", "descricao", "quantidade", "valorUnitarioCentavos", "descontoCentavos",
        "subtotalCentavos", "totalCentavos", "ordem", "createdAt", "updatedAt"
      ) VALUES (9999, 'Orfao', 1, 100, 0, 100, 100, 0, ?, ?)
    `).run(now, now);
    database.close();
    database = null;

    copyTargetMigration({ backendDir, migrationsDir: sandbox.migrationsDir, migrationName });
    assert.throws(
      () => runPrisma(sandbox.schemaPath, sandbox.databasePath, ["migrate", "deploy"]),
      /Prisma migrate deploy falhou/,
    );

    database = new DatabaseSync(sandbox.databasePath, { readOnly: true });
    const columns = database.prepare("PRAGMA table_info('ItemPropostaComercial')").all().map((column) => column.name);
    assert.equal(columns.includes("empresaId"), false);
    assert.equal(Number(database.prepare('SELECT COUNT(*) AS "total" FROM "ItemPropostaComercial"').get().total), 1);
  } finally {
    database?.close();
    fs.rmSync(sandbox.root, { recursive: true, force: true });
  }
});

function createSandbox(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const prismaDir = path.join(root, "prisma");
  const migrationsDir = path.join(prismaDir, "migrations");
  const schemaPath = path.join(prismaDir, "schema.prisma");
  const databasePath = path.join(prismaDir, "test.db");
  fs.mkdirSync(prismaDir, { recursive: true });
  fs.copyFileSync(path.join(backendDir, "prisma", "schema.prisma"), schemaPath);
  fs.writeFileSync(databasePath, "");
  return { root, migrationsDir, schemaPath, databasePath };
}

function deployMigrationsBeforeTarget(sandbox) {
  copyMigrationsBefore({ backendDir, migrationsDir: sandbox.migrationsDir, migrationName });
  runPrisma(sandbox.schemaPath, sandbox.databasePath, ["migrate", "deploy"]);
}

function seedRepresentativeCommercialGraph(database) {
  for (const [id, slug] of [[1, "empresa-v1-a"], [2, "empresa-v1-b"]]) {
    database.prepare(`INSERT INTO "Empresa" ("id", "nome", "slug", "ativo", "createdAt", "updatedAt") VALUES (?, ?, ?, 1, ?, ?)`).run(id, `Empresa ${id}`, slug, now, now);
  }
  database.prepare(`INSERT INTO "Usuario" ("id", "empresaId", "nome", "email", "senhaHash", "papel", "ativo", "createdAt", "updatedAt") VALUES (1, 1, 'Autor', 'autor@example.test', 'hash', 'ADMIN', 1, ?, ?)`).run(now, now);
  database.prepare(`INSERT INTO "Cliente" ("id", "empresaId", "nome", "createdAt") VALUES (1, 1, 'Cliente V1', ?)`).run(now);
  database.prepare(`INSERT INTO "Negocio" ("id", "empresaId", "clienteId", "etapa", "createdAt", "updatedAt") VALUES (1, 1, 1, 'NOVO', ?, ?)`).run(now, now);
  database.prepare(`
    INSERT INTO "PropostaComercial" (
      "id", "empresaId", "clienteId", "negocioId", "autorId", "codigo", "titulo", "validade", "updatedAt"
    ) VALUES (1, 1, 1, 1, 1, 'P-001', 'Proposta historica', '2026-09-01T00:00:00.000Z', ?)
  `).run(now);
  database.prepare(`
    INSERT INTO "ItemPropostaComercial" (
      "id", "propostaId", "descricao", "quantidade", "valorUnitarioCentavos", "descontoCentavos",
      "subtotalCentavos", "totalCentavos", "ordem", "createdAt", "updatedAt"
    ) VALUES (1, 1, 'Servico historico', 1, 1250, 0, 1250, 1250, 0, ?, ?)
  `).run(now, now);
  seedCatalogGraph(database, { empresaId: 1, stockId: 11, catalogId: 101, offerId: "offer-1" });
  seedCatalogGraph(database, { empresaId: 2, stockId: 21, catalogId: 201, offerId: "offer-2" });
}

function seedCatalogGraph(database, { empresaId, stockId, catalogId, offerId }) {
  database.prepare(`
    INSERT INTO "ProdutoEstoque" (
      "id", "empresaId", "nomeExibicao", "skuCanonico", "unidadeCanonica", "ativo", "revision", "createdAt", "updatedAt"
    ) VALUES (?, ?, ?, ?, 'UN', 1, 7, ?, ?)
  `).run(stockId, empresaId, `Produto ${stockId}`, `SKU-${stockId}`, now, now);
  database.prepare(`
    INSERT INTO "CommercialCatalogProduct" (
      "id", "empresaId", "stockProductId", "title", "commercialPrice", "currency", "priceStatus", "visibility", "revision", "createdAt", "updatedAt"
    ) VALUES (?, ?, ?, ?, 12.50, 'BRL', 'AVAILABLE', 'PUBLISHED', 9, ?, ?)
  `).run(catalogId, empresaId, stockId, `Catalogo ${catalogId}`, now, now);
  database.prepare(`
    INSERT INTO "ProductOffer" (
      "id", "empresaId", "catalogProductId", "stockProductId", "title", "price", "currency", "availabilityStatus",
      "availabilityLabel", "sourceFreshness", "confidence", "expiresAt", "catalogRevision", "stockMaterialVersion", "policyVersion", "createdAt"
    ) VALUES (?, ?, ?, ?, ?, 12.50, 'BRL', 'AVAILABLE', 'Disponivel', 'FRESH', 'HIGH', '2026-09-01T00:00:00.000Z', 9, 4, 'catalog.v1', ?)
  `).run(offerId, empresaId, catalogId, stockId, `Oferta ${offerId}`, now);
}

function insertCatalogItem(database, {
  id,
  offerId,
  catalogId,
  stockId,
  skuSnapshot = "SKU-11",
  stockMaterialVersion = 4,
}) {
  return database.prepare(`
    INSERT INTO "ItemPropostaComercial" (
      "id", "empresaId", "propostaId", "itemType", "productOfferId", "catalogProductId", "stockProductId",
      "descricao", "productNameSnapshot", "skuSnapshot", "unitSnapshot", "quantidade", "valorUnitarioCentavos",
      "currencySnapshot", "priceStatusSnapshot", "offerExpiresAt", "catalogRevision", "stockMaterialVersion",
      "descontoCentavos", "subtotalCentavos", "totalCentavos", "ordem", "updatedAt"
    ) VALUES (?, 1, 1, 'CATALOG_ITEM', ?, ?, ?, 'Produto catalogado', 'Produto catalogado', ?, 'UN', 2, 1250, 'BRL', 'AVAILABLE', '2026-09-01T00:00:00.000Z', 9, ?, 0, 2500, 2500, ?, ?)
  `).run(id, offerId, catalogId, stockId, skuSnapshot, stockMaterialVersion, id, now);
}

function runPrisma(schemaPath, databasePath, args) {
  const packageJsonPath = require.resolve("prisma/package.json", { paths: [backendDir] });
  const prismaPackage = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const relativeBin = typeof prismaPackage.bin === "string" ? prismaPackage.bin : prismaPackage.bin?.prisma;
  const prismaCli = path.resolve(path.dirname(packageJsonPath), relativeBin);
  const result = spawnSync(process.execPath, [prismaCli, ...args, "--schema", schemaPath], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}` },
    stdio: "pipe",
    windowsHide: true,
    shell: false,
  });
  if (result.error || result.status !== 0) throw new Error(`Prisma ${args.join(" ")} falhou com codigo ${result.status ?? "SPAWN"}.`);
}
