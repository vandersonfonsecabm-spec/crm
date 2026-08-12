const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const { createMetaCredentialStore } = require("../src/integrations/metaCredentialStore");

const backendDir = path.resolve(__dirname, "..");
const sandboxDir = path.join(os.tmpdir(), "crm-prisma-tests");
const databasePath = path.join(sandboxDir, `meta-credential-store-${process.pid}.db`);
const baseDatabasePath = path.join(sandboxDir, `meta-credential-store-base-${process.pid}.db`);
const sourceDatabase = String(process.env.CRM_TEST_BASE_DATABASE_PATH || "");
if (!sourceDatabase || !path.isAbsolute(sourceDatabase) || !fs.existsSync(sourceDatabase)) throw new Error("CRM_TEST_BASE_DATABASE_PATH_REQUIRED");
if (path.resolve(sourceDatabase).toLowerCase().includes(`${path.sep}backend${path.sep}prisma${path.sep}dev.db`)) throw new Error("CRM_TEST_BASE_DATABASE_PATH_PROTECTED");
const databaseUrl = `file:${databasePath}`;

process.env.NODE_ENV = "test";
process.env.INTEGRATION_ENCRYPTION_KEY = "meta-credential-test-key-with-32-bytes";

let prisma;
let store;
let tenantA;
let tenantB;
let channelA;
let channelB;

before(async () => {
  fs.mkdirSync(sandboxDir, { recursive: true });
  fs.copyFileSync(sourceDatabase, baseDatabasePath);
  fs.copyFileSync(baseDatabasePath, databasePath);
  process.env.CRM_TEST_DATABASE_URL = databaseUrl;
  process.env.CRM_TEST_BASE_DATABASE_PATH = baseDatabasePath;
  execFileSync(process.execPath, [path.join(backendDir, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy", "--schema", path.join(backendDir, "prisma", "schema.prisma")], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  store = createMetaCredentialStore({ prisma });
  tenantA = await prisma.empresa.create({ data: { nome: "Meta Store A", slug: `meta-store-a-${process.pid}` } });
  tenantB = await prisma.empresa.create({ data: { nome: "Meta Store B", slug: `meta-store-b-${process.pid}` } });
  channelA = await createChannel(tenantA.id, "meta-store-a-channel");
  channelB = await createChannel(tenantA.id, "meta-store-b-channel");
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  for (const root of [databasePath, baseDatabasePath]) {
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      const file = `${root}${suffix}`;
      if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    }
  }
});

test("MetaCredentialStore cifra, vincula tenant+canal e nao expõe ciphertext", async () => {
  const created = await store.createLocalCredential({
    empresaId: tenantA.id,
    canalIntegracaoId: channelA.id,
    provider: "META_INSTAGRAM",
    credentials: { accessToken: "meta-secret-token", expiresAt: "2030-01-01T00:00:00.000Z" },
  });

  assert.equal(created.status, "ATIVA");
  assert.equal(created.revision, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(created, "ciphertext"), false);
  assert.equal(JSON.stringify(created).includes("meta-secret-token"), false);

  const stored = await prisma.metaCredential.findUnique({ where: { id: created.id } });
  assert.equal(stored.ciphertext.includes("meta-secret-token"), false);
  assert.equal((await prisma.canalIntegracao.findUnique({ where: { id: channelA.id } })).accessTokenRef, created.reference);

  const resolved = await store.resolveCurrentCredential({ empresaId: tenantA.id, canalIntegracaoId: channelA.id, provider: "META_INSTAGRAM" });
  assert.deepEqual(resolved.credentials, { accessToken: "meta-secret-token", expiresAt: "2030-01-01T00:00:00.000Z" });
  assert.equal(resolved.reference, created.reference);
});

test("MetaCredentialStore autentica o contexto criptográfico e rejeita campos sensíveis proibidos", async () => {
  const current = await prisma.metaCredential.findFirstOrThrow({ where: { canalIntegracaoId: channelA.id } });
  const other = await store.createLocalCredential({
    empresaId: tenantA.id,
    canalIntegracaoId: channelB.id,
    provider: "META_INSTAGRAM",
    credentials: { accessToken: "other-secret" },
  });
  const originalCiphertext = current.ciphertext;
  await prisma.metaCredential.update({ where: { id: current.id }, data: { ciphertext: (await prisma.metaCredential.findUniqueOrThrow({ where: { id: other.id } })).ciphertext } });
  await assert.rejects(
    () => store.resolveCurrentCredential({ empresaId: tenantA.id, canalIntegracaoId: channelA.id, provider: "META_INSTAGRAM" }),
    (error) => error.codigo === "META_CREDENTIAL_DECRYPTION_FAILED",
  );
  await prisma.metaCredential.update({ where: { id: current.id }, data: { ciphertext: originalCiphertext } });
  await store.removeLocalCredential({ empresaId: tenantA.id, canalIntegracaoId: channelB.id, provider: "META_INSTAGRAM", expectedRevision: other.revision });
  await assert.rejects(
    () => store.createLocalCredential({ empresaId: tenantA.id, canalIntegracaoId: channelB.id, provider: "META_INSTAGRAM", credentials: { accessToken: "ok", appSecret: "must-not-persist" } }),
    (error) => error.codigo === "META_CREDENTIAL_PAYLOAD_INVALID",
  );
});

test("MetaCredentialStore impede cross-channel, aplica CAS e remove por hard-delete", async () => {
  const first = await prisma.metaCredential.findFirstOrThrow({ where: { canalIntegracaoId: channelA.id } });

  await assert.rejects(
    () => prisma.canalIntegracao.update({ where: { id: channelB.id }, data: { accessTokenRef: first.reference } }),
    (error) => error.code === "P2003",
  );
  await assert.rejects(
    () => store.replaceLocalCredential({ empresaId: tenantA.id, canalIntegracaoId: channelA.id, provider: "META_INSTAGRAM", expectedRevision: 99, credentials: { accessToken: "stale" } }),
    (error) => error.codigo === "META_CREDENTIAL_REVISION_CONFLICT",
  );

  const replaced = await store.replaceLocalCredential({
    empresaId: tenantA.id,
    canalIntegracaoId: channelA.id,
    provider: "META_INSTAGRAM",
    expectedRevision: 1,
    credentials: { accessToken: "rotated-secret" },
  });
  assert.equal(replaced.revision, 2);
  assert.notEqual(replaced.reference, first.reference);
  assert.equal(await prisma.metaCredential.count({ where: { reference: first.reference } }), 0);
  assert.equal((await store.resolveCurrentCredential({ empresaId: tenantA.id, canalIntegracaoId: channelA.id, provider: "META_INSTAGRAM" })).credentials.accessToken, "rotated-secret");

  const removed = await store.removeLocalCredential({ empresaId: tenantA.id, canalIntegracaoId: channelA.id, provider: "META_INSTAGRAM", expectedRevision: 2 });
  assert.deepEqual(removed, { removed: true });
  assert.equal(await prisma.metaCredential.count({ where: { canalIntegracaoId: channelA.id } }), 0);
  assert.equal((await prisma.canalIntegracao.findUnique({ where: { id: channelA.id } })).accessTokenRef, null);
  assert.equal(await store.resolveCurrentCredential({ empresaId: tenantA.id, canalIntegracaoId: channelA.id, provider: "META_INSTAGRAM" }), null);
});

test("MetaCredentialStore preserva CAS sob replace concorrente e faz rollback do perdedor", async () => {
  const created = await store.createLocalCredential({ empresaId: tenantA.id, canalIntegracaoId: channelB.id, provider: "META_INSTAGRAM", credentials: { accessToken: "concurrency-seed" } });
  const outcomes = await Promise.allSettled([
    store.replaceLocalCredential({ empresaId: tenantA.id, canalIntegracaoId: channelB.id, provider: "META_INSTAGRAM", expectedRevision: created.revision, credentials: { accessToken: "winner-a" } }),
    store.replaceLocalCredential({ empresaId: tenantA.id, canalIntegracaoId: channelB.id, provider: "META_INSTAGRAM", expectedRevision: created.revision, credentials: { accessToken: "winner-b" } }),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(await prisma.metaCredential.count({ where: { canalIntegracaoId: channelB.id } }), 1);
  const current = await store.resolveCurrentCredential({ empresaId: tenantA.id, canalIntegracaoId: channelB.id, provider: "META_INSTAGRAM" });
  assert.equal(current.revision, 2);
  assert.match(current.credentials.accessToken, /^winner-[ab]$/);
  await store.removeLocalCredential({ empresaId: tenantA.id, canalIntegracaoId: channelB.id, provider: "META_INSTAGRAM", expectedRevision: 2 });
});

test("MetaCredentialStore falha fechado em tenant/canal/provider divergentes", async () => {
  await assert.rejects(
    () => store.createLocalCredential({ empresaId: tenantA.id, canalIntegracaoId: channelB.id, provider: "META_MESSENGER", credentials: { accessToken: "not-supported" } }),
    (error) => error.codigo === "META_CREDENTIAL_PROVIDER_UNSUPPORTED",
  );
  await assert.rejects(
    () => store.resolveCurrentCredential({ empresaId: tenantB.id, canalIntegracaoId: channelA.id, provider: "META_INSTAGRAM" }),
    (error) => error.codigo === "META_CREDENTIAL_NOT_FOUND",
  );
});

test("MetaCredentialStore valida contexto dentro da transacao antes de criar ponte", async () => {
  await assert.rejects(
    () => store.createLocalCredential({
      empresaId: tenantA.id,
      canalIntegracaoId: channelB.id,
      provider: "META_INSTAGRAM",
      credentials: { accessToken: "context-rejected" },
      validateContext: async () => false,
    }),
    (error) => error.codigo === "META_OAUTH_CONTEXT_INVALID",
  );
  assert.equal(await prisma.metaCredential.count({ where: { canalIntegracaoId: channelB.id, reference: { not: "" } } }), 0);
  assert.equal((await prisma.canalIntegracao.findUnique({ where: { id: channelB.id } })).accessTokenRef, null);
});

async function createChannel(empresaId, chaveInterna) {
  return prisma.canalIntegracao.create({ data: { empresaId, tipo: "INSTAGRAM_META", nome: chaveInterna, chaveInterna } });
}
