const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const express = require("express");
const { createCustomer360Service } = require("../src/customer-360/service");
const { createWhatsappInboundLifecycleService } = require("../src/integrations/whatsappInboundLifecycle");
const { mountWhatsAppWebhookRoutes } = require("../src/integrations/whatsappWebhook");
const { createWhatsAppWebhookIntake } = require("../src/integrations/whatsappWebhookIntake");
const { createWhatsAppWebhookOrchestrator } = require("../src/integrations/whatsappWebhookOrchestrator");
const { processWhatsAppWebhookEvent } = require("../src/integrations/whatsappWebhookProcessor");
const { createWhatsAppMetaSimulator } = require("./helpers/whatsapp-meta-simulator");

const postgres = process.env.CRM_TEST_DATABASE_PROVIDER === "postgresql";
const suffix = `${Date.now()}-${process.pid}`;
let databasePath;

if (!postgres) {
  const runDir = requiredEnv("CRM_PRISMA_TEST_RUN_DIR");
  databasePath = path.join(runDir, "whatsapp-inbound-f1c2c", `f1c2c-${process.pid}.db`);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.copyFileSync(requiredEnv("CRM_TEST_BASE_DATABASE_PATH"), databasePath);
}

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  CRM_TEST_DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  AUTOMATION_WORKER_ENABLED: "false",
  WHATSAPP_INTEGRATION_ENABLED: "true",
  WHATSAPP_INBOUND_ENABLED: "true",
  WHATSAPP_OUTBOUND_ENABLED: "false",
  WHATSAPP_META_APP_ID: "TEST_APP_F1C2C",
  WHATSAPP_PROVIDER_ENVIRONMENT: "F1C2C_TEST",
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "test-only-verify-token-f1c2c",
});

let prisma;
let server;
let baseUrl;
let simulator;

before(async () => {
  prisma = new PrismaClient({ datasourceUrl: process.env.CRM_TEST_DATABASE_URL });
  const app = express();
  mountWhatsAppWebhookRoutes({
    app,
    processWebhook: createWhatsAppWebhookOrchestrator({ prisma }),
  });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  simulator = createWhatsAppMetaSimulator({
    endpoint: `${baseUrl}/webhooks/whatsapp`,
    identity: {
      wabaId: `test-waba-f1c2c-${suffix}`,
      phoneNumberId: `test-phone-f1c2c-${suffix}`,
      senderId: "15550000001",
    },
  });
  simulator.configureEnvironment(process.env);
});

after(async () => {
  if (server) {
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (prisma) await prisma.$disconnect();
  if (databasePath) removeDatabase(databasePath);
});

test("texto assinado completa intake, Inbox, Cliente 360, replay e lifecycle sem duplicacao", async () => {
  const primary = await seedSyntheticTenant("primary", simulator.identity);
  const isolated = await seedSyntheticTenant("isolated", {
    wabaId: `test-waba-isolated-${suffix}`,
    phoneNumberId: `test-phone-isolated-${suffix}`,
    senderId: "15550000002",
  });
  const fixture = simulator.text({
    id: `test-text-${suffix}`,
    body: "Mensagem sintetica controlada",
    timestamp: "1784390400",
  });

  const first = await simulator.send(fixture);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { accepted: true });

  const event = await prisma.eventoWebhook.findFirstOrThrow({
    where: { empresaId: primary.tenant.id, externalEventId: `test-text-${suffix}` },
  });
  const channelAfterText = await prisma.canalIntegracao.findUniqueOrThrow({
    where: { id: primary.channel.id },
  });
  assert.equal(event.statusProcessamento, "PROCESSADO");
  assert.ok(event.processadoEm instanceof Date);
  assert.ok(channelAfterText.lastWebhookAt instanceof Date);
  assert.ok(channelAfterText.verifiedAt instanceof Date);
  assert.ok(channelAfterText.connectedAt instanceof Date);
  assert.ok(channelAfterText.lastWebhookAt.getTime() <= channelAfterText.verifiedAt.getTime());

  assert.deepEqual(await commercialCounts(primary.tenant.id), {
    contacts: 1,
    clients: 1,
    leads: 1,
    conversations: 1,
    messages: 1,
  });
  assert.deepEqual(await commercialCounts(isolated.tenant.id), {
    contacts: 0,
    clients: 0,
    leads: 0,
    conversations: 0,
    messages: 0,
  });

  const contact = await prisma.contatoCanal.findFirstOrThrow({
    where: { empresaId: primary.tenant.id },
  });
  const customer360 = createCustomer360Service({ prisma });
  const overview = await customer360.getOverview(
    { empresaId: primary.tenant.id },
    contact.clienteId,
  );
  const timeline = await customer360.getTimeline(
    { empresaId: primary.tenant.id },
    contact.clienteId,
    { tipo: "MENSAGEM" },
  );
  assert.equal(overview.resumo.conversas, 1);
  assert.equal(overview.resumo.mensagens, 1);
  assert.equal(overview.contexto.lead?.origem, "WHATSAPP");
  assert.equal(timeline.data.length, 1);
  assert.equal(timeline.data[0].navegacao?.destino, "INBOX");

  const beforeReplay = await evidenceCounts(primary.tenant.id);
  const replay = await simulator.send(fixture);
  assert.equal(replay.status, 200);
  assert.deepEqual(await evidenceCounts(primary.tenant.id), beforeReplay);
  const channelAfterReplay = await prisma.canalIntegracao.findUniqueOrThrow({
    where: { id: primary.channel.id },
  });
  assert.equal(channelAfterReplay.verifiedAt.toISOString(), channelAfterText.verifiedAt.toISOString());
  assert.equal(channelAfterReplay.connectedAt.toISOString(), channelAfterText.connectedAt.toISOString());

  const lifecycle = createWhatsappInboundLifecycleService({ prisma, logger: { info() {} } });
  const paused = await lifecycle.pause({
    tenantId: primary.tenant.id,
    actorUserId: primary.actor.id,
    body: {
      expectedUpdatedAt: channelAfterReplay.updatedAt.toISOString(),
      reason: "Pausa sintetica F1C-2C",
    },
  });
  assert.equal(paused.state, "PAUSED");
  const pausedChannel = await prisma.canalIntegracao.findUniqueOrThrow({
    where: { id: primary.channel.id },
  });
  const reactivated = await lifecycle.reactivate({
    tenantId: primary.tenant.id,
    actorUserId: primary.actor.id,
    body: {
      expectedUpdatedAt: pausedChannel.updatedAt.toISOString(),
      reason: "Reativacao sintetica F1C-2C",
    },
  });
  assert.equal(reactivated.state, "CONNECTED");
  const finalChannel = await prisma.canalIntegracao.findUniqueOrThrow({
    where: { id: primary.channel.id },
  });
  assert.deepEqual(operationalTimestamps(finalChannel), operationalTimestamps(channelAfterReplay));
});

test("status, midia e tipo desconhecido terminam com HTTP 200 sem mensagem textual falsa", async () => {
  const identity = {
    wabaId: `test-waba-terminal-${suffix}`,
    phoneNumberId: `test-phone-terminal-${suffix}`,
    senderId: "15550000003",
  };
  const terminalSimulator = simulator.forIdentity(identity);
  terminalSimulator.configureEnvironment(process.env);
  const fixture = await seedSyntheticTenant("terminal", identity);

  const responses = [
    await terminalSimulator.send(terminalSimulator.status({
      messageId: `test-status-source-${suffix}`,
      timestamp: "1784390401",
    })),
    await terminalSimulator.send(terminalSimulator.media({
      id: `test-media-${suffix}`,
      timestamp: "1784390402",
    })),
    await terminalSimulator.send(terminalSimulator.unknown({
      id: `test-unknown-${suffix}`,
      timestamp: "1784390403",
    })),
  ];
  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200]);

  const events = await prisma.eventoWebhook.findMany({
    where: { empresaId: fixture.tenant.id },
    orderBy: { id: "asc" },
  });
  assert.deepEqual(events.map((event) => event.tipoEvento), [
    "WHATSAPP_MESSAGE_STATUS",
    "WHATSAPP_MESSAGE_MEDIA_UNSUPPORTED",
    "WHATSAPP_MESSAGE_IGNORED",
  ]);
  assert.deepEqual(events.map((event) => event.statusProcessamento), [
    "PROCESSADO",
    "PROCESSADO",
    "PROCESSADO",
  ]);
  assert.deepEqual(await commercialCounts(fixture.tenant.id), {
    contacts: 0,
    clients: 0,
    leads: 0,
    conversations: 0,
    messages: 0,
  });
  const channel = await prisma.canalIntegracao.findUniqueOrThrow({ where: { id: fixture.channel.id } });
  assert.ok(channel.lastWebhookAt instanceof Date);
  assert.equal(channel.verifiedAt, null);
  assert.equal(channel.connectedAt, null);

  const replayCounts = await evidenceCounts(fixture.tenant.id);
  assert.equal((await terminalSimulator.send(terminalSimulator.media({
    id: `test-media-${suffix}`,
    timestamp: "1784390402",
  }))).status, 200);
  assert.deepEqual(await evidenceCounts(fixture.tenant.id), replayCounts);
});

test("assinatura, mapeamento e falha pos-intake permanecem fechados e sanitizados", async () => {
  const absentIdentity = {
    wabaId: `test-waba-absent-${suffix}`,
    phoneNumberId: `test-phone-absent-${suffix}`,
    senderId: "15550000004",
  };
  const absentSimulator = simulator.forIdentity(absentIdentity);
  absentSimulator.configureEnvironment(process.env);
  const absentPayload = absentSimulator.text({ id: `test-absent-${suffix}` });

  assert.equal((await absentSimulator.send(absentPayload, { validSignature: false })).status, 401);
  assert.equal((await absentSimulator.sendRaw(Buffer.from("{", "utf8"))).status, 400);
  assert.equal((await absentSimulator.send(absentPayload)).status, 404);
  assert.equal(await prisma.eventoWebhook.count({
    where: { externalEventId: `test-absent-${suffix}` },
  }), 0);

  const ambiguousIdentity = {
    wabaId: `test-waba-ambiguous-${suffix}`,
    phoneNumberId: `test-phone-ambiguous-${suffix}`,
    senderId: "15550000005",
  };
  await seedSyntheticTenant("ambiguous-a", ambiguousIdentity);
  await seedSyntheticTenant("ambiguous-b", ambiguousIdentity, {
    metaAppId: "TEST_APP_AMBIGUOUS_ALT",
    providerEnvironment: "F1C2C_ALT",
  });
  const ambiguousSimulator = simulator.forIdentity(ambiguousIdentity);
  ambiguousSimulator.configureEnvironment(process.env);
  assert.equal((await ambiguousSimulator.send(ambiguousSimulator.text({
    id: `test-ambiguous-${suffix}`,
  }))).status, 503);
  assert.equal(await prisma.eventoWebhook.count({
    where: { externalEventId: `test-ambiguous-${suffix}` },
  }), 0);

  const failureIdentity = {
    wabaId: `test-waba-failure-${suffix}`,
    phoneNumberId: `test-phone-failure-${suffix}`,
    senderId: "15550000006",
  };
  const failureFixture = await seedSyntheticTenant("failure", failureIdentity);
  const failureSimulator = simulator.forIdentity(failureIdentity);
  failureSimulator.configureEnvironment(process.env);
  const payload = failureSimulator.text({ id: `test-failure-${suffix}` });
  const firstReceiptAt = new Date("2026-07-30T20:00:00.000Z");
  const failureAt = new Date("2026-07-30T20:00:01.000Z");
  const recoveryReceiptAt = new Date("2026-07-30T20:00:02.000Z");
  const failingOrchestrator = createWhatsAppWebhookOrchestrator({
    prisma,
    intake: createWhatsAppWebhookIntake({ prisma, clock: () => firstReceiptAt }),
    processEvent: async () => {
      const error = new Error("payload=private token=private");
      error.code = "unsafe payload=private";
      throw error;
    },
    clock: () => failureAt,
  });
  await assert.rejects(
    failingOrchestrator(payload),
    (error) => error.code === "WEBHOOK_PROCESSING_UNAVAILABLE",
  );
  const durableEvent = await prisma.eventoWebhook.findFirstOrThrow({
    where: { empresaId: failureFixture.tenant.id, externalEventId: `test-failure-${suffix}` },
  });
  const failedChannel = await prisma.canalIntegracao.findUniqueOrThrow({
    where: { id: failureFixture.channel.id },
  });
  assert.equal(durableEvent.statusProcessamento, "RECEBIDO");
  assert.ok(failedChannel.lastFailureAt instanceof Date);
  assert.equal(failedChannel.lastFailureAt.toISOString(), failureAt.toISOString());
  assert.equal(failedChannel.lastFailureCode, "WHATSAPP_EVENT_PROCESSING_UNAVAILABLE");
  assert.equal(JSON.stringify(failedChannel).includes("private"), false);
  assert.deepEqual(await commercialCounts(failureFixture.tenant.id), {
    contacts: 0,
    clients: 0,
    leads: 0,
    conversations: 0,
    messages: 0,
  });
  const lifecycle = createWhatsappInboundLifecycleService({ prisma, logger: { info() {} } });
  assert.equal((await lifecycle.getStatus({ tenantId: failureFixture.tenant.id })).state, "ERROR");

  const recovered = await createWhatsAppWebhookOrchestrator({
    prisma,
    intake: createWhatsAppWebhookIntake({ prisma, clock: () => recoveryReceiptAt }),
  })(payload);
  assert.deepEqual(recovered, { accepted: true });
  assert.equal(await prisma.eventoWebhook.count({
    where: { empresaId: failureFixture.tenant.id, externalEventId: `test-failure-${suffix}` },
  }), 1);
  assert.equal((await commercialCounts(failureFixture.tenant.id)).messages, 1);
  assert.equal((await lifecycle.getStatus({ tenantId: failureFixture.tenant.id })).state, "CONNECTED");
});

async function seedSyntheticTenant(label, identity, channelOverrides = {}) {
  const tenant = await prisma.empresa.create({
    data: { nome: `Tenant sintetico ${label} ${suffix}`, slug: `test-${label}-${suffix}` },
  });
  const actor = await prisma.usuario.create({
    data: {
      empresaId: tenant.id,
      nome: `Operador sintetico ${label}`,
      email: `test-${label}-${suffix}@example.invalid`,
      senhaHash: "test-only-not-a-real-password",
      papel: "ADMIN",
      ativo: true,
    },
  });
  const channel = await prisma.canalIntegracao.create({
    data: {
      empresaId: tenant.id,
      tipo: "WHATSAPP_META",
      nome: `WhatsApp sintetico ${label}`,
      chaveInterna: "whatsapp-meta-inbound-real",
      publicId: `test-channel-${label}-${suffix}`,
      status: "ATIVO",
      modoTeste: false,
      ativo: true,
      providerEnvironment: process.env.WHATSAPP_PROVIDER_ENVIRONMENT,
      metaAppId: process.env.WHATSAPP_META_APP_ID,
      wabaId: identity.wabaId,
      phoneNumberId: identity.phoneNumberId,
      ...channelOverrides,
    },
  });
  for (const chave of ["WHATSAPP_INTEGRATION", "WHATSAPP_INBOUND"]) {
    await prisma.empresaFuncionalidade.create({
      data: {
        empresaId: tenant.id,
        chave,
        habilitada: true,
        habilitadoEm: new Date(),
      },
    });
  }
  return { actor, channel, tenant };
}

async function commercialCounts(empresaId) {
  const [contacts, clients, leads, conversations, messages] = await Promise.all([
    prisma.contatoCanal.count({ where: { empresaId } }),
    prisma.cliente.count({ where: { empresaId } }),
    prisma.lead.count({ where: { empresaId } }),
    prisma.conversaCanal.count({ where: { empresaId } }),
    prisma.mensagemCanal.count({ where: { empresaId } }),
  ]);
  return { contacts, clients, leads, conversations, messages };
}

async function evidenceCounts(empresaId) {
  return {
    events: await prisma.eventoWebhook.count({ where: { empresaId } }),
    ...(await commercialCounts(empresaId)),
  };
}

function operationalTimestamps(channel) {
  return {
    connectedAt: channel.connectedAt?.toISOString() || null,
    verifiedAt: channel.verifiedAt?.toISOString() || null,
    lastWebhookAt: channel.lastWebhookAt?.toISOString() || null,
  };
}

function databaseUrl(file) {
  return `file:${path.resolve(file).replace(/\\/g, "/")}`;
}

function removeDatabase(file) {
  for (const suffixValue of ["", "-wal", "-shm", "-journal"]) {
    const candidate = `${file}${suffixValue}`;
    if (fs.existsSync(candidate)) fs.rmSync(candidate, { force: true });
  }
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} e obrigatoria para teste isolado.`);
  return value;
}
