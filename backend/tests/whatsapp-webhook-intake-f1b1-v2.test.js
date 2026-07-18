const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, beforeEach, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const {
  canonicalStringify,
  parseAtomicMessages,
} = require("../src/integrations/whatsappWebhookIntake");

const runDir = requiredEnv("CRM_PRISMA_TEST_RUN_DIR");
const auditDir = path.join(runDir, "whatsapp-f1b1-v2");
const databasePath = path.join(auditDir, `whatsapp-f1b1-v2-${process.pid}.db`);
const sourceDatabase = requiredEnv("CRM_TEST_BASE_DATABASE_PATH");
const appSecret = crypto.randomBytes(32).toString("hex");
const wabaId = "waba-f1b1-v2";
const phoneNumberId = "phone-f1b1-v2";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: databaseUrl(databasePath),
  CRM_TEST_DATABASE_URL: databaseUrl(databasePath),
  WHATSAPP_INTEGRATION_ENABLED: "true",
  WHATSAPP_INBOUND_ENABLED: "true",
  WHATSAPP_APP_SECRET: appSecret,
  JWT_SECRET: crypto.randomBytes(48).toString("hex"),
  INTEGRATION_ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex"),
});

let api;
let prisma;
let server;
let baseUrl;
let empresaA;
let empresaB;
let integrationA;
let integrationB;
let legacyEvent;
let domainCounts;

before(async () => {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.copyFileSync(sourceDatabase, databasePath);
  api = require("../src/server");
  prisma = api.prisma;

  empresaA = await prisma.empresa.create({ data: { nome: "Empresa WhatsApp A", slug: "empresa-whatsapp-a-f1b1-v2" } });
  empresaB = await prisma.empresa.create({ data: { nome: "Empresa WhatsApp B", slug: "empresa-whatsapp-b-f1b1-v2" } });
  integrationA = await createIntegration(empresaA.id, "a", wabaId, phoneNumberId);
  integrationB = await createIntegration(empresaB.id, "b", "waba-b-f1b1-v2", "phone-b-f1b1-v2");
  await enableCapabilities(empresaA.id);

  legacyEvent = await prisma.eventoWebhook.create({
    data: {
      empresaId: empresaA.id,
      canalIntegracaoId: integrationA.id,
      provedor: "SITE_FORM",
      externalEventId: "site-legacy-f1b1-v2",
      tipoEvento: "SITE_LEAD_SUBMITTED",
      payloadHash: "a".repeat(64),
      statusProcessamento: "PROCESSADO",
      tentativas: 1,
      processadoEm: new Date("2026-07-18T12:00:00.000Z"),
    },
  });
  legacyEvent = await prisma.eventoWebhook.findUniqueOrThrow({ where: { id: legacyEvent.id } });
  domainCounts = await readDomainCounts();

  await new Promise((resolve) => {
    server = api.app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  process.env.WHATSAPP_INTEGRATION_ENABLED = "true";
  process.env.WHATSAPP_INBOUND_ENABLED = "true";
  process.env.WHATSAPP_APP_SECRET = appSecret;
  await prisma.eventoWebhook.deleteMany({ where: { provedor: "WHATSAPP" } });
  await prisma.canalIntegracao.deleteMany({
    where: { tipo: "WHATSAPP_META", id: { notIn: [integrationA.id, integrationB.id] } },
  });
  await prisma.canalIntegracao.update({
    where: { id: integrationA.id },
    data: { ativo: true, status: "ATIVO", wabaId, phoneNumberId },
  });
  await prisma.empresaFuncionalidade.deleteMany({
    where: { empresaId: empresaA.id, chave: { in: ["WHATSAPP_INTEGRATION", "WHATSAPP_INBOUND"] } },
  });
  await enableCapabilities(empresaA.id);
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
  removeDatabase(databasePath);
});

test("schema publicado suporta payload e idempotencia sem nova migration", () => {
  const schema = fs.readFileSync(path.join(__dirname, "..", "prisma", "schema.prisma"), "utf8");
  assert.match(schema, /model EventoWebhook \{[\s\S]*?payloadHash\s+String\?[\s\S]*?payloadJson\s+String\?/);
  assert.match(schema, /@@unique\(\[empresaId, canalIntegracaoId, provedor, externalEventId\]\)/);
  assert.match(schema, /statusProcessamento\s+StatusProcessamentoWebhook\s+@default\(RECEBIDO\)/);
});

test("parser decompoe mensagens, entries e associa somente o contato correto", () => {
  const payload = validPayload({
    messages: [message("wamid.parser.1"), message("wamid.parser.2", "Texto dois")],
    contacts: [
      { wa_id: "5511999999999", profile: { name: "Contato correto" } },
      { wa_id: "5500000000000", profile: { name: "Contato alheio" } },
    ],
  });
  payload.entry.push(validPayload({
    messages: [message("wamid.parser.3", "Terceira")],
  }).entry[0]);

  const items = parseAtomicMessages(payload);
  assert.equal(items.length, 3);
  const atomic = JSON.parse(items[0].payloadJson);
  assert.equal(atomic.schemaVersion, 1);
  assert.equal(atomic.provider, "WHATSAPP");
  assert.equal(atomic.contact.profile.name, "Contato correto");
  assert.equal(atomic.payload, undefined);
  assert.equal(items[0].payloadJson.includes("wamid.parser.2"), false);
  assert.equal(items[2].wabaId, wabaId);
});

test("parser rejeita status, midia, estruturas invalidas e identidades conflitantes", () => {
  const statusOnly = validPayload();
  delete statusOnly.entry[0].changes[0].value.messages;
  statusOnly.entry[0].changes[0].value.statuses = [{ id: "status" }];
  assertIntakeError(() => parseAtomicMessages(statusOnly), 422);

  assertIntakeError(() => parseAtomicMessages(validPayload({ messages: [{ ...message("wamid.media"), type: "image", image: { id: "x" } }] })), 422);
  assertIntakeError(() => parseAtomicMessages(validPayload({ messages: [{ ...message("wamid.no-id"), id: undefined }] })), 400);
  assertIntakeError(() => parseAtomicMessages({ ...validPayload(), entry: [{ changes: [] }] }), 400);
  assertIntakeError(() => parseAtomicMessages(validPayload({ phoneId: "" })), 400);

  const mixedIdentity = validPayload({ messages: [message("wamid.identity.1")] });
  mixedIdentity.entry.push(validPayload({
    messages: [message("wamid.identity.2")],
    phoneId: "phone-diferente",
  }).entry[0]);
  assertIntakeError(() => parseAtomicMessages(mixedIdentity), 400);
});

test("canonicalizacao e hash sao deterministas sem normalizar texto ou arrays", () => {
  const first = validPayload({ messages: [message("wamid.canonical", "  texto com espacos  ")] });
  const reorderedMessage = {
    text: { body: "  texto com espacos  " },
    timestamp: "1784400000",
    type: "text",
    from: "5511999999999",
    id: "wamid.canonical",
  };
  const second = validPayload({ messages: [reorderedMessage] });
  const left = parseAtomicMessages(first)[0];
  const right = parseAtomicMessages(second)[0];
  assert.equal(left.payloadJson, right.payloadJson);
  assert.equal(left.payloadHash, right.payloadHash);
  assert.equal(JSON.parse(left.payloadJson).message.text.body, "  texto com espacos  ");

  const changed = parseAtomicMessages(validPayload({ messages: [message("wamid.canonical", "alterado")] }))[0];
  assert.notEqual(changed.payloadHash, left.payloadHash);
  assert.equal(canonicalStringify({ z: [2, 1], a: true }), '{"a":true,"z":[2,1]}');
});

test("gates, mapping e capabilities falham fechados sem escrita", async () => {
  const body = bodyFor("wamid.gates");
  process.env.WHATSAPP_INTEGRATION_ENABLED = "false";
  assert.equal((await rawRequest(body)).status, 404);
  process.env.WHATSAPP_INTEGRATION_ENABLED = "true";

  const unknownBody = Buffer.from(JSON.stringify(validPayload({ entryId: "waba-inexistente" })), "utf8");
  assert.equal((await rawRequest(unknownBody)).status, 404);

  await prisma.canalIntegracao.update({ where: { id: integrationA.id }, data: { ativo: false } });
  assert.equal((await rawRequest(body)).status, 404);
  await prisma.canalIntegracao.update({ where: { id: integrationA.id }, data: { ativo: true } });

  await prisma.empresaFuncionalidade.delete({
    where: { empresaId_chave: { empresaId: empresaA.id, chave: "WHATSAPP_INTEGRATION" } },
  });
  assert.equal((await rawRequest(body)).status, 404);
  await prisma.empresaFuncionalidade.create({
    data: { empresaId: empresaA.id, chave: "WHATSAPP_INTEGRATION", habilitada: true },
  });

  await prisma.empresaFuncionalidade.delete({
    where: { empresaId_chave: { empresaId: empresaA.id, chave: "WHATSAPP_INBOUND" } },
  });
  assert.equal((await rawRequest(body)).status, 404);
  assert.equal(await whatsappEventCount(), 0);
});

test("mapping ambiguo e tenant externo sao tratados sem ampliar escopo", async () => {
  await createIntegration(empresaA.id, "ambiguous", wabaId, phoneNumberId);
  assert.equal((await rawRequest(bodyFor("wamid.ambiguous"))).status, 503);
  assert.equal(await whatsappEventCount(), 0);

  await prisma.canalIntegracao.deleteMany({ where: { chaveInterna: "whatsapp-ambiguous-f1b1-v2" } });
  const payload = validPayload({ messages: [message("wamid.tenant-internal")] });
  payload.empresaId = empresaB.id;
  payload.tenantId = empresaB.id;
  const accepted = await rawRequest(Buffer.from(JSON.stringify(payload)), { pathname: "/webhooks/whatsapp?empresaId=999" });
  assert.equal(accepted.status, 200);
  const event = await prisma.eventoWebhook.findFirstOrThrow({ where: { externalEventId: "wamid.tenant-internal" } });
  assert.equal(event.empresaId, empresaA.id);
  assert.equal(event.canalIntegracaoId, integrationA.id);
});

test("persistencia atomica usa wamid, payload recuperavel e estado nao processado", async () => {
  const response = await rawRequest(bodyFor("wamid.persist.1", "Mensagem persistida"));
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { accepted: true });

  const event = await prisma.eventoWebhook.findFirstOrThrow({ where: { externalEventId: "wamid.persist.1" } });
  assert.equal(event.empresaId, empresaA.id);
  assert.equal(event.canalIntegracaoId, integrationA.id);
  assert.equal(event.provedor, "WHATSAPP");
  assert.equal(event.tipoEvento, "WHATSAPP_MESSAGE_RECEIVED");
  assert.equal(event.statusProcessamento, "RECEBIDO");
  assert.equal(event.tentativas, 0);
  assert.equal(event.processadoEm, null);
  assert.equal(crypto.createHash("sha256").update(event.payloadJson).digest("hex"), event.payloadHash);
  assert.equal(JSON.parse(event.payloadJson).message.text.body, "Mensagem persistida");
});

test("lote, duplicidade interna e lotes sobrepostos permanecem idempotentes", async () => {
  const two = bodyForMessages([message("wamid.batch.1"), message("wamid.batch.2")]);
  assert.equal((await rawRequest(two)).status, 200);
  assert.equal(await whatsappEventCount(), 2);

  const duplicate = bodyForMessages([message("wamid.batch.3"), message("wamid.batch.3")]);
  assert.equal((await rawRequest(duplicate)).status, 200);
  assert.equal(await prisma.eventoWebhook.count({ where: { externalEventId: "wamid.batch.3" } }), 1);

  assert.equal((await rawRequest(bodyForMessages([message("wamid.batch.2"), message("wamid.batch.4")]))).status, 200);
  assert.equal(await whatsappEventCount(), 4);
});

test("retries equivalentes retornam 200 e conflitos nunca sobrescrevem", async () => {
  const originalBody = bodyFor("wamid.retry", "Original");
  assert.equal((await rawRequest(originalBody)).status, 200);
  const original = await prisma.eventoWebhook.findFirstOrThrow({ where: { externalEventId: "wamid.retry" } });
  assert.equal((await rawRequest(originalBody)).status, 200);
  assert.equal(await prisma.eventoWebhook.count({ where: { externalEventId: "wamid.retry" } }), 1);

  const conflict = await rawRequest(bodyFor("wamid.retry", "Divergente"));
  assert.equal(conflict.status, 409);
  assert.deepEqual(await prisma.eventoWebhook.findUnique({ where: { id: original.id } }), original);

  const divergentBatch = bodyForMessages([
    message("wamid.same-batch", "A"),
    message("wamid.same-batch", "B"),
  ]);
  assert.equal((await rawRequest(divergentBatch)).status, 409);
  assert.equal(await prisma.eventoWebhook.count({ where: { externalEventId: "wamid.same-batch" } }), 0);

  assert.equal((await rawRequest(bodyFor("wamid.conflict.second", "Original segundo"))).status, 200);
  const conflictInSecond = bodyForMessages([
    message("wamid.conflict.first", "Primeiro novo"),
    message("wamid.conflict.second", "Segundo divergente"),
  ]);
  assert.equal((await rawRequest(conflictInSecond)).status, 409);
  assert.equal(await prisma.eventoWebhook.count({ where: { externalEventId: "wamid.conflict.first" } }), 0);
});

test("wamid existente em outro tenant gera conflito sanitizado", async () => {
  const parsed = parseAtomicMessages(validPayload({ messages: [message("wamid.cross-tenant")] }))[0];
  await prisma.eventoWebhook.create({
    data: {
      empresaId: empresaB.id,
      canalIntegracaoId: integrationB.id,
      provedor: "WHATSAPP",
      externalEventId: "wamid.cross-tenant",
      tipoEvento: "WHATSAPP_MESSAGE_RECEIVED",
      payloadHash: parsed.payloadHash,
      payloadJson: parsed.payloadJson,
    },
  });
  assert.equal((await rawRequest(bodyFor("wamid.cross-tenant"))).status, 409);
  assert.equal(await prisma.eventoWebhook.count({ where: { externalEventId: "wamid.cross-tenant" } }), 1);
});

test("concorrencia equivalente cria uma linha e concorrencia divergente conflita", async () => {
  const sameBody = bodyFor("wamid.concurrent", "Mesmo conteudo");
  const equivalent = await Promise.all([rawRequest(sameBody), rawRequest(sameBody)]);
  assert.deepEqual(equivalent.map((response) => response.status).sort(), [200, 200]);
  assert.equal(await prisma.eventoWebhook.count({ where: { externalEventId: "wamid.concurrent" } }), 1);

  const divergent = await Promise.all([
    rawRequest(bodyFor("wamid.concurrent-different", "A")),
    rawRequest(bodyFor("wamid.concurrent-different", "B")),
  ]);
  assert.deepEqual(divergent.map((response) => response.status).sort(), [200, 409]);
  assert.equal(await prisma.eventoWebhook.count({ where: { externalEventId: "wamid.concurrent-different" } }), 1);
});

test("falha no segundo insert faz rollback e retorna 503 sanitizado", async () => {
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "f1b1_fail_second" BEFORE INSERT ON "EventoWebhook"
    WHEN NEW."externalEventId" = 'wamid.fail.2'
    BEGIN SELECT RAISE(ABORT, 'falha controlada'); END
  `);
  try {
    const response = await rawRequest(bodyForMessages([message("wamid.fail.1"), message("wamid.fail.2")]));
    assert.equal(response.status, 503);
    assert.equal(await prisma.eventoWebhook.count({
      where: { externalEventId: { in: ["wamid.fail.1", "wamid.fail.2"] } },
    }), 0);
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "f1b1_fail_second"');
  }
});

test("lote misto nao persiste e respostas ou logs nao vazam dados sensiveis", async () => {
  const mixed = bodyForMessages([
    message("wamid.mixed.text"),
    { ...message("wamid.mixed.image"), type: "image", image: { id: "media-secret" } },
  ]);
  const captured = [];
  const originalConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const method of Object.keys(originalConsole)) console[method] = (...args) => captured.push(args.join(" "));
  try {
    const response = await rawRequest(mixed);
    assert.equal(response.status, 422);
    assert.equal(await whatsappEventCount(), 0);
    const output = `${response.text}\n${captured.join("\n")}`;
    for (const forbidden of [appSecret, "wamid.mixed", "media-secret", wabaId, phoneNumberId, "5511999999999"]) {
      assert.equal(output.includes(forbidden), false);
    }
  } finally {
    Object.assign(console, originalConsole);
  }
});

test("evento Site, entidades comerciais e ausencia de rede permanecem intactos", async () => {
  assert.deepEqual(await prisma.eventoWebhook.findUniqueOrThrow({ where: { id: legacyEvent.id } }), legacyEvent);
  assert.deepEqual(await readDomainCounts(), domainCounts);

  const source = fs.readFileSync(path.join(__dirname, "..", "src", "integrations", "whatsappWebhookIntake.js"), "utf8");
  assert.doesNotMatch(source, /\b(?:fetch|axios|Graph API)\b/i);
  assert.doesNotMatch(source, /require\(["'](?:node:)?(?:http|https|net|dns)["']\)/i);
  for (const model of ["cliente", "lead", "contatoCanal", "conversaCanal", "mensagemCanal", "negocio", "nota", "acompanhamento"]) {
    assert.doesNotMatch(source, new RegExp(`\\.${model}\\.(?:create|update|delete|upsert)`, "i"));
  }
});

async function createIntegration(empresaId, suffix, integrationWabaId, integrationPhoneId) {
  return prisma.canalIntegracao.create({
    data: {
      empresaId,
      tipo: "WHATSAPP_META",
      nome: `WhatsApp ${suffix}`,
      chaveInterna: `whatsapp-${suffix}-f1b1-v2`,
      status: "ATIVO",
      modoTeste: true,
      ativo: true,
      providerEnvironment: `sandbox-${suffix}`,
      metaAppId: `app-${suffix}`,
      wabaId: integrationWabaId,
      phoneNumberId: integrationPhoneId,
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

function validPayload({ messages = [message("wamid.default")], contacts, entryId = wabaId, phoneId = phoneNumberId } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: entryId,
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: phoneId, display_phone_number: "+55 11 0000-0000" },
          messages,
          ...(contacts ? { contacts } : {}),
        },
      }],
    }],
  };
}

function message(id, body = "Mensagem de teste") {
  return {
    id,
    from: "5511999999999",
    timestamp: "1784400000",
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
  const response = await fetch(`${baseUrl}${options.pathname || "/webhooks/whatsapp"}`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-hub-signature-256": sign(rawBody),
      ...(options.headers || {}),
    },
    body: rawBody,
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    body: text && response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : text,
  };
}

function sign(rawBody) {
  return `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
}

async function whatsappEventCount() {
  return prisma.eventoWebhook.count({ where: { provedor: "WHATSAPP" } });
}

async function readDomainCounts() {
  const models = ["cliente", "lead", "contatoCanal", "conversaCanal", "mensagemCanal", "negocio", "nota", "acompanhamento"];
  return Object.fromEntries(await Promise.all(models.map(async (model) => [model, await prisma[model].count()])));
}

function assertIntakeError(callback, status) {
  assert.throws(callback, (error) => error?.status === status && /^WEBHOOK_/.test(error?.code));
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
