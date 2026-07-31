const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const express = require("express");
const { createCustomer360Service } = require("../src/customer-360/service");
const { createLeadsCommunicationServices } = require("../src/leads-communication/services");
const {
  MAX_WEBHOOK_BODY_BYTES,
  mountMessengerWebhookRoutes,
} = require("../src/integrations/messengerWebhook");
const {
  MAX_ENTRIES_PER_REQUEST,
  MAX_EVENTS_PER_ENTRY,
  MAX_TOTAL_EVENTS_PER_REQUEST,
  createMessengerWebhookIntake,
} = require("../src/integrations/messengerWebhookIntake");
const { createMessengerWebhookOrchestrator } = require("../src/integrations/messengerWebhookOrchestrator");
const { processMessengerWebhookEvent } = require("../src/integrations/messengerWebhookProcessor");
const { createMessengerMetaSimulator } = require("./helpers/messenger-meta-simulator");

const postgres = process.env.CRM_TEST_DATABASE_PROVIDER === "postgresql";
const suffix = `${Date.now()}-${process.pid}`;
let databasePath;

if (!postgres) {
  const runDir = requiredEnv("CRM_PRISMA_TEST_RUN_DIR");
  databasePath = path.join(runDir, "messenger-inbound-webhook", `messenger-${process.pid}.db`);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.copyFileSync(requiredEnv("CRM_TEST_BASE_DATABASE_PATH"), databasePath);
}

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  CRM_TEST_DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  AUTOMATION_WORKER_ENABLED: "false",
  MESSENGER_INTEGRATION_ENABLED: "true",
  MESSENGER_INBOUND_ENABLED: "true",
  MESSENGER_META_APP_ID: "TEST_MESSENGER_APP",
  MESSENGER_PROVIDER_ENVIRONMENT: "MESSENGER_WEBHOOK_TEST",
});

let prisma;
let server;
let baseUrl;
let simulator;

before(async () => {
  prisma = new PrismaClient({ datasourceUrl: process.env.CRM_TEST_DATABASE_URL });
  const app = express();
  mountMessengerWebhookRoutes({
    app,
    processWebhook: createMessengerWebhookOrchestrator({ prisma }),
  });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  simulator = createMessengerMetaSimulator({
    endpoint: `${baseUrl}/webhooks/messenger`,
    identity: {
      messengerPageId: `test-messenger-business-${suffix}`,
      psid: `test-messenger-sender-${suffix}`,
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
    `${baseUrl}/webhooks/messenger?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(process.env.MESSENGER_WEBHOOK_VERIFY_TOKEN)}&hub.challenge=messenger-ok`,
  );
  assert.equal(challenge.status, 200);
  assert.equal(await challenge.text(), "messenger-ok");

  const payload = simulator.text({ id: `transport-${suffix}` });
  assert.equal((await simulator.send(payload, { validSignature: false })).status, 401);
  assert.equal((await simulator.sendRaw(Buffer.from("{", "utf8"))).status, 400);

  const previousNodeEnv = process.env.NODE_ENV;
  const previousFlag = process.env.MESSENGER_META_SIMULATOR_ENABLED;
  process.env.NODE_ENV = "production";
  process.env.MESSENGER_META_SIMULATOR_ENABLED = "true";
  assert.throws(
    () => createMessengerMetaSimulator({
      endpoint: `${baseUrl}/webhooks/messenger`,
      identity: simulator.identity,
    }),
    /somente em test\/dev explicito/,
  );
  process.env.NODE_ENV = previousNodeEnv;
  if (previousFlag === undefined) delete process.env.MESSENGER_META_SIMULATOR_ENABLED;
  else process.env.MESSENGER_META_SIMULATOR_ENABLED = previousFlag;
});

test("transporte aceita somente Content-Encoding ausente ou identity unico", async () => {
  const env = {
    MESSENGER_APP_SECRET: crypto.randomBytes(32).toString("hex"),
    MESSENGER_INBOUND_ENABLED: "true",
    MESSENGER_INTEGRATION_ENABLED: "true",
  };
  let processorCalls = 0;
  const transportApp = express();
  mountMessengerWebhookRoutes({
    app: transportApp,
    env,
    processWebhook: async () => {
      processorCalls += 1;
    },
  });
  const transportServer = await listen(transportApp);
  const port = transportServer.address().port;
  const raw = Buffer.from(JSON.stringify(simulator.text({ id: `encoding-${suffix}` })), "utf8");
  const signature = crypto.createHmac("sha256", env.MESSENGER_APP_SECRET).update(raw).digest("hex");

  try {
    assert.equal((await sendExactHttpRequest(port, raw, signature)).status, 200);
    assert.equal((await sendExactHttpRequest(port, raw, signature, [
      "Content-Encoding: identity",
    ])).status, 200);
    assert.equal(processorCalls, 2);

    for (const headers of [
      ["Content-Encoding: identity", "Content-Encoding: identity"],
      ["Content-Encoding: identity, gzip"],
      ["Content-Encoding: gzip"],
      ["Content-Encoding: deflate"],
      ["Content-Encoding: br"],
      ["Content-Encoding: identity", "Content-Encoding: gzip"],
    ]) {
      const response = await sendExactHttpRequest(port, raw, signature, headers);
      assert.equal(response.status, 415);
      assert.equal(response.body.codigo, "UNSUPPORTED_MEDIA_TYPE");
    }
    assert.equal(processorCalls, 2);

    const oversized = Buffer.alloc(MAX_WEBHOOK_BODY_BYTES + 1, 0x20);
    const oversizedSignature = crypto.createHmac("sha256", env.MESSENGER_APP_SECRET)
      .update(oversized)
      .digest("hex");
    const oversizedResponse = await sendExactHttpRequest(port, oversized, oversizedSignature);
    assert.equal(oversizedResponse.status, 413);
    assert.equal(oversizedResponse.body.codigo, "WEBHOOK_PAYLOAD_TOO_LARGE");
    assert.equal(processorCalls, 2);

    env.MESSENGER_INTEGRATION_ENABLED = "false";
    env.MESSENGER_INBOUND_ENABLED = "false";
    assert.equal((await fetch(`http://127.0.0.1:${port}/webhooks/messenger`)).status, 404);
    assert.equal((await sendExactHttpRequest(port, raw, signature)).status, 404);
    assert.equal(processorCalls, 2);
  } finally {
    if (typeof transportServer.closeAllConnections === "function") {
      transportServer.closeAllConnections();
    }
    await new Promise((resolve) => transportServer.close(resolve));
  }
});

test("limites e identidade unica rejeitam o lote inteiro antes de persistir", async () => {
  const identity = {
    messengerPageId: `test-messenger-batch-${suffix}`,
    psid: `test-messenger-batch-sender-${suffix}`,
  };
  const otherIdentity = {
    messengerPageId: `test-messenger-batch-other-${suffix}`,
    psid: `test-messenger-batch-other-sender-${suffix}`,
  };
  const fixture = await seedSyntheticTenant("batch", identity);
  const otherFixture = await seedSyntheticTenant("batch-other", otherIdentity);
  const batchSimulator = simulator.forIdentity(identity);
  batchSimulator.configureEnvironment(process.env);

  const accepted = batchPayload(identity, [MAX_EVENTS_PER_ENTRY, 4, 1], 1784390500000);
  assert.equal(accepted.entry.length, MAX_ENTRIES_PER_REQUEST);
  assert.equal(accepted.entry[0].messaging.length, MAX_EVENTS_PER_ENTRY);
  assert.equal(
    accepted.entry.reduce((total, entry) => total + entry.messaging.length, 0),
    MAX_TOTAL_EVENTS_PER_REQUEST,
  );
  assert.equal((await batchSimulator.send(accepted)).status, 200);
  assert.equal(await prisma.eventoWebhook.count({ where: { empresaId: fixture.tenant.id } }), 10);
  assert.equal((await batchSimulator.send(accepted)).status, 200);
  assert.equal(await prisma.eventoWebhook.count({ where: { empresaId: fixture.tenant.id } }), 10);

  const before = await batchEvidence(fixture, otherFixture);
  const excessiveEntries = batchPayload(
    identity,
    Array(MAX_ENTRIES_PER_REQUEST + 1).fill(1),
    1784390600000,
  );
  const excessivePerEntry = batchPayload(identity, [MAX_EVENTS_PER_ENTRY + 1], 1784390700000);
  const excessiveTotal = batchPayload(
    identity,
    Array(MAX_ENTRIES_PER_REQUEST).fill(Math.ceil((MAX_TOTAL_EVENTS_PER_REQUEST + 1) / MAX_ENTRIES_PER_REQUEST)),
    1784390800000,
  );
  const mixedIdentities = {
    object: "page",
    entry: [
      batchPayload(identity, [1], 1784390900000).entry[0],
      batchPayload(otherIdentity, [1], 1784391000000).entry[0],
    ],
  };

  for (const payload of [excessiveEntries, excessivePerEntry, excessiveTotal]) {
    const response = await batchSimulator.send(payload);
    assert.equal(response.status, 413);
    assert.equal(response.body.codigo, "WEBHOOK_BATCH_LIMIT_EXCEEDED");
    assert.deepEqual(await batchEvidence(fixture, otherFixture), before);
  }
  const mixed = await batchSimulator.send(mixedIdentities);
  assert.equal(mixed.status, 400);
  assert.equal(mixed.body.codigo, "WEBHOOK_PAYLOAD_INVALID");
  assert.deepEqual(await batchEvidence(fixture, otherFixture), before);
});

test("texto assinado cria cadeia Inbox e Cliente 360 uma vez com isolamento", async () => {
  const primary = await seedSyntheticTenant("primary", simulator.identity);
  const isolated = await seedSyntheticTenant("isolated", {
    messengerPageId: `test-messenger-isolated-${suffix}`,
    psid: simulator.identity.psid,
  });
  const payload = simulator.text({
    id: `messenger-text-${suffix}`,
    body: "Direct sintetico controlado",
    timestamp: 1784390400000,
  });

  const first = await simulator.send(payload);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { accepted: true });

  const event = await prisma.eventoWebhook.findFirstOrThrow({
    where: { empresaId: primary.tenant.id, externalEventId: `messenger-text-${suffix}` },
  });
  const channel = await prisma.canalIntegracao.findUniqueOrThrow({ where: { id: primary.channel.id } });
  assert.equal(event.provedor, "MESSENGER");
  assert.equal(event.tipoEvento, "MESSENGER_MESSAGE_RECEIVED");
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
  assert.equal(lead.origem, "MESSENGER");
  const message = await prisma.mensagemCanal.findFirstOrThrow({ where: { empresaId: primary.tenant.id } });
  assert.equal(message.simulada, false);
  assert.equal(message.direcao, "ENTRADA");

  const inbox = createLeadsCommunicationServices({ prisma });
  const inboxContext = {
    empresaId: primary.tenant.id,
    usuarioId: -1,
    papel: "ADMIN",
  };
  const inboxConversations = await inbox.listConversations(inboxContext);
  assert.equal(inboxConversations.pagination.total, 1);
  assert.equal(inboxConversations.data[0].tipoCanal, "MESSENGER_META");
  assert.equal(inboxConversations.data[0].podeResponderDiretamente, false);
  assert.equal(inboxConversations.data[0].ultimaMensagem.texto, "Direct sintetico controlado");
  const inboxMessages = await inbox.listMessages(inboxContext, message.conversaCanalId);
  assert.equal(inboxMessages.pagination.total, 1);
  assert.equal(inboxMessages.data[0].externalId, `messenger-text-${suffix}`);

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
  assert.equal(overview.contexto.lead?.origem, "MESSENGER");
  assert.equal(timeline.data[0].navegacao?.destino, "INBOX");

  const beforeReplay = await evidenceCounts(primary.tenant.id);
  const automationBeforeReplay = await automationCounts(primary.tenant.id);
  assert.equal((await simulator.send(payload)).status, 200);
  assert.deepEqual(await evidenceCounts(primary.tenant.id), beforeReplay);
  assert.deepEqual(await automationCounts(primary.tenant.id), automationBeforeReplay);
  const afterReplay = await prisma.canalIntegracao.findUniqueOrThrow({ where: { id: primary.channel.id } });
  assert.equal(afterReplay.verifiedAt.toISOString(), channel.verifiedAt.toISOString());
  assert.equal(afterReplay.connectedAt.toISOString(), channel.connectedAt.toISOString());

  const isolatedSimulator = simulator.forIdentity({
    messengerPageId: isolated.channel.messengerPageId,
    psid: simulator.identity.psid,
  });
  isolatedSimulator.configureEnvironment(process.env);
  assert.equal((await isolatedSimulator.send(isolatedSimulator.text({
    id: `messenger-text-${suffix}`,
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
    messengerPageId: `test-messenger-concurrent-${suffix}`,
    psid: `test-messenger-concurrent-sender-${suffix}`,
  };
  const fixture = await seedSyntheticTenant("concurrent", identity);
  const concurrentSimulator = simulator.forIdentity(identity);
  concurrentSimulator.configureEnvironment(process.env);
  const payload = concurrentSimulator.text({ id: `messenger-concurrent-${suffix}` });

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

test("dois mids concorrentes do mesmo PSID compartilham contato, cliente, lead e conversa", async () => {
  const identity = {
    messengerPageId: `test-messenger-concurrent-mids-${suffix}`,
    psid: `test-messenger-concurrent-mids-sender-${suffix}`,
  };
  const fixture = await seedSyntheticTenant("concurrent-mids", identity);
  const concurrentSimulator = simulator.forIdentity(identity);
  concurrentSimulator.configureEnvironment(process.env);
  const payloads = [
    concurrentSimulator.text({
      id: `messenger-concurrent-mid-a-${suffix}`,
      body: "Mensagem concorrente A",
      timestamp: 1784390400100,
    }),
    concurrentSimulator.text({
      id: `messenger-concurrent-mid-b-${suffix}`,
      body: "Mensagem concorrente B",
      timestamp: 1784390400200,
    }),
  ];

  const responses = await Promise.all(payloads.map((payload) => concurrentSimulator.send(payload)));
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.deepEqual(await evidenceCounts(fixture.tenant.id), {
    events: 2,
    contacts: 1,
    clients: 1,
    leads: 1,
    conversations: 1,
    messages: 2,
  });
  const contact = await prisma.contatoCanal.findFirstOrThrow({
    where: { empresaId: fixture.tenant.id },
  });
  assert.equal(contact.externalId, identity.psid);
  assert.equal(contact.telefoneNormalizado, null);
});

test("status, midia e desconhecido terminam sem mensagem textual falsa", async () => {
  const identity = {
    messengerPageId: `test-messenger-terminal-${suffix}`,
    psid: `test-messenger-terminal-sender-${suffix}`,
  };
  const fixture = await seedSyntheticTenant("terminal", identity);
  const terminalSimulator = simulator.forIdentity(identity);
  terminalSimulator.configureEnvironment(process.env);
  const responses = [
    await terminalSimulator.send(terminalSimulator.status()),
    await terminalSimulator.send(terminalSimulator.media({ id: `messenger-media-${suffix}` })),
    await terminalSimulator.send(terminalSimulator.unknown({ id: `messenger-unknown-${suffix}` })),
    await terminalSimulator.send(terminalSimulator.echo({ id: `messenger-echo-${suffix}` })),
    await terminalSimulator.send(terminalSimulator.echo({
      id: `messenger-echo-attachment-${suffix}`,
      withAttachment: true,
    })),
  ];
  for (const response of responses) {
    assert.equal(response.status, 200, response.body?.codigo || "Resposta inesperada.");
  }

  const events = await prisma.eventoWebhook.findMany({
    where: { empresaId: fixture.tenant.id },
    orderBy: { id: "asc" },
  });
  assert.deepEqual(events.map((event) => event.tipoEvento), [
    "MESSENGER_STATUS",
    "MESSENGER_ATTACHMENT_UNSUPPORTED",
    "MESSENGER_IGNORED",
    "MESSENGER_IGNORED",
    "MESSENGER_IGNORED",
  ]);
  assert.deepEqual(events.map((event) => event.statusProcessamento), [
    "PROCESSADO",
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
    messengerPageId: `test-messenger-absent-${suffix}`,
    psid: `test-messenger-absent-sender-${suffix}`,
  }).text({ id: `messenger-absent-${suffix}` });
  assert.equal((await simulator.send(absentPayload)).status, 404);
  assert.equal(await prisma.eventoWebhook.count({
    where: { externalEventId: `messenger-absent-${suffix}` },
  }), 0);

  const pausedIdentity = {
    messengerPageId: `test-messenger-paused-${suffix}`,
    psid: `test-messenger-paused-sender-${suffix}`,
  };
  const pausedFixture = await seedSyntheticTenant("paused", pausedIdentity);
  const pausedSimulator = simulator.forIdentity(pausedIdentity);
  pausedSimulator.configureEnvironment(process.env);
  const pausedPayload = pausedSimulator.text({ id: `messenger-paused-${suffix}` });
  const pausedOrchestrator = createMessengerWebhookOrchestrator({
    prisma,
    processEvent: async (input) => {
      await prisma.canalIntegracao.update({
        where: { id: pausedFixture.channel.id },
        data: { ativo: false, status: "INATIVO" },
      });
      return processMessengerWebhookEvent(input);
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
    messengerPageId: `test-messenger-failure-${suffix}`,
    psid: `test-messenger-failure-sender-${suffix}`,
  };
  const fixture = await seedSyntheticTenant("failure", identity);
  const failureSimulator = simulator.forIdentity(identity);
  failureSimulator.configureEnvironment(process.env);
  const payload = failureSimulator.text({ id: `messenger-failure-${suffix}` });
  const receiptAt = new Date("2026-07-30T20:00:00.000Z");
  const failureAt = new Date("2026-07-30T20:00:01.000Z");
  const failing = createMessengerWebhookOrchestrator({
    prisma,
    intake: createMessengerWebhookIntake({ prisma, clock: () => receiptAt }),
    processEvent: async () => {
      const error = new Error("payload=private token=private");
      error.code = "unsafe payload=private";
      throw error;
    },
    clock: () => failureAt,
  });
  await assert.rejects(failing(payload), (error) => error.code === "WEBHOOK_PROCESSING_UNAVAILABLE");

  const event = await prisma.eventoWebhook.findFirstOrThrow({
    where: { empresaId: fixture.tenant.id, externalEventId: `messenger-failure-${suffix}` },
  });
  const failedChannel = await prisma.canalIntegracao.findUniqueOrThrow({ where: { id: fixture.channel.id } });
  assert.equal(event.statusProcessamento, "RECEBIDO");
  assert.equal(failedChannel.lastFailureAt.toISOString(), failureAt.toISOString());
  assert.equal(failedChannel.lastFailureCode, "MESSENGER_EVENT_PROCESSING_UNAVAILABLE");
  assert.equal(JSON.stringify(failedChannel).includes("private"), false);
  assert.deepEqual(await commercialCounts(fixture.tenant.id), {
    contacts: 0,
    clients: 0,
    leads: 0,
    conversations: 0,
    messages: 0,
  });

  assert.deepEqual(await createMessengerWebhookOrchestrator({ prisma })(payload), { accepted: true });
  assert.equal(await prisma.eventoWebhook.count({
    where: { empresaId: fixture.tenant.id, externalEventId: `messenger-failure-${suffix}` },
  }), 1);
  assert.equal((await commercialCounts(fixture.tenant.id)).messages, 1);
});

test("falha concorrente atrasada nao sobrescreve processamento concluido", async () => {
  const identity = {
    messengerPageId: `test-messenger-failure-race-${suffix}`,
    psid: `test-messenger-failure-race-sender-${suffix}`,
  };
  const fixture = await seedSyntheticTenant("failure-race", identity);
  const raceSimulator = simulator.forIdentity(identity);
  raceSimulator.configureEnvironment(process.env);
  const payload = raceSimulator.text({ id: `messenger-failure-race-${suffix}` });
  let releaseFailure;
  let signalFailureStarted;
  const failureStarted = new Promise((resolve) => {
    signalFailureStarted = resolve;
  });
  const waitForSuccess = new Promise((resolve) => {
    releaseFailure = resolve;
  });
  const delayedFailure = createMessengerWebhookOrchestrator({
    prisma,
    processEvent: async () => {
      signalFailureStarted();
      await waitForSuccess;
      const error = new Error("Falha sintetica atrasada.");
      error.code = "MESSENGER_DELAYED_FAILURE";
      throw error;
    },
  });

  const delayedResult = delayedFailure(payload);
  await failureStarted;
  assert.deepEqual(await createMessengerWebhookOrchestrator({ prisma })(payload), { accepted: true });
  releaseFailure();
  await assert.rejects(
    delayedResult,
    (error) => error.status === 503 && error.code === "WEBHOOK_PROCESSING_UNAVAILABLE",
  );

  const event = await prisma.eventoWebhook.findFirstOrThrow({
    where: { empresaId: fixture.tenant.id, externalEventId: `messenger-failure-race-${suffix}` },
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
    data: { nome: `Tenant Messenger ${label} ${suffix}`, slug: `messenger-${label}-${suffix}` },
  });
  const channel = await prisma.canalIntegracao.create({
    data: {
      empresaId: tenant.id,
      tipo: "MESSENGER_META",
      nome: `Messenger sintetico ${label}`,
      chaveInterna: "messenger-meta-inbound-real",
      publicId: `messenger-channel-${label}-${suffix}`,
      status: "ATIVO",
      modoTeste: false,
      ativo: true,
      providerEnvironment: process.env.MESSENGER_PROVIDER_ENVIRONMENT,
      metaAppId: process.env.MESSENGER_META_APP_ID,
      messengerPageId: identity.messengerPageId,
      messengerPageNameMasked: "@test_***",
    },
  });
  for (const chave of ["MESSENGER_INTEGRATION", "MESSENGER_INBOUND"]) {
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

async function automationCounts(empresaId) {
  const [jobs, executions] = await Promise.all([
    prisma.automacaoAcaoJob.count({ where: { empresaId } }),
    prisma.automacaoExecucao.count({ where: { empresaId } }),
  ]);
  return { executions, jobs };
}

function batchPayload(identity, eventCounts, timestampBase) {
  let eventIndex = 0;
  return {
    object: "page",
    entry: eventCounts.map((eventCount, entryIndex) => ({
      id: identity.messengerPageId,
      time: timestampBase + entryIndex,
      messaging: Array.from({ length: eventCount }, () => {
        const timestamp = timestampBase + eventIndex;
        eventIndex += 1;
        return {
          sender: { id: identity.psid },
          recipient: { id: identity.messengerPageId },
          timestamp,
          read: { watermark: timestamp },
        };
      }),
    })),
  };
}

async function batchEvidence(...fixtures) {
  const result = [];
  for (const fixture of fixtures) {
    const channel = await prisma.canalIntegracao.findUniqueOrThrow({
      where: { id: fixture.channel.id },
      select: {
        connectedAt: true,
        lastFailureAt: true,
        lastWebhookAt: true,
        verifiedAt: true,
      },
    });
    result.push({
      channel,
      counts: await evidenceCounts(fixture.tenant.id),
    });
  }
  return result;
}

function listen(app) {
  return new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
}

function sendExactHttpRequest(port, raw, signature, extraHeaders = []) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const chunks = [];
    socket.on("connect", () => {
      const headers = [
        "POST /webhooks/messenger HTTP/1.1",
        `Host: 127.0.0.1:${port}`,
        "Content-Type: application/json",
        `Content-Length: ${raw.length}`,
        `X-Hub-Signature-256: sha256=${signature}`,
        ...extraHeaders,
        "Connection: close",
        "",
        "",
      ];
      socket.write(Buffer.concat([Buffer.from(headers.join("\r\n"), "ascii"), raw]));
    });
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("error", reject);
    socket.on("end", () => {
      const response = Buffer.concat(chunks).toString("utf8");
      const separator = response.indexOf("\r\n\r\n");
      const headerText = separator === -1 ? response : response.slice(0, separator);
      const bodyText = separator === -1 ? "" : response.slice(separator + 4);
      const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(headerText)?.[1]);
      let body = null;
      try {
        body = JSON.parse(bodyText);
      } catch {
        body = null;
      }
      resolve({ body, status });
    });
  });
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
