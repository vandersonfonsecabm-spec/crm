const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const express = require("express");
const { createCustomer360Service } = require("../src/customer-360/service");
const { createLeadsCommunicationServices } = require("../src/leads-communication/services");
const { mountInstagramWebhookRoutes } = require("../src/integrations/instagramWebhook");
const { createInstagramWebhookOrchestrator } = require("../src/integrations/instagramWebhookOrchestrator");
const { mountMessengerWebhookRoutes } = require("../src/integrations/messengerWebhook");
const { createMessengerWebhookOrchestrator } = require("../src/integrations/messengerWebhookOrchestrator");
const { mountWhatsAppWebhookRoutes } = require("../src/integrations/whatsappWebhook");
const { createWhatsAppWebhookOrchestrator } = require("../src/integrations/whatsappWebhookOrchestrator");
const { createInstagramMetaSimulator } = require("./helpers/instagram-meta-simulator");
const { createMessengerMetaSimulator } = require("./helpers/messenger-meta-simulator");
const { createWhatsAppMetaSimulator } = require("./helpers/whatsapp-meta-simulator");

const postgres = process.env.CRM_TEST_DATABASE_PROVIDER === "postgresql";
const suffix = `${Date.now()}-${process.pid}`;
const sharedOpaqueSender = `test-shared-opaque-${suffix}`;
const sharedEventId = `test-shared-event-${suffix}`;
let databasePath;

if (!postgres) {
  const runDir = requiredEnv("CRM_PRISMA_TEST_RUN_DIR");
  databasePath = path.join(runDir, "multichannel-synthetic-pilot", `pilot-${process.pid}.db`);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.copyFileSync(requiredEnv("CRM_TEST_BASE_DATABASE_PATH"), databasePath);
}

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  CRM_TEST_DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  AUTOMATION_WORKER_ENABLED: "false",
  LEADS_COMMUNICATION_ENABLED: "true",
  WHATSAPP_INTEGRATION_ENABLED: "true",
  WHATSAPP_INBOUND_ENABLED: "true",
  WHATSAPP_OUTBOUND_ENABLED: "false",
  WHATSAPP_META_APP_ID: "TEST_MULTICHANNEL_WHATSAPP_APP",
  WHATSAPP_PROVIDER_ENVIRONMENT: "MULTICHANNEL_TEST",
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: ephemeralSecret(),
  INSTAGRAM_INTEGRATION_ENABLED: "true",
  INSTAGRAM_INBOUND_ENABLED: "true",
  INSTAGRAM_META_APP_ID: "TEST_MULTICHANNEL_INSTAGRAM_APP",
  INSTAGRAM_PROVIDER_ENVIRONMENT: "MULTICHANNEL_TEST",
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: ephemeralSecret(),
  MESSENGER_INTEGRATION_ENABLED: "true",
  MESSENGER_INBOUND_ENABLED: "true",
  MESSENGER_META_APP_ID: "TEST_MULTICHANNEL_MESSENGER_APP",
  MESSENGER_PROVIDER_ENVIRONMENT: "MULTICHANNEL_TEST",
  MESSENGER_WEBHOOK_VERIFY_TOKEN: ephemeralSecret(),
});

let prisma;
let server;
let baseUrl;
let simulators;

before(async () => {
  prisma = new PrismaClient({ datasourceUrl: process.env.CRM_TEST_DATABASE_URL });
  const app = express();
  mountWhatsAppWebhookRoutes({
    app,
    processWebhook: createWhatsAppWebhookOrchestrator({ prisma }),
  });
  mountInstagramWebhookRoutes({
    app,
    processWebhook: createInstagramWebhookOrchestrator({ prisma }),
  });
  mountMessengerWebhookRoutes({
    app,
    processWebhook: createMessengerWebhookOrchestrator({ prisma }),
  });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  simulators = createSimulators("a");
  for (const simulator of Object.values(simulators)) simulator.configureEnvironment(process.env);
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = ephemeralSecret();
  process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = ephemeralSecret();
  process.env.MESSENGER_WEBHOOK_VERIFY_TOKEN = ephemeralSecret();
});

after(async () => {
  if (server) {
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (prisma) await prisma.$disconnect();
  if (databasePath) removeDatabase(databasePath);
});

test("piloto sintetico percorre os tres canais sem mistura ou outbound real", async () => {
  const tenantA = await seedTenant("a", identities("a"));
  const tenantB = await seedTenant("b", identities("b"));
  const tenantBSimulators = createSimulators("b", simulators);
  const beforeA = await evidenceCounts(tenantA.tenant.id);
  const beforeB = await evidenceCounts(tenantB.tenant.id);
  assert.deepEqual(beforeA, emptyEvidence());
  assert.deepEqual(beforeB, emptyEvidence());

  const payloadsA = textPayloads(simulators);
  for (const [channel, simulator] of Object.entries(simulators)) {
    assert.equal((await simulator.send(payloadsA[channel], { validSignature: false })).status, 401);
    const responses = await Promise.all([
      simulator.send(payloadsA[channel]),
      simulator.send(payloadsA[channel]),
    ]);
    assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  }
  assert.deepEqual(await evidenceCounts(tenantA.tenant.id), filledEvidence(3));
  assert.deepEqual(await evidenceCounts(tenantB.tenant.id), emptyEvidence());

  const payloadsB = textPayloads(tenantBSimulators);
  for (const [channel, simulator] of Object.entries(tenantBSimulators)) {
    assert.equal((await simulator.send(payloadsB[channel])).status, 200);
  }
  assert.deepEqual(await evidenceCounts(tenantB.tenant.id), filledEvidence(3));
  assert.deepEqual(await evidenceCounts(tenantA.tenant.id), filledEvidence(3));

  await assertCommercialIsolation(tenantA, tenantB);
  await assertInboxAndCustomer360(tenantA);
  await assertInboxAndCustomer360(tenantB);
  await assertSimulatedReplyPolicy(tenantA);
  await assertTerminalEvents(tenantA, simulators);
  await assertMixedIdentitiesRejected(tenantA, tenantB, simulators, tenantBSimulators);
  await assertGatesAndSimulatorGuards(tenantA, simulators);

  const finalA = await evidenceCounts(tenantA.tenant.id);
  const finalB = await evidenceCounts(tenantB.tenant.id);
  assert.equal(finalA.contacts, 5);
  assert.equal(finalA.clients, 5);
  assert.equal(finalA.leads, 3);
  assert.equal(finalA.conversations, 5);
  assert.equal(finalA.messages, 4);
  assert.equal(finalB.contacts, 3);
  assert.equal(finalB.clients, 3);
  assert.equal(finalB.leads, 3);
  assert.equal(finalB.conversations, 3);
  assert.equal(finalB.messages, 3);
});

function createSimulators(label, roots = null) {
  const values = identities(label);
  const configs = {
    whatsapp: {
      endpoint: `${baseUrl}/webhooks/whatsapp`,
      identity: values.whatsapp,
    },
    instagram: {
      endpoint: `${baseUrl}/webhooks/instagram`,
      identity: values.instagram,
    },
    messenger: {
      endpoint: `${baseUrl}/webhooks/messenger`,
      identity: values.messenger,
    },
  };
  return {
    whatsapp: roots
      ? roots.whatsapp.forIdentity(values.whatsapp)
      : createWhatsAppMetaSimulator(configs.whatsapp),
    instagram: roots
      ? roots.instagram.forIdentity(values.instagram)
      : createInstagramMetaSimulator(configs.instagram),
    messenger: roots
      ? roots.messenger.forIdentity(values.messenger)
      : createMessengerMetaSimulator(configs.messenger),
  };
}

function identities(label) {
  return {
    whatsapp: {
      wabaId: `test-pilot-waba-${label}-${suffix}`,
      phoneNumberId: `test-pilot-phone-${label}-${suffix}`,
      senderId: "15550000123",
    },
    instagram: {
      instagramBusinessAccountId: `test-pilot-instagram-${label}-${suffix}`,
      senderId: sharedOpaqueSender,
    },
    messenger: {
      messengerPageId: `test-pilot-page-${label}-${suffix}`,
      psid: sharedOpaqueSender,
    },
  };
}

function textPayloads(channelSimulators) {
  return {
    whatsapp: channelSimulators.whatsapp.text({
      id: sharedEventId,
      body: "Mensagem sintetica WhatsApp",
      timestamp: "1784390400",
    }),
    instagram: channelSimulators.instagram.text({
      id: sharedEventId,
      body: "Direct sintetico Instagram",
      timestamp: 1784390400000,
    }),
    messenger: channelSimulators.messenger.text({
      id: sharedEventId,
      body: "Mensagem sintetica Messenger",
      timestamp: 1784390400000,
    }),
  };
}

async function seedTenant(label, channelIdentities) {
  const tenant = await prisma.empresa.create({
    data: { nome: `Tenant piloto sintetico ${label}`, slug: `pilot-${label}-${suffix}` },
  });
  const actor = await prisma.usuario.create({
    data: {
      empresaId: tenant.id,
      nome: `Operador piloto ${label}`,
      email: `pilot-${label}-${suffix}@example.invalid`,
      senhaHash: "test-only-not-a-real-password",
      papel: "ADMIN",
      ativo: true,
    },
  });
  const channels = {
    whatsapp: await prisma.canalIntegracao.create({
      data: {
        empresaId: tenant.id,
        tipo: "WHATSAPP_META",
        nome: `WhatsApp piloto ${label}`,
        chaveInterna: "whatsapp-meta-inbound-real",
        publicId: `pilot-whatsapp-${label}-${suffix}`,
        status: "ATIVO",
        modoTeste: false,
        ativo: true,
        providerEnvironment: process.env.WHATSAPP_PROVIDER_ENVIRONMENT,
        metaAppId: process.env.WHATSAPP_META_APP_ID,
        wabaId: channelIdentities.whatsapp.wabaId,
        phoneNumberId: channelIdentities.whatsapp.phoneNumberId,
      },
    }),
    instagram: await prisma.canalIntegracao.create({
      data: {
        empresaId: tenant.id,
        tipo: "INSTAGRAM_META",
        nome: `Instagram piloto ${label}`,
        chaveInterna: "instagram-meta-inbound-real",
        publicId: `pilot-instagram-${label}-${suffix}`,
        status: "ATIVO",
        modoTeste: false,
        ativo: true,
        providerEnvironment: process.env.INSTAGRAM_PROVIDER_ENVIRONMENT,
        metaAppId: process.env.INSTAGRAM_META_APP_ID,
        instagramBusinessAccountId: channelIdentities.instagram.instagramBusinessAccountId,
        instagramUsernameMasked: "@pilot_***",
      },
    }),
    messenger: await prisma.canalIntegracao.create({
      data: {
        empresaId: tenant.id,
        tipo: "MESSENGER_META",
        nome: `Messenger piloto ${label}`,
        chaveInterna: "messenger-meta-inbound-real",
        publicId: `pilot-messenger-${label}-${suffix}`,
        status: "ATIVO",
        modoTeste: false,
        ativo: true,
        providerEnvironment: process.env.MESSENGER_PROVIDER_ENVIRONMENT,
        metaAppId: process.env.MESSENGER_META_APP_ID,
        messengerPageId: channelIdentities.messenger.messengerPageId,
        messengerPageNameMasked: "Pagina piloto ***",
      },
    }),
  };
  for (const chave of [
    "WHATSAPP_INTEGRATION",
    "WHATSAPP_INBOUND",
    "INSTAGRAM_INTEGRATION",
    "INSTAGRAM_INBOUND",
    "MESSENGER_INTEGRATION",
    "MESSENGER_INBOUND",
    "LEADS_COMMUNICATION",
  ]) {
    await prisma.empresaFuncionalidade.create({
      data: { empresaId: tenant.id, chave, habilitada: true, habilitadoEm: new Date() },
    });
  }
  return { actor, channels, tenant };
}

async function assertCommercialIsolation(tenantA, tenantB) {
  for (const fixture of [tenantA, tenantB]) {
    const contacts = await prisma.contatoCanal.findMany({
      where: { empresaId: fixture.tenant.id },
      include: { canalIntegracao: { select: { tipo: true } } },
      orderBy: { id: "asc" },
    });
    assert.equal(contacts.length, 3);
    assert.equal(new Set(contacts.map((contact) => contact.id)).size, 3);
    assert.equal(contacts.find((contact) => contact.canalIntegracao.tipo === "WHATSAPP_META").telefoneNormalizado, "+15550000123");
    for (const type of ["INSTAGRAM_META", "MESSENGER_META"]) {
      const contact = contacts.find((item) => item.canalIntegracao.tipo === type);
      assert.equal(contact.externalId, sharedOpaqueSender);
      assert.equal(contact.telefoneNormalizado, null);
    }
    const leads = await prisma.lead.findMany({ where: { empresaId: fixture.tenant.id } });
    assert.deepEqual(new Set(leads.map((lead) => lead.origem)), new Set(["WHATSAPP", "INSTAGRAM", "MESSENGER"]));
  }

  const crossTenantContacts = await prisma.contatoCanal.findMany({
    where: { externalId: sharedOpaqueSender },
    select: { empresaId: true, canalIntegracaoId: true },
  });
  assert.equal(crossTenantContacts.length, 4);
  assert.equal(new Set(crossTenantContacts.map((contact) => contact.empresaId)).size, 2);
  assert.equal(new Set(crossTenantContacts.map((contact) => contact.canalIntegracaoId)).size, 4);
}

async function assertInboxAndCustomer360(fixture) {
  const context = { empresaId: fixture.tenant.id, usuarioId: fixture.actor.id, papel: "ADMIN" };
  const communication = createLeadsCommunicationServices({ prisma });
  const inbox = await communication.listConversations(context, { limit: 50 });
  assert.equal(inbox.data.length, 3);
  assert.deepEqual(
    new Set(inbox.data.map((conversation) => conversation.tipoCanal)),
    new Set(["WHATSAPP_META", "INSTAGRAM_META", "MESSENGER_META"]),
  );
  assert.equal(inbox.data.every((conversation) => conversation.podeResponderDiretamente === false), true);

  const customer360 = createCustomer360Service({ prisma });
  const contacts = await prisma.contatoCanal.findMany({
    where: { empresaId: fixture.tenant.id },
    include: { canalIntegracao: { select: { tipo: true } } },
  });
  for (const contact of contacts) {
    const overview = await customer360.getOverview(context, contact.clienteId);
    const timeline = await customer360.getTimeline(context, contact.clienteId, { tipo: "MENSAGEM" });
    assert.equal(overview.resumo.conversas, 1);
    assert.equal(overview.resumo.mensagens, 1);
    assert.equal(timeline.data.length, 1);
    assert.equal(timeline.data[0].canal.tipo, contact.canalIntegracao.tipo);
    assert.equal(timeline.data[0].titulo, "Mensagem recebida");
    assert.equal(timeline.data[0].navegacao.destino, "INBOX");
  }
}

async function assertSimulatedReplyPolicy(fixture) {
  const context = { empresaId: fixture.tenant.id, usuarioId: fixture.actor.id, papel: "ADMIN" };
  const communication = createLeadsCommunicationServices({ prisma });
  const client = await prisma.cliente.create({
    data: { empresaId: fixture.tenant.id, nome: "Cliente simulacao test-only" },
  });
  const testChannel = await prisma.canalIntegracao.create({
    data: {
      empresaId: fixture.tenant.id,
      tipo: "WHATSAPP_META",
      nome: "WhatsApp test-only",
      chaveInterna: `whatsapp-test-only-${suffix}`,
      status: "MODO_TESTE",
      modoTeste: true,
      ativo: true,
    },
  });
  const testConversation = await createManualConversation(fixture, testChannel, client, "whatsapp-test");
  const simulated = await communication.createSimulatedMessage(context, testConversation.id, {
    externalId: `test-simulated-reply-${suffix}`,
    direcao: "SAIDA",
    texto: "Resposta sintetica nao enviada",
  });
  assert.equal(simulated.simulada, true);
  const customer360 = createCustomer360Service({ prisma });
  const timeline = await customer360.getTimeline(context, client.id, { tipo: "MENSAGEM" });
  assert.equal(timeline.data[0].titulo, "Resposta simulada");

  const realConversations = await prisma.conversaCanal.findMany({
    where: {
      empresaId: fixture.tenant.id,
      canalIntegracaoId: { in: Object.values(fixture.channels).map((channel) => channel.id) },
    },
  });
  for (const conversation of realConversations) {
    await assert.rejects(
      communication.createSimulatedMessage(context, conversation.id, {
        externalId: `test-rejected-${conversation.id}-${suffix}`,
        direcao: "SAIDA",
        texto: "Resposta que deve permanecer bloqueada",
      }),
      (error) => error.status === 409 && error.codigo === "CHANNEL_SIMULATION_UNAVAILABLE",
    );
  }

  const siteChannel = await prisma.canalIntegracao.create({
    data: {
      empresaId: fixture.tenant.id,
      tipo: "SITE_FORM",
      nome: "Site piloto",
      chaveInterna: `site-pilot-${suffix}`,
      status: "ATIVO",
      modoTeste: false,
      ativo: true,
    },
  });
  const siteClient = await prisma.cliente.create({
    data: { empresaId: fixture.tenant.id, nome: "Cliente Site piloto" },
  });
  const siteConversation = await createManualConversation(fixture, siteChannel, siteClient, "site");
  await assert.rejects(
    communication.createSimulatedMessage(context, siteConversation.id, {
      externalId: `test-site-rejected-${suffix}`,
      direcao: "SAIDA",
      texto: "Resposta Site bloqueada",
    }),
    (error) => error.status === 409 && error.codigo === "CHANNEL_SIMULATION_UNAVAILABLE",
  );
}

async function createManualConversation(fixture, channel, client, label) {
  const contact = await prisma.contatoCanal.create({
    data: {
      empresaId: fixture.tenant.id,
      canalIntegracaoId: channel.id,
      clienteId: client.id,
      externalId: `test-manual-contact-${label}-${suffix}`,
      nome: `Contato ${label}`,
    },
  });
  return prisma.conversaCanal.create({
    data: {
      empresaId: fixture.tenant.id,
      canalIntegracaoId: channel.id,
      contatoCanalId: contact.id,
      responsavelId: fixture.actor.id,
      status: "EM_ATENDIMENTO",
      chaveAberta: `test-manual-conversation-${label}-${suffix}`,
    },
  });
}

async function assertTerminalEvents(fixture, channelSimulators) {
  const messagesBefore = await prisma.mensagemCanal.count({ where: { empresaId: fixture.tenant.id } });
  const responses = [
    await channelSimulators.whatsapp.send(channelSimulators.whatsapp.status({ messageId: `test-status-${suffix}` })),
    await channelSimulators.whatsapp.send(channelSimulators.whatsapp.media({ id: `test-wa-media-${suffix}` })),
    await channelSimulators.whatsapp.send(channelSimulators.whatsapp.unknown({ id: `test-wa-unknown-${suffix}` })),
    await channelSimulators.instagram.send(channelSimulators.instagram.status()),
    await channelSimulators.instagram.send(channelSimulators.instagram.media({ id: `test-ig-media-${suffix}` })),
    await channelSimulators.instagram.send(channelSimulators.instagram.unknown({ id: `test-ig-unknown-${suffix}` })),
    await channelSimulators.instagram.send(channelSimulators.instagram.echo({ id: `test-ig-echo-${suffix}` })),
    await channelSimulators.messenger.send(channelSimulators.messenger.status()),
    await channelSimulators.messenger.send(channelSimulators.messenger.media({ id: `test-ms-media-${suffix}` })),
    await channelSimulators.messenger.send(channelSimulators.messenger.unknown({ id: `test-ms-unknown-${suffix}` })),
    await channelSimulators.messenger.send(channelSimulators.messenger.echo({ id: `test-ms-echo-${suffix}`, withAttachment: true })),
  ];
  assert.equal(responses.every((response) => response.status === 200), true);
  assert.equal(await prisma.mensagemCanal.count({ where: { empresaId: fixture.tenant.id } }), messagesBefore);
  const events = await prisma.eventoWebhook.findMany({
    where: { empresaId: fixture.tenant.id, externalEventId: { not: sharedEventId } },
    select: { statusProcessamento: true, tipoEvento: true },
  });
  assert.equal(events.length, 11);
  assert.equal(events.every((event) => event.statusProcessamento === "PROCESSADO"), true);
  assert.equal(events.some((event) => /MEDIA_UNSUPPORTED|ATTACHMENT_UNSUPPORTED/.test(event.tipoEvento)), true);
  assert.equal(events.some((event) => /IGNORED/.test(event.tipoEvento)), true);
}

async function assertMixedIdentitiesRejected(fixtureA, fixtureB, rootsA, rootsB) {
  const beforeA = await evidenceCounts(fixtureA.tenant.id);
  const beforeB = await evidenceCounts(fixtureB.tenant.id);
  const instagramMixed = {
    object: "instagram",
    entry: [
      rootsA.instagram.text({ id: `test-ig-mixed-a-${suffix}` }).entry[0],
      rootsB.instagram.text({ id: `test-ig-mixed-b-${suffix}` }).entry[0],
    ],
  };
  const messengerMixed = {
    object: "page",
    entry: [
      rootsA.messenger.text({ id: `test-ms-mixed-a-${suffix}` }).entry[0],
      rootsB.messenger.text({ id: `test-ms-mixed-b-${suffix}` }).entry[0],
    ],
  };
  assert.equal((await rootsA.instagram.send(instagramMixed)).status, 400);
  assert.equal((await rootsA.messenger.send(messengerMixed)).status, 400);
  assert.deepEqual(await evidenceCounts(fixtureA.tenant.id), beforeA);
  assert.deepEqual(await evidenceCounts(fixtureB.tenant.id), beforeB);
}

async function assertGatesAndSimulatorGuards(fixture, channelSimulators) {
  const before = await evidenceCounts(fixture.tenant.id);
  const gateCases = [
    ["WHATSAPP_INTEGRATION_ENABLED", channelSimulators.whatsapp, channelSimulators.whatsapp.text({ id: `test-wa-gate-${suffix}` })],
    ["INSTAGRAM_INTEGRATION_ENABLED", channelSimulators.instagram, channelSimulators.instagram.text({ id: `test-ig-gate-${suffix}` })],
    ["MESSENGER_INTEGRATION_ENABLED", channelSimulators.messenger, channelSimulators.messenger.text({ id: `test-ms-gate-${suffix}` })],
  ];
  for (const [gate, simulator, payload] of gateCases) {
    const previous = process.env[gate];
    process.env[gate] = "false";
    assert.equal((await simulator.send(payload)).status, 404);
    process.env[gate] = previous;
  }
  assert.deepEqual(await evidenceCounts(fixture.tenant.id), before);

  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(() => createWhatsAppMetaSimulator({
      endpoint: `${baseUrl}/webhooks/whatsapp`,
      identity: channelSimulators.whatsapp.identity,
    }), /indisponivel/);
    assert.throws(() => createInstagramMetaSimulator({
      endpoint: `${baseUrl}/webhooks/instagram`,
      identity: channelSimulators.instagram.identity,
    }), /somente em test\/dev explicito/);
    assert.throws(() => createMessengerMetaSimulator({
      endpoint: `${baseUrl}/webhooks/messenger`,
      identity: channelSimulators.messenger.identity,
    }), /somente em test\/dev explicito/);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
  assert.equal((await fetch(`${baseUrl}/simulators/meta`)).status, 404);
}

async function evidenceCounts(empresaId) {
  const [events, contacts, clients, leads, conversations, messages] = await Promise.all([
    prisma.eventoWebhook.count({ where: { empresaId } }),
    prisma.contatoCanal.count({ where: { empresaId } }),
    prisma.cliente.count({ where: { empresaId } }),
    prisma.lead.count({ where: { empresaId } }),
    prisma.conversaCanal.count({ where: { empresaId } }),
    prisma.mensagemCanal.count({ where: { empresaId } }),
  ]);
  return { events, contacts, clients, leads, conversations, messages };
}

function emptyEvidence() {
  return { events: 0, contacts: 0, clients: 0, leads: 0, conversations: 0, messages: 0 };
}

function filledEvidence(count) {
  return {
    events: count,
    contacts: count,
    clients: count,
    leads: count,
    conversations: count,
    messages: count,
  };
}

function ephemeralSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function databaseUrl(file) {
  return `file:${path.resolve(file).replace(/\\/g, "/")}`;
}

function removeDatabase(file) {
  for (const suffixValue of ["", "-wal", "-shm", "-journal"]) {
    const candidate = `${file}${suffixValue}`;
    if (fs.existsSync(candidate)) fs.rmSync(candidate, { force: true });
  }
  const directory = path.dirname(file);
  if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) {
    fs.rmdirSync(directory);
  }
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} e obrigatoria para teste isolado.`);
  return value;
}
