const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");

const backendDir = path.resolve(__dirname, "..");
const testRoot = path.join(os.tmpdir(), "crm-prisma-tests");
fs.mkdirSync(testRoot, { recursive: true });
const databaseName = `meta-oauth-state-${process.pid}.db`;
const databasePath = path.join(testRoot, databaseName);
const sourceDatabase = String(process.env.CRM_TEST_BASE_DATABASE_PATH || "");
if (!sourceDatabase || !path.isAbsolute(sourceDatabase) || !fs.existsSync(sourceDatabase)) throw new Error("CRM_TEST_BASE_DATABASE_PATH_REQUIRED");
if (path.resolve(sourceDatabase).toLowerCase().includes(`${path.sep}backend${path.sep}prisma${path.sep}dev.db`)) throw new Error("CRM_TEST_BASE_DATABASE_PATH_PROTECTED");

process.env.NODE_ENV = "test";
process.env.CRM_TEST_DATABASE_URL = `file:${databasePath}`;
process.env.DATABASE_URL = `file:${databasePath}`;

let prisma;
let prismaClient;
let createMetaOAuthState;
let consumeMetaOAuthState;
let tenant;
let user;
let channel;

before(async () => {
  fs.copyFileSync(sourceDatabase, databasePath);
  execFileSync(process.execPath, [path.join(backendDir, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy", "--schema", "prisma/schema.prisma"], {
    cwd: backendDir,
    env: process.env,
    stdio: "pipe",
  });
  ({ PrismaClient: prismaClient } = require("@prisma/client"));
  ({ createMetaOAuthState, consumeMetaOAuthState } = require("../src/integrations/metaOAuthState"));
  prisma = new prismaClient();
  tenant = await prisma.empresa.create({ data: { nome: "Meta OAuth State Test", slug: `meta-oauth-state-${process.pid}` } });
  user = await prisma.usuario.create({ data: { empresaId: tenant.id, nome: "Meta Admin", email: `meta-oauth-${process.pid}@test.local`, senhaHash: "test-only", papel: "ADMIN" } });
  channel = await prisma.canalIntegracao.create({ data: { empresaId: tenant.id, tipo: "INSTAGRAM_META", nome: "Instagram Meta Test", chaveInterna: `instagram-meta-${process.pid}` } });
});

after(async () => {
  if (prisma) {
    await prisma.$disconnect();
  }
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const file = `${databasePath}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
});

test("Meta OAuth state e persistente, bound e nao reutilizavel", async () => {
  const raw = await createMetaOAuthState({ prisma, empresaId: tenant.id, usuarioId: user.id, canalIntegracaoId: channel.id });
  assert.equal(typeof raw, "string");
  assert.ok(raw.length >= 40);
  const stored = await prisma.integracaoOAuthState.findFirst({ where: { empresaId: tenant.id, canalIntegracaoId: channel.id, fluxo: "INSTAGRAM_LOGIN" } });
  assert.ok(stored);
  assert.equal(stored.stateHash.includes(raw), false);
  const consumed = await consumeMetaOAuthState({ prisma, rawState: raw, empresaId: tenant.id, canalIntegracaoId: channel.id });
  assert.equal(consumed.id, stored.id);
  assert.equal(await consumeMetaOAuthState({ prisma, rawState: raw, empresaId: tenant.id, canalIntegracaoId: channel.id }), null);
});

test("Meta OAuth state rejeita expiracao e binding divergente", async () => {
  const now = new Date();
  const raw = await createMetaOAuthState({ prisma, empresaId: tenant.id, usuarioId: user.id, canalIntegracaoId: channel.id, now: new Date(now.getTime() - 11 * 60 * 1000) });
  assert.equal(await consumeMetaOAuthState({ prisma, rawState: raw, empresaId: tenant.id, canalIntegracaoId: channel.id, now }), null);
  const fresh = await createMetaOAuthState({ prisma, empresaId: tenant.id, usuarioId: user.id, canalIntegracaoId: channel.id });
  assert.equal(await consumeMetaOAuthState({ prisma, rawState: fresh, empresaId: tenant.id, canalIntegracaoId: channel.id + 1 }), null);
  assert.equal(await consumeMetaOAuthState({ prisma, rawState: fresh, empresaId: tenant.id, canalIntegracaoId: channel.id, fluxo: "OTHER_FLOW" }), null);
});

test("Meta OAuth state aceita apenas um callback concorrente", async () => {
  const raw = await createMetaOAuthState({ prisma, empresaId: tenant.id, usuarioId: user.id, canalIntegracaoId: channel.id });
  const results = await Promise.all([
    consumeMetaOAuthState({ prisma, rawState: raw, empresaId: tenant.id, canalIntegracaoId: channel.id }),
    consumeMetaOAuthState({ prisma, rawState: raw, empresaId: tenant.id, canalIntegracaoId: channel.id }),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
});
