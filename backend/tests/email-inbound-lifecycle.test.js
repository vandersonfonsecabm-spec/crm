const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const postgres = process.env.CRM_TEST_DATABASE_PROVIDER === "postgresql";
const suffix = `${Date.now()}-${process.pid}`;
let databasePath;
if (!postgres) {
  databasePath = path.join(requiredEnv("CRM_PRISMA_TEST_RUN_DIR"), "email-inbound-lifecycle", `lifecycle-${process.pid}.db`);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.copyFileSync(requiredEnv("CRM_TEST_BASE_DATABASE_PATH"), databasePath);
}
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  CRM_TEST_DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  EMAIL_PROVIDER_TYPE: "GENERIC",
  EMAIL_PROVIDER_ENVIRONMENT: "EMAIL_LIFECYCLE_TEST",
  EMAIL_INTEGRATION_ENABLED: "true",
  EMAIL_INBOUND_ENABLED: "true",
});

const { PrismaClient } = require("@prisma/client");
const { mountPlatformRoutes } = require("../src/platform/routes");
const { createChannelService } = require("../src/channels/channelService");
const { createEmailInboundLifecycleService } = require("../src/integrations/emailInboundLifecycle");
const { createEmailInboundProvisioningService } = require("../src/platform/emailInboundProvisioning");

let prisma;
let server;
let baseUrl;
const tenantIds = [];

before(async () => {
  prisma = new PrismaClient();
  const app = express();
  app.use(express.json());
  mountPlatformRoutes({
    app,
    prisma,
    authenticate(req, _res, next) {
      req.auth = {
        usuarioId: Number(req.get("x-test-user-id")) || 0,
        isPlatformOperator: req.get("x-test-platform-operator") === "true",
      };
      next();
    },
  });
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  let cleanupError;
  try {
    if (tenantIds.length) await cleanupTenants(tenantIds);
  } catch (error) { cleanupError = error; }
  if (server) {
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (prisma) await prisma.$disconnect();
  if (databasePath) removeDatabase(databasePath);
  if (cleanupError) throw cleanupError;
});

test("provisionamento platform-only cria caixa inativa, sanitizada e idempotente", async () => {
  const operator = await seedTenant("email-operator");
  const target = await seedTenant("email-target");
  let response = await request("GET", statusPath(target.tenant.id), null, target.user.id, false);
  assert.equal(response.status, 403);

  const payload = provisioningPayload(target.tenant.id);
  response = await request("PUT", basePath(target.tenant.id), payload, operator.user.id, true);
  assert.equal(response.status, 201);
  assert.equal(response.body.state, "CONFIGURED_INACTIVE");
  assert.equal(response.body.changed, true);
  assert.equal(response.body.ativo, false);
  assert.equal(response.body.capabilities.integration, false);
  assert.equal(response.body.capabilities.inbound, false);
  assert.equal(response.body.connectedAt, null);
  assert.equal(response.body.verifiedAt, null);
  assert.equal(response.body.lastWebhookAt, null);
  assert.notEqual(response.body.emailAddressMasked, payload.emailAddress);
  assert.equal(JSON.stringify(response.body).includes(payload.emailAddress), false);

  const replay = await request("PUT", basePath(target.tenant.id), payload, operator.user.id, true);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.changed, false);
  assert.equal(await prisma.canalIntegracao.count({ where: { empresaId: target.tenant.id, tipo: "EMAIL", modoTeste: false } }), 1);
  assert.equal(await prisma.empresaFuncionalidade.count({ where: { empresaId: target.tenant.id, chave: { in: ["EMAIL_INTEGRATION", "EMAIL_INBOUND"] } } }), 0);
  const status = await request("GET", statusPath(target.tenant.id), null, operator.user.id, true);
  assert.equal(status.status, 200);
  assert.equal(status.body.state, "CONFIGURED_INACTIVE");
  assert.equal(status.body.nextRequirement, "ACTIVATE_EMAIL_INBOUND");

  const other = await seedTenant("email-other");
  const conflict = await request("PUT", basePath(other.tenant.id), { ...provisioningPayload(other.tenant.id), emailAddress: payload.emailAddress }, operator.user.id, true);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.codigo, "EMAIL_IDENTITY_CONFLICT");
  assert.equal(await prisma.canalIntegracao.count({ where: { empresaId: other.tenant.id, tipo: "EMAIL" } }), 0);

  const aliasAsPrimary = await seedTenant("email-alias-as-primary");
  const aliasConflict = await request("PUT", basePath(aliasAsPrimary.tenant.id), { ...provisioningPayload(aliasAsPrimary.tenant.id), emailAddress: payload.aliases[0] }, operator.user.id, true);
  assert.equal(aliasConflict.status, 409);
  assert.equal(aliasConflict.body.codigo, "EMAIL_IDENTITY_CONFLICT");
  const primaryAsAlias = await seedTenant("email-primary-as-alias");
  const primaryConflict = await request("PUT", basePath(primaryAsAlias.tenant.id), { ...provisioningPayload(primaryAsAlias.tenant.id), aliases: [payload.emailAddress] }, operator.user.id, true);
  assert.equal(primaryConflict.status, 409);
  assert.equal(primaryConflict.body.codigo, "EMAIL_IDENTITY_CONFLICT");
});

test("metadata usa CAS e identidade primaria permanece imutavel", async () => {
  const operator = await seedTenant("email-cas-operator");
  const target = await seedTenant("email-cas-target");
  const created = await request("PUT", basePath(target.tenant.id), provisioningPayload(target.tenant.id), operator.user.id, true);
  const update = await request("PUT", basePath(target.tenant.id), {
    name: "Caixa comercial atualizada",
    aliases: [`sales-${target.tenant.id}@tenant.example.test`],
    reason: "Atualizacao controlada de metadata",
    expectedUpdatedAt: created.body.updatedAt,
  }, operator.user.id, true);
  assert.equal(update.status, 200);
  assert.equal(update.body.changed, true);
  assert.equal(update.body.aliasesMasked.length, 1);

  const stale = await request("PUT", basePath(target.tenant.id), {
    name: "Nome stale",
    reason: "Teste CAS stale",
    expectedUpdatedAt: created.body.updatedAt,
  }, operator.user.id, true);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.codigo, "EMAIL_CHANNEL_CONFLICT");

  const unmasked = await request("PUT", basePath(target.tenant.id), {
    providerAccountIdMasked: "provider-account-completo",
    reason: "Metadata deveria permanecer mascarada",
    expectedUpdatedAt: update.body.updatedAt,
  }, operator.user.id, true);
  assert.equal(unmasked.status, 422);
  assert.equal(unmasked.body.codigo, "EMAIL_MASKED_METADATA_INVALID");

  const identity = await request("PUT", basePath(target.tenant.id), {
    emailAddress: `changed-${target.tenant.id}@tenant.example.test`,
    reason: "Tentativa de troca de identidade",
  }, operator.user.id, true);
  assert.equal(identity.status, 409);
  assert.equal(identity.body.codigo, "EMAIL_IDENTITY_IMMUTABLE");
  const persisted = await prisma.canalIntegracao.findFirst({ where: { empresaId: target.tenant.id, tipo: "EMAIL", modoTeste: false }, include: { enderecosEmail: true } });
  assert.equal(persisted.nome, "Caixa comercial atualizada");
  assert.equal(persisted.enderecosEmail.filter((item) => item.kind === "PRIMARY").length, 1);
});

test("provisionamento e CAS concorrentes convergem no PostgreSQL", { skip: !postgres }, async () => {
  const operator = await seedTenant("email-pg-operator");
  const target = await seedTenant("email-pg-target");
  const clients = [new PrismaClient(), new PrismaClient()];
  const services = clients.map((client) => createEmailInboundProvisioningService({ prisma: client, env: process.env }));
  try {
    const createResults = await Promise.all(services.map((service) => service.provision({ tenantId: target.tenant.id, actorUserId: operator.user.id, body: provisioningPayload(target.tenant.id), correlationId: "email-create-race" })));
    assert.equal(createResults.filter((result) => result.body.changed === true).length, 1);
    assert.equal(createResults.filter((result) => result.body.changed === false).length, 1);
    assert.equal(await prisma.canalIntegracao.count({ where: { empresaId: target.tenant.id, tipo: "EMAIL", modoTeste: false } }), 1);

    const current = await prisma.canalIntegracao.findFirstOrThrow({ where: { empresaId: target.tenant.id, tipo: "EMAIL", modoTeste: false } });
    const updates = await Promise.allSettled(services.map((service, index) => service.provision({
      tenantId: target.tenant.id,
      actorUserId: operator.user.id,
      body: { name: `Concurrent metadata ${index}`, reason: `CAS concorrente ${index}`, expectedUpdatedAt: current.updatedAt.toISOString() },
      correlationId: `email-cas-race-${index}`,
    })));
    assert.equal(updates.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(updates.filter((result) => result.status === "rejected" && result.reason?.code === "EMAIL_CHANNEL_CONFLICT").length, 1);

    const otherA = await seedTenant("email-pg-identity-a");
    const otherB = await seedTenant("email-pg-identity-b");
    const sharedAddress = `shared-race-${suffix}@tenant.example.test`;
    const identityResults = await Promise.allSettled(services.map((service, index) => service.provision({
      tenantId: index === 0 ? otherA.tenant.id : otherB.tenant.id,
      actorUserId: operator.user.id,
      body: { ...provisioningPayload(index === 0 ? otherA.tenant.id : otherB.tenant.id), emailAddress: sharedAddress, aliases: [] },
      correlationId: `email-identity-race-${index}`,
    })));
    assert.equal(identityResults.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(identityResults.filter((result) => result.status === "rejected" && result.reason?.code === "EMAIL_IDENTITY_CONFLICT").length, 1);
    assert.equal(await prisma.emailMailboxAddress.count({ where: { addressNormalized: sharedAddress } }), 1);
  } finally {
    await Promise.all(clients.map((client) => client.$disconnect()));
  }
});

test("activate pause e reactivate sao atomicos, auditados e preservam timestamps", async () => {
  const operator = await seedTenant("email-lifecycle-operator");
  const target = await seedTenant("email-lifecycle-target");
  const created = await request("PUT", basePath(target.tenant.id), provisioningPayload(target.tenant.id), operator.user.id, true);
  const forbidden = await request("POST", `${basePath(target.tenant.id)}/activate`, lifecyclePayload(created.body.updatedAt, "Ativacao sem papel platform"), target.user.id, false);
  assert.equal(forbidden.status, 403);
  assert.equal(await prisma.empresaFuncionalidade.count({ where: { empresaId: target.tenant.id, chave: { in: ["EMAIL_INTEGRATION", "EMAIL_INBOUND"] } } }), 0);

  const previousInboundGate = process.env.EMAIL_INBOUND_ENABLED;
  let disabled;
  try {
    process.env.EMAIL_INBOUND_ENABLED = "false";
    disabled = await request("POST", `${basePath(target.tenant.id)}/activate`, lifecyclePayload(created.body.updatedAt, "Ativacao com gate desabilitado"), operator.user.id, true);
  } finally {
    process.env.EMAIL_INBOUND_ENABLED = previousInboundGate;
  }
  assert.equal(disabled.status, 503);
  assert.equal(disabled.body.codigo, "EMAIL_GLOBAL_CONFIGURATION_INVALID");
  assert.equal(await prisma.empresaFuncionalidade.count({ where: { empresaId: target.tenant.id, chave: { in: ["EMAIL_INTEGRATION", "EMAIL_INBOUND"] } } }), 0);

  let response = await request("POST", `${basePath(target.tenant.id)}/activate`, lifecyclePayload(created.body.updatedAt, "Ativar intake sintetico"), operator.user.id, true);
  assert.equal(response.status, 200);
  assert.equal(response.body.state, "WAITING_PROVIDER_AUTH");
  assert.equal(response.body.changed, true);
  assert.deepEqual(response.body.capabilities, { integration: true, inbound: true });
  assert.equal(response.body.connectedAt, null);
  assert.equal(response.body.verifiedAt, null);
  assert.equal(response.body.lastWebhookAt, null);
  assert.equal(await prisma.auditoriaFuncionalidade.count({ where: { empresaId: target.tenant.id } }), 2);
  const audits = await prisma.auditoriaFuncionalidade.findMany({ where: { empresaId: target.tenant.id } });
  assert.equal(audits.every((item) => item.usuarioId === operator.user.id && item.motivo === "Ativar intake sintetico"), true);
  assert.equal(JSON.stringify(audits).includes(created.body.emailAddressMasked), false);

  const replay = await request("POST", `${basePath(target.tenant.id)}/activate`, lifecyclePayload(response.body.updatedAt, "Replay de ativacao"), operator.user.id, true);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.changed, false);

  const stale = await request("POST", `${basePath(target.tenant.id)}/pause`, lifecyclePayload(created.body.updatedAt, "Pausa stale"), operator.user.id, true);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.codigo, "EMAIL_CHANNEL_CONFLICT");

  response = await request("POST", `${basePath(target.tenant.id)}/pause`, lifecyclePayload(replay.body.updatedAt, "Pausar intake"), operator.user.id, true);
  assert.equal(response.status, 200);
  assert.equal(response.body.state, "CONFIGURED_INACTIVE");
  assert.deepEqual(response.body.capabilities, { integration: true, inbound: false });

  response = await request("POST", `${basePath(target.tenant.id)}/reactivate`, lifecyclePayload(response.body.updatedAt, "Reativar intake"), operator.user.id, true);
  assert.equal(response.status, 200);
  assert.equal(response.body.state, "WAITING_PROVIDER_AUTH");
  assert.deepEqual(response.body.capabilities, { integration: true, inbound: true });
  assert.equal(response.body.connectedAt, null);
  assert.equal(response.body.verifiedAt, null);
  assert.equal(response.body.lastWebhookAt, null);
});

test("falha do logger pos-commit nao desfaz lifecycle", async () => {
  const operator = await seedTenant("email-logger-operator");
  const target = await seedTenant("email-logger-target");
  const created = await request("PUT", basePath(target.tenant.id), provisioningPayload(target.tenant.id), operator.user.id, true);
  const service = createEmailInboundLifecycleService({ prisma, env: process.env, logger: { info() { throw new Error("logger unavailable"); } } });
  const result = await service.activate({
    tenantId: target.tenant.id,
    actorUserId: operator.user.id,
    body: lifecyclePayload(created.body.updatedAt, "Ativacao com logger indisponivel"),
    correlationId: "email-logger-test",
  });
  assert.equal(result.changed, true);
  assert.equal(result.state, "WAITING_PROVIDER_AUTH");
  const persisted = await prisma.canalIntegracao.findFirst({ where: { empresaId: target.tenant.id, tipo: "EMAIL", modoTeste: false } });
  assert.equal(persisted.ativo, true);
  assert.equal(await prisma.auditoriaFuncionalidade.count({ where: { empresaId: target.tenant.id } }), 2);
});

test("writers genericos bloqueiam canal EMAIL real antes de persistir", async () => {
  const target = await seedTenant("email-writer");
  const channel = await prisma.canalIntegracao.create({ data: {
    empresaId: target.tenant.id,
    tipo: "EMAIL",
    nome: "Caixa real protegida",
    chaveInterna: "email-inbound-real",
    publicId: `email-writer-${suffix}-${target.tenant.id}`,
    status: "INATIVO",
    modoTeste: false,
    ativo: false,
    emailProviderType: "GENERIC",
  } });
  const service = createChannelService({ prisma });
  await assert.rejects(
    service.updateChannel({ empresaId: target.tenant.id, id: channel.id, body: { nome: "Alteracao indevida", ativo: true } }),
    (error) => error.codigo === "CHANNEL_PLATFORM_MANAGED" && error.status === 403,
  );
  const persisted = await prisma.canalIntegracao.findUnique({ where: { id: channel.id } });
  assert.equal(persisted.nome, channel.nome);
  assert.equal(persisted.ativo, false);
});

async function seedTenant(label) {
  const tenant = await prisma.empresa.create({ data: { nome: label, slug: `${label}-${suffix}` } });
  tenantIds.push(tenant.id);
  const user = await prisma.usuario.create({ data: { empresaId: tenant.id, nome: label, email: `${label}-${suffix}@operator.example.test`, senhaHash: "not-used", papel: "ADMIN", ativo: true } });
  return { tenant, user };
}

function provisioningPayload(id) {
  return {
    name: "Caixa comercial",
    emailAddress: `inbox-${id}@tenant.example.test`,
    aliases: [`alias-${id}@tenant.example.test`],
    providerType: "GENERIC",
    providerAccountIdMasked: `acct***${String(id).slice(-2)}`,
    displayNameMasked: "Equipe C***",
    reason: "Provisionamento sintetico controlado",
  };
}

function lifecyclePayload(updatedAt, reason) {
  return { expectedUpdatedAt: new Date(updatedAt).toISOString(), reason };
}

function basePath(tenantId) {
  return `/platform/tenants/${tenantId}/integrations/email/inbound`;
}

function statusPath(tenantId) {
  return `${basePath(tenantId)}/status`;
}

async function request(method, pathname, body, userId, platformOperator) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    signal: AbortSignal.timeout(10_000),
    headers: {
      ...(body === null ? {} : { "content-type": "application/json" }),
      "x-test-user-id": String(userId),
      "x-test-platform-operator": String(platformOperator),
    },
    ...(body === null ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function cleanupTenants(ids) {
  const where = { empresaId: { in: ids } };
  await prisma.emailMessageMetadata.deleteMany({ where });
  await prisma.mensagemCanal.deleteMany({ where });
  await prisma.eventoWebhook.deleteMany({ where });
  await prisma.conversaCanal.deleteMany({ where });
  await prisma.contatoCanal.deleteMany({ where });
  await prisma.lead.deleteMany({ where });
  await prisma.cliente.deleteMany({ where });
  await prisma.auditoriaFuncionalidade.deleteMany({ where });
  await prisma.empresaFuncionalidade.deleteMany({ where });
  await prisma.emailMailboxAddress.deleteMany({ where });
  await prisma.canalIntegracao.deleteMany({ where });
  await prisma.usuario.deleteMany({ where });
  await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
}

function databaseUrl(file) { return `file:${path.resolve(file).replace(/\\/g, "/")}`; }
function removeDatabase(file) { for (const suffixValue of ["", "-wal", "-shm", "-journal"]) { const target = `${file}${suffixValue}`; if (fs.existsSync(target)) fs.rmSync(target, { force: true }); } }
function requiredEnv(name) { const value = process.env[name]; if (!value) throw new Error(`${name} obrigatoria.`); return value; }
