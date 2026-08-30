const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { copyMigrationsBefore, copyTargetMigration } = require("./fixtures/migration-sandbox");

const backendDir = path.resolve(__dirname, "..");
const migrationName = "20260828130000_add_canonical_sale_v1";

test("Venda Canônica V1 adiciona contrato e snapshots sem reinterpretar legado", () => {
  const supervisorRunDir = process.env.CRM_PRISMA_TEST_RUN_DIR;
  if (!supervisorRunDir || !path.isAbsolute(supervisorRunDir)) {
    throw new Error("CRM_PRISMA_TEST_RUN_DIR absoluto e obrigatorio.");
  }
  const workDir = path.join(supervisorRunDir, "canonical-sale-v1-migration");
  const prismaDir = path.join(workDir, "prisma");
  const migrationsDir = path.join(prismaDir, "migrations");
  const schemaPath = path.join(prismaDir, "schema.prisma");
  const databasePath = path.join(prismaDir, "representative.db");
  fs.mkdirSync(prismaDir, { recursive: true });
  fs.copyFileSync(path.join(backendDir, "prisma", "schema.prisma"), schemaPath);
  copyMigrationsBefore({ backendDir, migrationsDir, migrationName });
  fs.writeFileSync(databasePath, "");

  runPrisma(schemaPath, databasePath, ["migrate", "deploy"]);
  let database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  seedLegacyCommercialRows(database);
  const before = legacyFingerprint(database);
  const migrationsBefore = appliedMigrations(database);
  database.close();

  copyTargetMigration({ backendDir, migrationsDir, migrationName });
  runPrisma(schemaPath, databasePath, ["migrate", "deploy"]);

  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  const tables = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('NegocioContratoVenda','VendaCanonica','ItemVendaCanonica','HistoricoVendaCanonica') ORDER BY name",
  ).all().map((row) => row.name);
  assert.deepEqual(tables, ["HistoricoVendaCanonica", "ItemVendaCanonica", "NegocioContratoVenda", "VendaCanonica"]);
  assert.equal(appliedMigrations(database), migrationsBefore + 1);
  assert.equal(legacyFingerprint(database), before);
  assert.equal(database.prepare('SELECT "status" FROM "PropostaComercial" WHERE "id" = 1').get().status, "ACEITA");
  assert.equal(database.prepare('SELECT "moeda" FROM "PropostaComercial" WHERE "id" = 1').get().moeda, "BRL");
  assert.equal(Number(database.prepare('SELECT COUNT(*) AS total FROM "NegocioContratoVenda"').get().total), 0);
  assert.equal(Number(database.prepare('SELECT COUNT(*) AS total FROM "VendaCanonica"').get().total), 0);
  assert.equal(database.prepare("PRAGMA quick_check").get().quick_check, "ok");
  assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);

  assert.throws(() => database.prepare(`
    INSERT INTO "NegocioContratoVenda"
      ("empresaId", "negocioId", "propostaPrincipalId", "revisao", "createdAt", "updatedAt")
      VALUES (1, 2, 1, 1, ?, ?)
  `).run(now(), now()), /(FOREIGN KEY constraint failed|NEGOCIO_CONTRATO_VENDA_CUSTOMER_MISMATCH)/);

  database.prepare(`
    INSERT INTO "NegocioContratoVenda"
      ("empresaId", "negocioId", "propostaPrincipalId", "revisao", "createdAt", "updatedAt")
    VALUES (1, 1, 1, 1, ?, ?)
  `).run(now(), now());
  assert.equal(Number(database.prepare('SELECT "propostaPrincipalId" FROM "NegocioContratoVenda" WHERE "empresaId" = 1 AND "negocioId" = 1').get().propostaPrincipalId), 1);
  database.close();

  runPrisma(schemaPath, databasePath, ["migrate", "deploy"]);
  database = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(appliedMigrations(database), migrationsBefore + 1);
  assert.equal(legacyFingerprint(database), before);
  database.close();
});

function seedLegacyCommercialRows(database) {
  const timestamp = now();
  database.prepare('INSERT INTO "Empresa" ("id", "nome", "slug", "ativo", "createdAt", "updatedAt") VALUES (1, ?, ?, 1, ?, ?)')
    .run("Empresa Venda V1", "empresa-venda-v1", timestamp, timestamp);
  database.prepare('INSERT INTO "Usuario" ("id", "empresaId", "nome", "email", "senhaHash", "papel", "ativo", "createdAt", "updatedAt") VALUES (1, 1, ?, ?, ?, ?, 1, ?, ?)')
    .run("Admin Venda V1", "admin@venda-v1.test", "hash-sintetico", "ADMIN", timestamp, timestamp);
  database.prepare('INSERT INTO "Cliente" ("id", "empresaId", "nome", "valor", "origem", "createdAt") VALUES (1, 1, ?, 1234, ?, ?)')
    .run("Cliente legado preservado", "QA", timestamp);
  database.prepare('INSERT INTO "Negocio" ("id", "empresaId", "clienteId", "responsavelId", "titulo", "etapa", "valor", "createdAt", "updatedAt") VALUES (1, 1, 1, 1, ?, ?, 4321, ?, ?)')
    .run("Negocio com proposta aceita", "PROPOSTA", timestamp, timestamp);
  database.prepare('INSERT INTO "Negocio" ("id", "empresaId", "clienteId", "responsavelId", "titulo", "etapa", "valor", "createdAt", "updatedAt") VALUES (2, 1, 1, 1, ?, ?, NULL, ?, ?)')
    .run("Outro negocio do mesmo tenant", "NOVO", timestamp, timestamp);
  database.prepare(`
    INSERT INTO "PropostaComercial"
      ("id", "empresaId", "clienteId", "negocioId", "autorId", "codigo", "titulo", "descontoGeralCentavos", "subtotalCentavos", "totalCentavos", "validade", "status", "versao", "revisao", "createdAt", "updatedAt")
    VALUES (1, 1, 1, 1, 1, ?, ?, 100, 5100, 5000, ?, 'ACEITA', 1, 2, ?, ?)
  `).run("PROP-V1-LEGACY", "Proposta aceita legada", "2026-12-31T00:00:00.000Z", timestamp, timestamp);
  database.prepare(`
    INSERT INTO "ItemPropostaComercial"
      ("id", "empresaId", "propostaId", "itemType", "descricao", "quantidade", "valorUnitarioCentavos", "descontoCentavos", "subtotalCentavos", "totalCentavos", "ordem", "createdAt", "updatedAt")
    VALUES (1, 1, 1, 'LEGACY_ITEM', ?, 1, 5100, 0, 5100, 5100, 0, ?, ?)
  `).run("Item legado", timestamp, timestamp);
}

function legacyFingerprint(database) {
  const rows = {
    cliente: database.prepare('SELECT "id", "empresaId", "nome", "valor", "origem" FROM "Cliente" ORDER BY "id"').all(),
    negocio: database.prepare('SELECT "id", "empresaId", "clienteId", "etapa", "valor" FROM "Negocio" ORDER BY "id"').all(),
    proposta: database.prepare('SELECT "id", "empresaId", "negocioId", "status", "subtotalCentavos", "totalCentavos", "revisao" FROM "PropostaComercial" ORDER BY "id"').all(),
    item: database.prepare('SELECT "id", "empresaId", "propostaId", "descricao", "totalCentavos" FROM "ItemPropostaComercial" ORDER BY "id"').all(),
  };
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function appliedMigrations(database) {
  return Number(database.prepare('SELECT COUNT(*) AS total FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL').get().total);
}

function now() {
  return "2026-08-28T13:00:00.000Z";
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
  if (result.error || result.status !== 0) {
    const diagnostic = String(result.stderr || result.stdout || "")
      .replace(/file:[^\s]+/gi, "file:[SANDBOX]")
      .slice(-4000);
    throw new Error(`Prisma ${args.join(" ")} falhou com codigo ${result.status ?? "SPAWN"}: ${diagnostic}`);
  }
}
