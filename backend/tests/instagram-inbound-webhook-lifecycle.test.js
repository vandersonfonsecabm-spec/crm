const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const express = require("express");
const { createCustomer360Service } = require("../src/customer-360/service");
const { mountInstagramWebhookRoutes } = require("../src/integrations/instagramWebhook");
const { createInstagramWebhookIntake } = require("../src/integrations/instagramWebhookIntake");
const { createInstagramWebhookOrchestrator } = require("../src/integrations/instagramWebhookOrchestrator");
const { processInstagramWebhookEvent } = require("../src/integrations/instagramWebhookProcessor");
const { createInstagramMetaSimulator } = require("./helpers/instagram-meta-simulator");

const postgres = process.env.CRM_TEST_DATABASE_PROVIDER === "postgresql";
const suffix = `${Date.now()}-${process.pid}`;
let databasePath;

if (!postgres) {
  const runDir = requiredEnv("CRM_PRISMA_TEST_RUN_DIR");
  databasePath = path.join(runDir, "instagram-inbound-webhook", `instagram-${process.pid}.db`);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.copyFileSync(requiredEnv("CRM_TEST_BASE_DATABASE_PATH"), databasePath);
}

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  CRM_TEST_DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  AUTOMATION_WORKER_ENABLED: "false",
  INSTAGRAM_INTEGRATION_ENABLED: "true",
  INSTAGRAM_INBOUND_ENABLED: "true",
  INSTAGRAM_META_APP_ID: "TEST_INSTAGRAM_APP",
  INSTAGRAM_PROVIDER_ENVIRONMENT: "INSTAGRAM_WEBHOOK_TEST",
});

let prisma;
let server;
let baseUrl;
let simulator;

before(async () => {
  prisma = new PrismaClient({ datasourceUrl: process.env.CRM_TEST_DATABASE_URL });
  const app = express();
  mountInstagramWebhookRoutes({
    app,
    processWebhook: createInstagramWebhookOrchestrator({ prisma }),
  });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  simulator = createInstagramMetaSimulator({
    endpoint: `${baseUrl}/webhooks/instagram`,
    identity: {
      instagramBusinessAccountId: `test-instagram-business-${suffix}`,
      senderId: `test-instagram-sender-${suffix}`,
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

test("transporte valida challenge e HMAC e simulador permanece test-only", async () => {
  const challenge = await fetch(
    `${baseUrl}/webhooks/instagram?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN)}&hub.challenge=instagram-ok`,
  );
  assert.equal(challenge.status, 200);
  assert.equal(await challenge.text(), "instagram-ok");

  const payload = simulator.text({ id: `transport-${suffix}` });
  assert.equal((await simulator.send(payload, { validSignature: false })).status, 401);
  assert.equal((await simulator.sendRaw(Buffer.from("{", "utf8"))).status, 400);

  const previousNodeEnv = process.env.NODE_ENV;
  const previousFlag = process.env.INSTAGRAM_META_SIMULATOR_ENABLED;
  process.env.NODE_ENV = "production";
  process.env.INSTAGRAM_META_SIMULATOR_ENABLED = "true";
  assert.throws(
    () => createInstagramMetaSimulator({
      endpoint: `${baseUrl}/webhooks/instagram`,
      identity: simulator.identity,
    }),
    /somente em test\/dev explicito/,
  );
  process.env.NODE_ENV = previousNodeEnv;
  if (previousFlag === undefined) delete process.env.INSTAGRAM_META_SIMULATOR_ENABLED;
  else process.env.INSTAGRAM_META_SIMULATOR_ENABLED = previousFlag;
});

test("texto assinado cria cadeia Inbox e Cliente 360 uma vez com isolamento", async () => {
  const primary = await seedSyntheticTenant("primary", simulator.identity);
  const isolated = await seedSyntheticTenant("isolated", {
    instagramBusinessAccountId: `test-instagram-isolated-${suffix}`,
    senderId: `test-instagram-isolated-sender-${suffix}`,
  });
  const payload = simulator.text({
    id: `instagram-text-${suffix}`,
    body: "Direct sintetico controlado",
    timestamp: 1784390400000,
  });

  const first = await simulator.send(payload);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { accepted: true });

  const event = await prisma.eventoWebhook.findFirstOrThrow({
    where: { empresaId: primary.tenant.id, externalEventId: `instagram-text-${suffix}` },
  });
  const channel = await prisma.canalIntegracao.findUniqueOrThrow({ where: { id: primary.channel.id } });
  assert.equal(event.provedor, "INSTAGRAM");
  assert.equal(event.tipoEvento, "INSTAGRAM_DIRECT_MESSAGE_RECEIVED");
  assert.equal(event.statusProcessamento, "PROCESSADO");
  assert.ok(event.processadoEm instanceof Date);
  assert.ok(channel.lastWebhookAt instanceof Date);
  assert.ok(channel.verifiedAt instanceof Date);
  assert.ok(channel.connectedAt instanceof Date);

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
  const contact = await prisma.contatoCanal.findFirstOrThrow({ where: { empresaId: primary.tenant.id } });
  assert.equal(contact.telefoneNormalizado, null);
  const lead = await prisma.lead.findFirstOrThrow({ where: { empresaId: primary.tenant.id } });
  assert.equal(lead.origem, "INSTAGRAM");
  const message = await prisma.mensagemCanal.findFirstOrThrow({ where: { empresaId: primary.tenant.id } });
  assert.equal(message.simulada, false);
  assert.equal(message.direcao, "ENTRADA");

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
  assert.equal(overview.contexto.lead?.origem, "INSTAGRAM");
  assert.equal(timeline.data[0].navegacao?.destino, "INBOX");

  const beforeReplay = await evidenceCounts(primary.tenant.id);
  assert.equal((await simulator.send(payload)).status, 200);
  assert.deepEqual(await evidenceCounts(primary.tenant.id), beforeReplay);
  const afterReplay = await prisma.canalIntegracao.findUniqueOrThrow({ where: { id: primary.channel.id } });
  assert.equal(afterReplay.verifiedAt.toISOString(), channel.verifiedAt.toISOString());
  assert.equal(afterReplay.connectedAt.toISOString(), channel.connectedAt.toISOString());

  const isolatedSimulator = simulator.forIdentity({
    instagramBusinessAccountId: isolated.channel.instagramBusinessAccountId,
    senderId: `test-instagram-isolated-sender-${suffix}`,
  });
  isolatedSimulator.configureEnvironment(process.env);
  assert.equal((await isolatedSimulator.send(isolatedSimulator.text({
    id: `instagram-text-${suffix}`,
    body: "Mesmo mid em outro tenant",
  }))).status, 200);
  assert.deepEqual(await commercialCounts(isolated.tenant.id), {
    contacts: 1,
    clients: 1,
    leads: 1,
    conversations: 1,
    messages: 1,
  });
});

test("duas entregas concorrentes do mesmo Direct produzem uma cadeia final", async () => {
  const identity = {
    instagramBusinessAccountId: `test-instagram-concurrent-${suffix}`,
    senderId: `test-instagram-concurrent-sender-${suffix}`,
  };
  const fixture = await seedSyntheticTenant("concurrent", identity);
  const concurrentSimulator = simulator.forIdentity(identity);
  concurrentSimulator.configureEnvironment(process.env);
  const payload = concurrentSimulator.text({ id: `instagram-concurrent-${suffix}` });

  const responses = await Promise.all([
    concurrentSimulator.send(payload),
    concurrentSimulator.send(payload),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.deepEqual(await evidenceCounts(fixture.tenant.id), {
    events: 1,
    contacts: 1,
    clients: 1,
    leads: 1,
    conversations: 1,
    messages: 1,
  });
});

test("status, midia e desconhecido terminam sem mensagem textual falsa", async () => {
  const identity = {
    instagramBusinessAccountId: `test-instagram-terminal-${suffix}`,
    senderId: `test-instagram-terminal-sender-${suffix}`,
  };
  const fixture = await seedSyntheticTenant("terminal", identity);
  const terminalSimulator = simulator.forIdentity(identity);
  terminalSimulator.configureEnvironment(process.env);
  const responses = [
    await terminalSimulator.send(terminalSimulator.status()),
    await terminalSimulator.send(terminalSimulator.media({ id: `instagram-media-${suffix}` })),
    await terminalSimulator.send(terminalSimulator.unknown({ id: `instagram-unknown-${suffix}` })),
    await terminalSimulator.send(terminalSimulator.echo({ id: `instagram-echo-${suffix}` })),
  ];
  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 200]);

  const events = await prisma.eventoWebhook.findMany({
    where: { empresaId: fixture.tenant.id },
    orderBy: { id: "asc" },
  });
  assert.deepEqual(events.map((event) => event.tipoEvento), [
    "INSTAGRAM_DIRECT_STATUS",
    "INSTAGRAM_DIRECT_MEDIA_UNSUPPORTED",
    "INSTAGRAM_DIRECT_IGNORED",
    "INSTAGRAM_DIRECT_IGNORED",
  ]);
  assert.deepEqual(events.map((event) => event.statusProcessamento), [
    "PROCESSADO",
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
});

test("mapeamento ausente e falha pos-intake permanecem fechados e recuperaveis", async () => {
  const absentPayload = simulator.forIdentity({
    instagramBusinessAccountId: `test-instagram-absent-${suffix}`,
    senderId: `test-instagram-absent-sender-${suffix}`,
  }).text({ id: `instagram-absent-${suffix}` });
  assert.equal((await simulator.send(absentPayload)).status, 404);
  assert.equal(await prisma.eventoWebhook.count({
    where: { externalEventId: `instagram-absent-${suffix}` },
  }), 0);

  const pausedIdentity = {
    instagramBusinessAccountId: `test-instagram-paused-${suffix}`,
    senderId: `test-instagram-paused-sender-${suffix}`,
  };
  const pausedFixture = await seedSyntheticTenant("paused", pausedIdentity);
  const pausedSimulator = simulator.forIdentity(pausedIdentity);
  pausedSimulator.configureEnvironment(process.env);
  const pausedPayload = pausedSimulator.text({ id: `instagram-paused-${suffix}` });
  const pausedOrchestrator = createInstagramWebhookOrchestrator({
    prisma,
    processEvent: async (input) => {
      await prisma.canalIntegracao.update({
        where: { id: pausedFixture.channel.id },
        data: { ativo: false, status: "INATIVO" },
      });
      return processInstagramWebhookEvent(input);
    },
  });
  await assert.rejects(
    pausedOrchestrator(pausedPayload),
    (error) => error.status === 409 && error.code === "WEBHOOK_PROCESSING_CONFLICT",
  );
  const pausedChannel = await prisma.canalIntegracao.findUniqueOrThrow({
    where: { id: pausedFixture.channel.id },
  });
  assert.equal(pausedChannel.lastFailureAt, null);
  assert.equal(pausedChannel.lastFailureCode, null);
  assert.deepEqual(await commercialCounts(pausedFixture.tenant.id), {
    contacts: 0,
    clients: 0,
    leads: 0,
    conversations: 0,
    messages: 0,
  });

  const identity = {
    instagramBusinessAccountId: `test-instagram-failure-${suffix}`,
    senderId: `test-instagram-failure-sender-${suffix}`,
  };
  const fixture = await seedSyntheticTenant("failure", identity);
  const failureSimulator = simulator.forIdentity(identity);
  failureSimulator.configureEnvironment(process.env);
  const payload = failureSimulator.text({ id: `instagram-failure-${suffix}` });
  const receiptAt = new Date("2026-07-30T20:00:00.000Z");
  const failureAt = new Date("2026-07-30T20:00:01.000Z");
  const failing = createInstagramWebhookOrchestrator({
    prisma,
    intake: createInstagramWebhookIntake({ prisma, clock: () => receiptAt }),
    processEvent: async () => {
      const error = new Error("payload=private token=private");
      error.code = "unsafe payload=private";
      throw error;
    },
    clock: () => failureAt,
  });
  await assert.rejects(failing(payload), (error) => error.code === "WEBHOOK_PROCESSING_UNAVAILABLE");

  const event = await prisma.eventoWebhook.findFirstOrThrow({
    where: { empresaId: fixture.tenant.id, externalEventId: `instagram-failure-${suffix}` },
  });
  const failedChannel = await prisma.canalIntegracao.findUniqueOrThrow({ where: { id: fixture.channel.id } });
  assert.equal(event.statusProcessamento, "RECEBIDO");
  assert.equal(failedChannel.lastFailureAt.toISOString(), failureAt.toISOString());
  assert.equal(failedChannel.lastFailureCode, "INSTAGRAM_EVENT_PROCESSING_UNAVAILABLE");
  assert.equal(JSON.stringify(failedChannel).includes("private"), false);
  assert.deepEqual(await commercialCounts(fixture.tenant.id), {
    contacts: 0,
    clients: 0,
    leads: 0,
    conversations: 0,
    messages: 0,
  });

  assert.deepEqual(await createInstagramWebhookOrchestrator({ prisma })(payload), { accepted: true });
  assert.equal(await prisma.eventoWebhook.count({
    where: { empresaId: fixture.tenant.id, externalEventId: `instagram-failure-${suffix}` },
  }), 1);
  assert.equal((await commercialCounts(fixture.tenant.id)).messages, 1);
});

test("falha concorrente atrasada nao sobrescreve processamento concluido", async () => {
  const identity = {
    instagramBusinessAccountId: `test-instagram-failure-race-${suffix}`,
    senderId: `test-instagram-failure-race-sender-${suffix}`,
  };
  const fixture = await seedSyntheticTenant("failure-race", identity);
  const raceSimulator = simulator.forIdentity(identity);
  raceSimulator.configureEnvironment(process.env);
  const payload = raceSimulator.text({ id: `instagram-failure-race-${suffix}` });
  let releaseFailure;
  let signalFailureStarted;
  const failureStarted = new Promise((resolve) => {
    signalFailureStarted = resolve;
  });
  const waitForSuccess = new Promise((resolve) => {
    releaseFailure = resolve;
  });
  const delayedFailure = createInstagramWebhookOrchestrator({
    prisma,
    processEvent: async () => {
      signalFailureStarted();
      await waitForSuccess;
      const error = new Error("Falha sintetica atrasada.");
      error.code = "INSTAGRAM_DELAYED_FAILURE";
      throw error;
    },
  });

  const delayedResult = delayedFailure(payload);
  await failureStarted;
  assert.deepEqual(await createInstagramWebhookOrchestrator({ prisma })(payload), { accepted: true });
  releaseFailure();
  await assert.rejects(
    delayedResult,
    (error) => error.status === 503 && error.code === "WEBHOOK_PROCESSING_UNAVAILABLE",
  );

  const event = await prisma.eventoWebhook.findFirstOrThrow({
    where: { empresaId: fixture.tenant.id, externalEventId: `instagram-failure-race-${suffix}` },
  });
  const channel = await prisma.canalIntegracao.findUniqueOrThrow({
    where: { id: fixture.channel.id },
  });
  assert.equal(event.statusProcessamento, "PROCESSADO");
  assert.equal(event.processadoEm instanceof Date, true);
  assert.equal(channel.lastFailureAt, null);
  assert.equal(channel.lastFailureCode, null);
  assert.deepEqual(await commercialCounts(fixture.tenant.id), {
    contacts: 1,
    clients: 1,
    leads: 1,
    conversations: 1,
    messages: 1,
  });
});

async function seedSyntheticTenant(label, identity) {
  const tenant = await prisma.empresa.create({
    data: { nome: `Tenant Instagram ${label} ${suffix}`, slug: `instagram-${label}-${suffix}` },
  });
  const channel = await prisma.canalIntegracao.create({
    data: {
      empresaId: tenant.id,
      tipo: "INSTAGRAM_META",
      nome: `Instagram sintetico ${label}`,
      chaveInterna: "instagram-meta-inbound-real",
      publicId: `instagram-channel-${label}-${suffix}`,
      status: "ATIVO",
      modoTeste: false,
      ativo: true,
      providerEnvironment: process.env.INSTAGRAM_PROVIDER_ENVIRONMENT,
      metaAppId: process.env.INSTAGRAM_META_APP_ID,
      instagramBusinessAccountId: identity.instagramBusinessAccountId,
      instagramUsernameMasked: "@test_***",
    },
  });
  for (const chave of ["INSTAGRAM_INTEGRATION", "INSTAGRAM_INBOUND"]) {
    await prisma.empresaFuncionalidade.create({
      data: {
        empresaId: tenant.id,
        chave,
        habilitada: true,
        habilitadoEm: new Date(),
      },
    });
  }
  return { channel, tenant };
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
