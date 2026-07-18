const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, beforeEach, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const express = require("express");
const { mountWhatsAppWebhookRoutes } = require("../src/integrations/whatsappWebhook");
const { createWhatsAppWebhookIntake } = require("../src/integrations/whatsappWebhookIntake");
const { createWhatsAppWebhookOrchestrator } = require("../src/integrations/whatsappWebhookOrchestrator");
const { processWhatsAppWebhookEvent } = require("../src/integrations/whatsappWebhookProcessor");

const runDir = requiredEnv("CRM_PRISMA_TEST_RUN_DIR");
const auditDir = path.join(runDir, "whatsapp-f1b3");
const databasePath = path.join(auditDir, `whatsapp-f1b3-${process.pid}.db`);
const sourceDatabase = requiredEnv("CRM_TEST_BASE_DATABASE_PATH");
const appSecret = crypto.randomBytes(32).toString("hex");
const wabaId = "waba-f1b3";
const phoneNumberId = "phone-f1b3";
const senderId = "5511999999999";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: databaseUrl(databasePath),
  CRM_TEST_DATABASE_URL: databaseUrl(databasePath),
  WHATSAPP_INTEGRATION_ENABLED: "true",
  WHATSAPP_INBOUND_ENABLED: "true",
  WHATSAPP_APP_SECRET: appSecret,
});

let prisma;
let server;
let baseUrl;
let empresaA;
let empresaB;
let integrationA;
let legacySiteEvent;
let processorCallCount;
let failProcessorCall;
let failProcessorCode;
let observedDurableEvents;

before(async () => {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.copyFileSync(sourceDatabase, databasePath);
  prisma = new PrismaClient({ datasourceUrl: databaseUrl(databasePath) });

  empresaA = await prisma.empresa.create({ data: { nome: "Empresa F1B3 A", slug: "empresa-f1b3-a" } });
  empresaB = await prisma.empresa.create({ data: { nome: "Empresa F1B3 B", slug: "empresa-f1b3-b" } });
  integrationA = await createWhatsAppIntegration(empresaA.id);
  const siteIntegration = await prisma.canalIntegracao.create({
    data: {
      empresaId: empresaA.id,
      tipo: "SITE_FORM",
      nome: "Site legado F1B3",
      chaveInterna: "site-legado-f1b3",
      status: "ATIVO",
      modoTeste: true,
      ativo: true,
    },
  });
  legacySiteEvent = await prisma.eventoWebhook.create({
    data: {
      empresaId: empresaA.id,
      canalIntegracaoId: siteIntegration.id,
      provedor: "SITE_FORM",
      externalEventId: "site-legado-f1b3",
      tipoEvento: "SITE_LEAD_SUBMITTED",
      payloadHash: "a".repeat(64),
      payloadJson: null,
      statusProcessamento: "PROCESSADO",
      tentativas: 1,
      processadoEm: new Date("2026-07-18T12:00:00.000Z"),
    },
  });
  legacySiteEvent = await prisma.eventoWebhook.findUniqueOrThrow({ where: { id: legacySiteEvent.id } });

  const app = express();
  const orchestrator = createWhatsAppWebhookOrchestrator({
    prisma,
    processEvent: controlledProcessor,
  });
  mountWhatsAppWebhookRoutes({ app, processWebhook: orchestrator });
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  process.env.WHATSAPP_INTEGRATION_ENABLED = "true";
  process.env.WHATSAPP_INBOUND_ENABLED = "true";
  process.env.WHATSAPP_APP_SECRET = appSecret;
  processorCallCount = 0;
  failProcessorCall = null;
  failProcessorCode = "WHATSAPP_EVENT_PROCESSING_UNAVAILABLE";
  observedDurableEvents = [];

  const empresaIds = [empresaA.id, empresaB.id];
  await prisma.mensagemCanal.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.conversaCanal.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.negocio.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.lead.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.contatoCanal.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.nota.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.acompanhamento.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.cliente.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.eventoWebhook.deleteMany({ where: { provedor: "WHATSAPP" } });
  await prisma.empresaFuncionalidade.deleteMany({
    where: {
      empresaId: { in: empresaIds },
      chave: { in: ["WHATSAPP_INTEGRATION", "WHATSAPP_INBOUND"] },
    },
  });
  await enableCapabilities(empresaA.id);
  await prisma.canalIntegracao.update({
    where: { id: integrationA.id },
    data: { ativo: true, status: "ATIVO", wabaId, phoneNumberId },
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (prisma) await prisma.$disconnect();
  removeDatabase(databasePath);
});

test("intake devolve IDs apenas internamente e confirma a transacao antes do processador", async () => {
  const intake = createWhatsAppWebhookIntake({ prisma });
  const payload = validPayload({ messages: [message("wamid.f1b3.contract")] });
  const first = await intake(payload);
  assert.equal(first.accepted, true);
  assert.equal(first.events.length, 1);
  assert.equal(first.events[0].created, true);
  assert.ok(Number.isInteger(first.events[0].eventoWebhookId));
  assert.equal((await chainCounts()).messages, 0);

  const retry = await intake(payload);
  assert.deepEqual(retry.events, [{
    eventoWebhookId: first.events[0].eventoWebhookId,
    created: false,
  }]);

  const response = await rawRequest(bodyFor("wamid.f1b3.contract"));
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { accepted: true });
  assert.equal(response.text.includes(String(first.events[0].eventoWebhookId)), false);
  assert.deepEqual(observedDurableEvents, [{
    id: first.events[0].eventoWebhookId,
    status: "RECEBIDO",
  }]);
});

test("uma mensagem conclui intake, cadeia comercial e HTTP 200", async () => {
  const response = await rawRequest(bodyFor("wamid.f1b3.success", "  texto preservado  "));
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { accepted: true });
  assert.deepEqual(await chainCounts(), {
    clients: 1,
    contacts: 1,
    leads: 1,
    conversations: 1,
    messages: 1,
  });
  const event = await prisma.eventoWebhook.findFirstOrThrow({
    where: { externalEventId: "wamid.f1b3.success" },
  });
  const storedMessage = await prisma.mensagemCanal.findFirstOrThrow({
    where: { externalId: "wamid.f1b3.success" },
  });
  assert.equal(event.statusProcessamento, "PROCESSADO");
  assert.ok(event.processadoEm instanceof Date);
  assert.equal(storedMessage.texto, "  texto preservado  ");
});

test("duas mensagens reutilizam contato, Cliente, Lead e conversa", async () => {
  const response = await rawRequest(bodyForMessages([
    message("wamid.f1b3.batch.1", "Primeira"),
    message("wamid.f1b3.batch.2", "Segunda"),
  ]));
  assert.equal(response.status, 200);
  assert.deepEqual(await chainCounts(), {
    clients: 1,
    contacts: 1,
    leads: 1,
    conversations: 1,
    messages: 2,
  });
  assert.equal(await prisma.eventoWebhook.count({
    where: { provedor: "WHATSAPP", statusProcessamento: "PROCESSADO" },
  }), 2);
});

test("retry depois do sucesso permanece integralmente idempotente", async () => {
  const body = bodyFor("wamid.f1b3.retry");
  assert.equal((await rawRequest(body)).status, 200);
  const before = await fullCounts();
  assert.equal((await rawRequest(body)).status, 200);
  assert.deepEqual(await fullCounts(), before);
  assert.equal(await prisma.eventoWebhook.count({ where: { externalEventId: "wamid.f1b3.retry" } }), 1);
});

test("falha apos o intake retorna 503, preserva o evento e permite retomada", async () => {
  failProcessorCall = 1;
  const body = bodyFor("wamid.f1b3.resume");
  const failed = await rawRequest(body);
  assert.equal(failed.status, 503);
  assert.deepEqual(failed.body, {
    erro: "Requisicao nao aceita.",
    codigo: "WEBHOOK_PROCESSING_UNAVAILABLE",
  });
  const pending = await prisma.eventoWebhook.findFirstOrThrow({
    where: { externalEventId: "wamid.f1b3.resume" },
  });
  assert.equal(pending.statusProcessamento, "RECEBIDO");
  assert.equal(pending.processadoEm, null);
  assert.ok(pending.payloadJson);
  assert.ok(pending.payloadHash);
  assert.deepEqual(await chainCounts(), {
    clients: 0,
    contacts: 0,
    leads: 0,
    conversations: 0,
    messages: 0,
  });

  failProcessorCall = null;
  processorCallCount = 0;
  assert.equal((await rawRequest(body)).status, 200);
  assert.equal(await prisma.eventoWebhook.count({ where: { externalEventId: "wamid.f1b3.resume" } }), 1);
  assert.deepEqual(await chainCounts(), {
    clients: 1,
    contacts: 1,
    leads: 1,
    conversations: 1,
    messages: 1,
  });
});

test("falha no segundo evento preserva o lote e retry conclui somente o pendente", async () => {
  failProcessorCall = 2;
  const body = bodyForMessages([
    message("wamid.f1b3.partial.1", "Primeira"),
    message("wamid.f1b3.partial.2", "Segunda"),
  ]);
  assert.equal((await rawRequest(body)).status, 503);
  const events = await prisma.eventoWebhook.findMany({
    where: { externalEventId: { in: ["wamid.f1b3.partial.1", "wamid.f1b3.partial.2"] } },
    orderBy: { id: "asc" },
  });
  assert.deepEqual(events.map((event) => event.statusProcessamento), ["PROCESSADO", "RECEBIDO"]);
  assert.equal((await chainCounts()).messages, 1);

  failProcessorCall = null;
  processorCallCount = 0;
  assert.equal((await rawRequest(body)).status, 200);
  assert.equal(await prisma.eventoWebhook.count({
    where: {
      externalEventId: { in: ["wamid.f1b3.partial.1", "wamid.f1b3.partial.2"] },
      statusProcessamento: "PROCESSADO",
    },
  }), 2);
  assert.deepEqual(await chainCounts(), {
    clients: 1,
    contacts: 1,
    leads: 1,
    conversations: 1,
    messages: 2,
  });
});

test("conflito material do processador retorna 409 sem apagar o intake", async () => {
  failProcessorCall = 1;
  failProcessorCode = "WHATSAPP_MESSAGE_IDEMPOTENCY_CONFLICT";
  const response = await rawRequest(bodyFor("wamid.f1b3.conflict"));
  assert.equal(response.status, 409);
  assert.deepEqual(response.body, {
    erro: "Requisicao nao aceita.",
    codigo: "WEBHOOK_PROCESSING_CONFLICT",
  });
  assert.equal(await prisma.eventoWebhook.count({ where: { externalEventId: "wamid.f1b3.conflict" } }), 1);
  assert.equal((await chainCounts()).messages, 0);
});

test("duas requisicoes equivalentes concorrentes criam uma unica cadeia", async () => {
  const body = bodyFor("wamid.f1b3.concurrent");
  const responses = await Promise.all([rawRequest(body), rawRequest(body)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 200]);
  assert.equal(await prisma.eventoWebhook.count({ where: { externalEventId: "wamid.f1b3.concurrent" } }), 1);
  assert.deepEqual(await chainCounts(), {
    clients: 1,
    contacts: 1,
    leads: 1,
    conversations: 1,
    messages: 1,
  });
});

test("gates, assinatura, tipo e conflito preservam respostas sanitizadas", async () => {
  const body = bodyFor("wamid.f1b3.security");
  process.env.WHATSAPP_INTEGRATION_ENABLED = "false";
  assert.equal((await rawRequest(body)).status, 404);
  process.env.WHATSAPP_INTEGRATION_ENABLED = "true";
  assert.equal((await rawRequest(body, { signature: "sha256=" + "0".repeat(64) })).status, 401);

  await prisma.empresaFuncionalidade.delete({
    where: { empresaId_chave: { empresaId: empresaA.id, chave: "WHATSAPP_INBOUND" } },
  });
  assert.equal((await rawRequest(body)).status, 404);
  await enableCapabilities(empresaA.id);

  const media = bodyForMessages([{
    ...message("wamid.f1b3.media"),
    type: "image",
    image: { id: "media-ficticia" },
  }]);
  assert.equal((await rawRequest(media)).status, 422);

  assert.equal((await rawRequest(bodyFor("wamid.f1b3.idempotency", "Original"))).status, 200);
  assert.equal((await rawRequest(bodyFor("wamid.f1b3.idempotency", "Divergente"))).status, 409);
  assert.equal(await prisma.eventoWebhook.count({ where: { externalEventId: "wamid.f1b3.idempotency" } }), 1);
});

test("Site, entidades fora do fluxo, privacidade e ausencia de rede permanecem preservados", async () => {
  const captured = [];
  const originalConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const method of Object.keys(originalConsole)) console[method] = (...args) => captured.push(args.join(" "));
  try {
    failProcessorCall = 1;
    await rawRequest(bodyFor("wamid.f1b3.private", "conteudo-privado"));
  } finally {
    Object.assign(console, originalConsole);
  }

  const output = captured.join("\n");
  for (const forbidden of [
    appSecret,
    "wamid.f1b3.private",
    "conteudo-privado",
    wabaId,
    phoneNumberId,
    senderId,
  ]) {
    assert.equal(output.includes(forbidden), false);
  }
  assert.deepEqual(await prisma.eventoWebhook.findUniqueOrThrow({ where: { id: legacySiteEvent.id } }), legacySiteEvent);
  assert.equal(legacySiteEvent.payloadJson, null);
  assert.deepEqual(await unrelatedCounts(), {
    businesses: 0,
    notes: 0,
    followUps: 0,
    audits: 0,
  });

  const sourceFiles = [
    "whatsappWebhook.js",
    "whatsappWebhookIntake.js",
    "whatsappWebhookOrchestrator.js",
    "whatsappWebhookProcessor.js",
  ];
  const source = sourceFiles.map((file) => fs.readFileSync(
    path.join(__dirname, "..", "src", "integrations", file),
    "utf8",
  )).join("\n");
  assert.doesNotMatch(source, /\b(?:fetch|axios|Graph API|OAuth)\b/i);
  assert.doesNotMatch(source, /require\(["'](?:node:)?(?:http|https|net|dns)["']\)/i);
  assert.doesNotMatch(source, /\b(?:worker|cron|queue|fila)\b/i);

  const serverSource = fs.readFileSync(path.join(__dirname, "..", "src", "server.js"), "utf8");
  const mountPosition = serverSource.indexOf("createWhatsAppWebhookOrchestrator({ prisma })");
  const jsonPosition = serverSource.indexOf("app.use(express.json())");
  assert.ok(mountPosition > 0 && mountPosition < jsonPosition);
  assert.equal(serverSource.match(/createWhatsAppWebhookOrchestrator\(\{ prisma \}\)/g)?.length, 1);
});

async function controlledProcessor(args) {
  processorCallCount += 1;
  const stored = await prisma.eventoWebhook.findUniqueOrThrow({
    where: { id: args.eventoWebhookId },
    select: { id: true, statusProcessamento: true },
  });
  observedDurableEvents.push({ id: stored.id, status: stored.statusProcessamento });
  if (processorCallCount === failProcessorCall) {
    const error = new Error("Falha controlada do processador.");
    error.name = "WhatsAppWebhookProcessingError";
    error.code = failProcessorCode;
    throw error;
  }
  return processWhatsAppWebhookEvent(args);
}

async function createWhatsAppIntegration(empresaId) {
  return prisma.canalIntegracao.create({
    data: {
      empresaId,
      tipo: "WHATSAPP_META",
      nome: "WhatsApp F1B3",
      chaveInterna: "whatsapp-f1b3",
      status: "ATIVO",
      modoTeste: true,
      ativo: true,
      providerEnvironment: "sandbox-f1b3",
      metaAppId: "app-f1b3",
      wabaId,
      phoneNumberId,
    },
  });
}

async function enableCapabilities(empresaId) {
  for (const chave of ["WHATSAPP_INTEGRATION", "WHATSAPP_INBOUND"]) {
    await prisma.empresaFuncionalidade.upsert({
      where: { empresaId_chave: { empresaId, chave } },
      create: { empresaId, chave, habilitada: true },
      update: { habilitada: true },
    });
  }
}

function validPayload({ messages, contacts, entryId = wabaId, phoneId = phoneNumberId }) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: entryId,
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: phoneId },
          messages,
          ...(contacts ? { contacts } : {}),
        },
      }],
    }],
  };
}

function message(id, body = "Mensagem F1B3") {
  return {
    id,
    from: senderId,
    timestamp: "1784390400",
    type: "text",
    text: { body },
  };
}

function bodyFor(id, text) {
  return bodyForMessages([message(id, text)]);
}

function bodyForMessages(messages) {
  return Buffer.from(JSON.stringify(validPayload({ messages })), "utf8");
}

async function rawRequest(rawBody, options = {}) {
  const response = await fetch(`${baseUrl}/webhooks/whatsapp`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-hub-signature-256": options.signature || sign(rawBody),
    },
    body: rawBody,
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    body: text && response.headers.get("content-type")?.includes("application/json")
      ? JSON.parse(text)
      : text,
  };
}

function sign(rawBody) {
  return `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
}

async function chainCounts() {
  const [clients, contacts, leads, conversations, messages] = await Promise.all([
    prisma.cliente.count({ where: { empresaId: empresaA.id } }),
    prisma.contatoCanal.count({ where: { empresaId: empresaA.id } }),
    prisma.lead.count({ where: { empresaId: empresaA.id } }),
    prisma.conversaCanal.count({ where: { empresaId: empresaA.id } }),
    prisma.mensagemCanal.count({ where: { empresaId: empresaA.id } }),
  ]);
  return { clients, contacts, leads, conversations, messages };
}

async function fullCounts() {
  return {
    events: await prisma.eventoWebhook.count({ where: { provedor: "WHATSAPP" } }),
    ...(await chainCounts()),
  };
}

async function unrelatedCounts() {
  const [businesses, notes, followUps, audits] = await Promise.all([
    prisma.negocio.count({ where: { empresaId: empresaA.id } }),
    prisma.nota.count({ where: { empresaId: empresaA.id } }),
    prisma.acompanhamento.count({ where: { empresaId: empresaA.id } }),
    prisma.auditoriaFuncionalidade.count({ where: { empresaId: empresaA.id } }),
  ]);
  return { businesses, notes, followUps, audits };
}

function databaseUrl(file) {
  return `file:${path.resolve(file).replace(/\\/g, "/")}`;
}

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const candidate = `${file}${suffix}`;
    if (fs.existsSync(candidate)) fs.rmSync(candidate, { force: true });
  }
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} e obrigatoria para testes isolados.`);
  return value;
}
