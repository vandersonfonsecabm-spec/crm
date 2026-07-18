const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { createPrismaClient, validateTestDatabaseUrl } = require("../src/database/prisma-client");

const testRoot = path.resolve(os.tmpdir(), "crm-prisma-tests");
const repositoryRoot = path.resolve(__dirname, "..", "..");
const prismaRoot = path.join(repositoryRoot, "backend", "prisma");

test("bloqueia URL de teste ausente antes de criar PrismaClient", () => {
  let constructed = false;
  class FakePrisma { constructor() { constructed = true; } }
  assert.throws(() => createPrismaClient({ env: { NODE_ENV: "test" }, PrismaClientClass: FakePrisma }), /obrigatoria/);
  assert.equal(constructed, false);
});

test("bloqueia caminho relativo, dev.db e qualquer caminho do repositorio", () => {
  assert.throws(() => validateTestDatabaseUrl("file:./dev.db"), /absoluto/);
  assert.throws(() => validateTestDatabaseUrl(`file:${path.join(prismaRoot, "dev.db")}`), /crm-prisma-tests/);
  assert.throws(() => validateTestDatabaseUrl(`file:${path.join(repositoryRoot, "qa.db")}`, {
    testRoot: repositoryRoot,
    repositoryRoot,
    prismaRoot,
  }), /repositorio/);
});

test("aceita caminho absoluto dentro da raiz temporaria e usa override explicito", () => {
  const expectedPath = path.join(testRoot, "guard", "test.db");
  let received;
  class FakePrisma { constructor(options) { received = options; } }
  createPrismaClient({
    env: { NODE_ENV: "test", CRM_TEST_DATABASE_URL: `file:${expectedPath}` },
    PrismaClientClass: FakePrisma,
  });
  assert.deepEqual(received, { datasourceUrl: `file:${path.resolve(expectedPath).replace(/\\/g, "/")}` });
});

test("desenvolvimento preserva a configuracao padrao", () => {
  let received = "not-called";
  class FakePrisma { constructor(options) { received = options; } }
  createPrismaClient({ env: { NODE_ENV: "development" }, PrismaClientClass: FakePrisma });
  assert.equal(received, undefined);
});

test("sentinela fisica impede abertura do dev.db oficial", async () => {
  assert.equal(process.env.CRM_PRISMA_SENTINEL_ACTIVE, "true");
  const officialPath = process.env.CRM_OFFICIAL_DATABASE_PATH;
  assert.ok(officialPath);
  assert.equal(fs.statSync(officialPath).isDirectory(), true);
  assert.deepEqual(fs.readdirSync(officialPath), []);

  const { PrismaClient } = require("@prisma/client");
  const unsafe = new PrismaClient({ datasourceUrl: `file:${officialPath.replace(/\\/g, "/")}` });
  try {
    await assert.rejects(unsafe.$queryRawUnsafe("PRAGMA quick_check"));
  } finally {
    await unsafe.$disconnect();
  }
  assert.deepEqual(fs.readdirSync(officialPath), []);
});
