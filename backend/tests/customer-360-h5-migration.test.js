const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { copyMigrationsBefore, copyTargetMigration } = require("./fixtures/migration-sandbox");

const backendDir = path.resolve(__dirname, "..");
const migrationName = "20260722133000_add_customer_360_fields";

test("H5 adiciona dados cadastrais do Cliente sem alterar registros comerciais", () => {
  const runRoot = process.env.CRM_PRISMA_TEST_RUN_DIR;
  if (!runRoot || !path.isAbsolute(runRoot)) throw new Error("CRM_PRISMA_TEST_RUN_DIR absoluto e obrigatorio.");
  const workDir = path.join(runRoot, "h5-representative-migration");
  const prismaDir = path.join(workDir, "prisma");
  const migrationsDir = path.join(prismaDir, "migrations");
  const schemaPath = path.join(prismaDir, "schema.prisma");
  const databasePath = path.join(prismaDir, "representative.db");
  fs.mkdirSync(prismaDir, { recursive: true });
  fs.copyFileSync(path.join(backendDir, "prisma", "schema.prisma"), schemaPath);
  copyMigrationsBefore({ backendDir, migrationsDir, migrationName });
  fs.writeFileSync(databasePath, "");

  runPrisma(schemaPath, databasePath);
  let database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  const createdAt = "2026-07-22T12:30:00.000Z";
  database.prepare('INSERT INTO "Empresa" ("nome", "slug", "ativo", "createdAt", "updatedAt") VALUES (?, ?, 1, ?, ?)').run("Empresa historica H5", "empresa-historica-h5", createdAt, createdAt);
  database.prepare('INSERT INTO "Cliente" ("empresaId", "nome", "telefone", "email", "empresa", "interesse", "origem", "createdAt") VALUES (1, ?, ?, ?, ?, ?, ?, ?)').run("Cliente preservado H5", "11999990000", "cliente@h5.test", "Fazenda H5", "Plantio", "Manual", createdAt);
  const before = fingerprint(database);
  database.close();

  copyTargetMigration({ backendDir, migrationsDir, migrationName });
  runPrisma(schemaPath, databasePath);

  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  const columns = Object.fromEntries(database.prepare('PRAGMA table_info("Cliente")').all().map((column) => [column.name, column]));
  for (const name of ["cidade", "estado", "cpfCnpj", "revisao"]) assert.ok(columns[name], `Coluna ausente: ${name}`);
  assert.equal(columns.cidade.notnull, 0);
  assert.equal(columns.estado.notnull, 0);
  assert.equal(columns.cpfCnpj.notnull, 0);
  assert.equal(columns.revisao.notnull, 1);
  assert.equal(String(columns.revisao.dflt_value), "1");
  assert.equal(Number(database.prepare('SELECT COUNT(*) AS total FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL').get().total), 22);
  assert.equal(fingerprint(database), before);
  const preserved = database.prepare('SELECT "cidade", "estado", "cpfCnpj", "revisao" FROM "Cliente" WHERE "id" = 1').get();
  assert.deepEqual({ ...preserved }, { cidade: null, estado: null, cpfCnpj: null, revisao: 1 });
  assert.equal(database.prepare("PRAGMA quick_check").get().quick_check, "ok");
  assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  database.close();
});

function fingerprint(database) {
  const rows = database.prepare('SELECT "id", "empresaId", "nome", "telefone", "email", "empresa", "interesse", "status", "valor", "origem", "favorito", "quente", "ultimoContato", "proximoFollowUp", "tags", "createdAt" FROM "Cliente" ORDER BY "id"').all();
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function runPrisma(schemaPath, databasePath) {
  const packageJsonPath = require.resolve("prisma/package.json", { paths: [backendDir] });
  const prismaPackage = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const relativeBin = typeof prismaPackage.bin === "string" ? prismaPackage.bin : prismaPackage.bin?.prisma;
  const prismaCli = path.resolve(path.dirname(packageJsonPath), relativeBin);
  const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}` },
    stdio: "pipe",
    windowsHide: true,
    shell: false,
  });
  if (result.error || result.status !== 0) throw new Error(`Prisma migrate deploy falhou com codigo ${result.status ?? "SPAWN"}.`);
}
