const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const backendDir = path.resolve(__dirname, "..");
const migrationName = "20260722043000_add_agenda_and_followups";

test("H4 evolui Acompanhamento sem perder registros comerciais", () => {
  const runRoot = process.env.CRM_PRISMA_TEST_RUN_DIR;
  if (!runRoot || !path.isAbsolute(runRoot)) throw new Error("CRM_PRISMA_TEST_RUN_DIR absoluto e obrigatorio.");
  const workDir = path.join(runRoot, "h4-representative-migration");
  const prismaDir = path.join(workDir, "prisma");
  const migrationsDir = path.join(prismaDir, "migrations");
  const schemaPath = path.join(prismaDir, "schema.prisma");
  const databasePath = path.join(prismaDir, "representative.db");
  fs.mkdirSync(prismaDir, { recursive: true });
  fs.copyFileSync(path.join(backendDir, "prisma", "schema.prisma"), schemaPath);
  fs.cpSync(path.join(backendDir, "prisma", "migrations"), migrationsDir, { recursive: true });
  fs.rmSync(path.join(migrationsDir, migrationName), { recursive: true, force: true });
  fs.writeFileSync(databasePath, "");

  runPrisma(schemaPath, databasePath, ["migrate", "deploy"]);
  let database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  const createdAt = "2026-07-22T03:30:00.000Z";
  database.prepare('INSERT INTO "Empresa" ("nome", "slug", "ativo", "createdAt", "updatedAt") VALUES (?, ?, 1, ?, ?)').run("Empresa historica H4", "empresa-historica-h4", createdAt, createdAt);
  database.prepare('INSERT INTO "Cliente" ("empresaId", "nome", "createdAt") VALUES (1, ?, ?)').run("Cliente preservado H4", createdAt);
  database.prepare('INSERT INTO "Acompanhamento" ("empresaId", "clienteId", "titulo", "dataHora", "prioridade", "status", "tipo", "responsavel", "createdAt", "updatedAt") VALUES (1, 1, ?, ?, ?, ?, ?, ?, ?, ?)').run("Retorno preservado H4", "2026-07-23T12:00:00.000Z", "ALTA", "PENDENTE", "LIGACAO", "Responsavel legado", createdAt, createdAt);
  const before = commercialFingerprint(database);
  database.close();

  fs.cpSync(path.join(backendDir, "prisma", "migrations", migrationName), path.join(migrationsDir, migrationName), { recursive: true });
  runPrisma(schemaPath, databasePath, ["migrate", "deploy"]);

  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  const columns = Object.fromEntries(database.prepare('PRAGMA table_info("Acompanhamento")').all().map((column) => [column.name, column]));
  assert.equal(columns.clienteId.notnull, 0);
  for (const name of ["propostaComercialId", "responsavelId", "autorId", "concluidoPorId", "canceladoPorId", "canceladoEm", "revisao"]) assert.ok(columns[name], `Coluna ausente: ${name}`);
  assert.equal(Number(database.prepare('SELECT COUNT(*) AS total FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL').get().total), 21);
  assert.equal(commercialFingerprint(database), before);
  const preserved = database.prepare('SELECT "clienteId", "titulo", "prioridade", "status", "tipo", "responsavel", "revisao" FROM "Acompanhamento" WHERE "id" = 1').get();
  assert.deepEqual({ ...preserved }, { clienteId: 1, titulo: "Retorno preservado H4", prioridade: "ALTA", status: "PENDENTE", tipo: "LIGACAO", responsavel: "Responsavel legado", revisao: 1 });
  database.prepare('INSERT INTO "Acompanhamento" ("empresaId", "titulo", "dataHora", "updatedAt") VALUES (1, ?, ?, ?)').run("Tarefa sem vinculo comercial", "2026-07-24T12:00:00.000Z", createdAt);
  assert.equal(database.prepare('SELECT "clienteId" FROM "Acompanhamento" WHERE "id" = 2').get().clienteId, null);
  assert.equal(database.prepare("PRAGMA quick_check").get().quick_check, "ok");
  assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  assert.equal(Number(database.prepare('SELECT COUNT(*) AS total FROM "HistoricoAcompanhamento"').get().total), 0);
  database.close();
});

function commercialFingerprint(database) {
  const rows = database.prepare('SELECT "id", "empresaId", "clienteId", "leadId", "conversaCanalId", "negocioId", "titulo", "descricao", "dataHora", "prioridade", "status", "tipo", "responsavel", "concluidoEm", "createdAt", "updatedAt" FROM "Acompanhamento" ORDER BY "id"').all();
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function runPrisma(schemaPath, databasePath, args) {
  const packageJsonPath = require.resolve("prisma/package.json", { paths: [backendDir] });
  const prismaPackage = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const relativeBin = typeof prismaPackage.bin === "string" ? prismaPackage.bin : prismaPackage.bin?.prisma;
  const prismaCli = path.resolve(path.dirname(packageJsonPath), relativeBin);
  const result = spawnSync(process.execPath, [prismaCli, ...args, "--schema", schemaPath], { cwd: backendDir, env: { ...process.env, DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}` }, stdio: "pipe", windowsHide: true, shell: false });
  if (result.error || result.status !== 0) throw new Error(`Prisma ${args.join(" ")} falhou com codigo ${result.status ?? "SPAWN"}.`);
}
