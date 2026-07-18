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
const {
  processWhatsAppWebhookEvent,
} = require("../src/integrations/whatsappWebhookProcessor");

const runDir = requiredEnv("CRM_PRISMA_TEST_RUN_DIR");
const auditDir = path.join(runDir, "whatsapp-f1b2");
const databasePath = path.join(auditDir, `whatsapp-f1b2-${process.pid}.db`);
const sourceDatabase = requiredEnv("CRM_TEST_BASE_DATABASE_PATH");
const wabaId = "waba-f1b2";
const phoneNumberId = "phone-f1b2";
const senderId = "5511999999999";
const normalizedPhone = "+5511999999999";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: databaseUrl(databasePath),
  CRM_TEST_DATABASE_URL: databaseUrl(databasePath),
  WHATSAPP_INTEGRATION_ENABLED: "true",
  WHATSAPP_INBOUND_ENABLED: "true",
});

let prisma;
let empresaA;
let empresaB;
let integrationA;
let integrationB;
let siteIntegration;
let legacySiteEvent;

before(async () => {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.copyFileSync(sourceDatabase, databasePath);
  prisma = new PrismaClient({ datasourceUrl: databaseUrl(databasePath) });
  empresaA = await prisma.empresa.create({ data: { nome: "Empresa F1B2 A", slug: "empresa-f1b2-a" } });
  empresaB = await prisma.empresa.create({ data: { nome: "Empresa F1B2 B", slug: "empresa-f1b2-b" } });
  integrationA = await createWhatsAppIntegration(empresaA.id, "a", wabaId, phoneNumberId);
  integrationB = await createWhatsAppIntegration(empresaB.id, "b", "waba-f1b2-b", "phone-f1b2-b");
  siteIntegration = await prisma.canalIntegracao.create({
    data: {
      empresaId: empresaA.id,
      tipo: "SITE_FORM",
      nome: "Site legado F1B2",
      chaveInterna: "site-legado-f1b2",
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
      externalEventId: "site-legado-f1b2",
      tipoEvento: "SITE_LEAD_SUBMITTED",
      payloadHash: "a".repeat(64),
      statusProcessamento: "PROCESSADO",
      tentativas: 1,
      processadoEm: new Date("2026-07-18T12:00:00.000Z"),
    },
  });
  legacySiteEvent = await prisma.eventoWebhook.findUniqueOrThrow({ where: { id: legacySiteEvent.id } });
});

beforeEach(async () => {
  process.env.WHATSAPP_INTEGRATION_ENABLED = "true";
  process.env.WHATSAPP_INBOUND_ENABLED = "true";
  const empresaIds = [empresaA.id, empresaB.id];
  await prisma.mensagemCanal.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.conversaCanal.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.negocio.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.lead.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.contatoCanal.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.nota.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.acompanhamento.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.cliente.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.usuario.deleteMany({ where: { empresaId: { in: empresaIds } } });
  await prisma.eventoWebhook.deleteMany({ where: { provedor: "WHATSAPP" } });
  await prisma.empresaFuncionalidade.deleteMany({
    where: { empresaId: { in: empresaIds }, chave: { in: ["WHATSAPP_INTEGRATION", "WHATSAPP_INBOUND"] } },
  });
  await enableCapabilities(empresaA.id);
  await prisma.canalIntegracao.update({
    where: { id: integrationA.id },
    data: { ativo: true, status: "ATIVO", wabaId, phoneNumberId },
  });
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  removeDatabase(databasePath);
});

test("processa uma mensagem em cadeia atomica e reexecuta sem duplicar", async () => {
  const event = await createEvent({
    wamid: "wamid.f1b2.success",
    text: "  mensagem preservada  ",
    contactName: "Pessoa F1B2",
  });
  const originalPayload = { payloadHash: event.payloadHash, payloadJson: event.payloadJson, recebidoEm: event.recebidoEm };
  const beforeUnrelated = await unrelatedCounts();

  assert.deepEqual(await processEvent(event.id), { processed: true, idempotent: false });
  const contact = await prisma.contatoCanal.findFirstOrThrow({ where: { empresaId: empresaA.id } });
  const client = await prisma.cliente.findUniqueOrThrow({ where: { id: contact.clienteId } });
  const lead = await prisma.lead.findFirstOrThrow({ where: { clienteId: client.id } });
  const conversation = await prisma.conversaCanal.findFirstOrThrow({ where: { leadId: lead.id } });
  const message = await prisma.mensagemCanal.findFirstOrThrow({ where: { conversaCanalId: conversation.id } });
  const processed = await prisma.eventoWebhook.findUniqueOrThrow({ where: { id: event.id } });

  assert.equal(contact.externalId, normalizedPhone);
  assert.equal(contact.telefoneNormalizado, normalizedPhone);
  assert.equal(contact.nome, "Pessoa F1B2");
  assert.equal(client.nome, "Pessoa F1B2");
  assert.equal(client.telefone, normalizedPhone);
  assert.equal(client.email, "");
  assert.equal(client.origem, "WhatsApp");
  assert.equal(lead.status, "NOVO");
  assert.equal(lead.origem, "WHATSAPP");
  assert.equal(lead.responsavelId, null);
  assert.equal(conversation.status, "AGUARDANDO_ATENDIMENTO");
  assert.equal(conversation.responsavelId, null);
  assert.equal(conversation.respostaReservadaPorId, null);
  assert.equal(message.externalId, event.externalEventId);
  assert.equal(message.direcao, "ENTRADA");
  assert.equal(message.tipo, "TEXTO");
  assert.equal(message.texto, "  mensagem preservada  ");
  assert.equal(message.autorUsuarioId, null);
  assert.equal(message.status, "RECEBIDA");
  assert.equal(message.statusEntrega, "RECEBIDA");
  assert.equal(message.simulada, false);
  assert.equal(message.enviadaEm.toISOString(), "2026-07-18T16:00:00.000Z");
  assert.equal(processed.statusProcessamento, "PROCESSADO");
  assert.ok(processed.processadoEm instanceof Date);
  assert.equal(processed.payloadJson, originalPayload.payloadJson);
  assert.equal(processed.payloadHash, originalPayload.payloadHash);
  assert.equal(processed.recebidoEm.getTime(), originalPayload.recebidoEm.getTime());
  assert.equal(processed.tentativas, 0);
  assert.deepEqual(await unrelatedCounts(), beforeUnrelated);

  const counts = await chainCounts();
  assert.deepEqual(await processEvent(event.id), { processed: true, idempotent: true });
  assert.deepEqual(await chainCounts(), counts);

  await prisma.mensagemCanal.delete({ where: { id: message.id } });
  await assertProcessorError(event.id, "WHATSAPP_PROCESSED_EVENT_INCONSISTENT");
});

test("reutiliza contato, Cliente, Lead e conversa sem sobrescrever dados", async () => {
  const client = await prisma.cliente.create({
    data: {
      empresaId: empresaA.id,
      nome: "Cliente preservado",
      telefone: normalizedPhone,
      email: "preservar@f1b2.test",
      empresa: "Empresa preservada",
      origem: "Manual",
    },
  });
  const contact = await prisma.contatoCanal.create({
    data: {
      empresaId: empresaA.id,
      canalIntegracaoId: integrationA.id,
      clienteId: client.id,
      externalId: normalizedPhone,
      telefoneNormalizado: normalizedPhone,
      nome: "Contato preservado",
    },
  });
  const lead = await prisma.lead.create({
    data: { empresaId: empresaA.id, clienteId: client.id, status: "EM_ATENDIMENTO", origem: "SITE" },
  });
  const responsible = await prisma.usuario.create({
    data: {
      empresaId: empresaA.id,
      nome: "Responsavel preservado",
      email: "responsavel@f1b2.test",
      senhaHash: "hash-ficticio",
      papel: "VENDEDOR",
    },
  });
  const conversation = await prisma.conversaCanal.create({
    data: {
      empresaId: empresaA.id,
      canalIntegracaoId: integrationA.id,
      contatoCanalId: contact.id,
      leadId: lead.id,
      responsavelId: responsible.id,
      status: "EM_ATENDIMENTO",
      chaveAberta: `canal:${integrationA.id}:contato:${contact.id}`,
    },
  });
  const beforeClient = await prisma.cliente.findUniqueOrThrow({ where: { id: client.id } });
  const event = await createEvent({ wamid: "wamid.f1b2.reuse", contactName: "Nome nao sobrescrever" });

  await processEvent(event.id);
  assert.deepEqual(await prisma.cliente.findUniqueOrThrow({ where: { id: client.id } }), beforeClient);
  assert.equal(await prisma.cliente.count({ where: { empresaId: empresaA.id } }), 1);
  assert.equal(await prisma.lead.count({ where: { empresaId: empresaA.id } }), 1);
  assert.equal(await prisma.conversaCanal.count({ where: { empresaId: empresaA.id } }), 1);
  const preservedConversation = await prisma.conversaCanal.findUniqueOrThrow({ where: { id: conversation.id } });
  assert.equal(preservedConversation.responsavelId, responsible.id);
  assert.equal(preservedConversation.status, "EM_ATENDIMENTO");
});

test("deduplicacao de Cliente e Lead falha fechada em ambiguidades", async () => {
  await prisma.cliente.createMany({
    data: [
      { empresaId: empresaA.id, nome: "Duplicado A", telefone: normalizedPhone },
      { empresaId: empresaA.id, nome: "Duplicado B", telefone: "11999999999" },
      { empresaId: empresaB.id, nome: "Outro tenant", telefone: normalizedPhone },
    ],
  });
  const ambiguousClientEvent = await createEvent({ wamid: "wamid.f1b2.client-ambiguous" });
  await assertProcessorError(ambiguousClientEvent.id, "WHATSAPP_CLIENT_AMBIGUOUS");
  assert.equal(await prisma.contatoCanal.count({ where: { empresaId: empresaA.id } }), 0);
  assert.equal((await prisma.eventoWebhook.findUniqueOrThrow({ where: { id: ambiguousClientEvent.id } })).statusProcessamento, "RECEBIDO");

  await prisma.cliente.deleteMany({ where: { empresaId: empresaA.id } });
  const client = await prisma.cliente.create({ data: { empresaId: empresaA.id, nome: "Lead ambiguo", telefone: normalizedPhone } });
  await prisma.lead.createMany({
    data: [
      { empresaId: empresaA.id, clienteId: client.id, status: "NOVO", origem: "WHATSAPP" },
      { empresaId: empresaA.id, clienteId: client.id, status: "QUALIFICADO", origem: "WHATSAPP" },
    ],
  });
  const ambiguousLeadEvent = await createEvent({ wamid: "wamid.f1b2.lead-ambiguous" });
  await assertProcessorError(ambiguousLeadEvent.id, "WHATSAPP_LEAD_AMBIGUOUS");
  assert.equal(await prisma.contatoCanal.count({ where: { empresaId: empresaA.id } }), 0);
  assert.equal(await prisma.conversaCanal.count({ where: { empresaId: empresaA.id } }), 0);
});

test("Lead convertido e conversa encerrada nao sao reutilizados", async () => {
  const client = await prisma.cliente.create({ data: { empresaId: empresaA.id, nome: "Novo ciclo", telefone: normalizedPhone } });
  const converted = await prisma.lead.create({
    data: { empresaId: empresaA.id, clienteId: client.id, status: "CONVERTIDO", origem: "WHATSAPP", convertidoEm: new Date() },
  });
  const contact = await prisma.contatoCanal.create({
    data: {
      empresaId: empresaA.id,
      canalIntegracaoId: integrationA.id,
      clienteId: client.id,
      externalId: normalizedPhone,
      telefoneNormalizado: normalizedPhone,
    },
  });
  const closed = await prisma.conversaCanal.create({
    data: {
      empresaId: empresaA.id,
      canalIntegracaoId: integrationA.id,
      contatoCanalId: contact.id,
      leadId: converted.id,
      status: "ENCERRADA",
      chaveAberta: null,
      encerradaEm: new Date(),
    },
  });
  const event = await createEvent({ wamid: "wamid.f1b2.new-cycle" });
  await processEvent(event.id);
  assert.equal(await prisma.lead.count({ where: { empresaId: empresaA.id } }), 2);
  const newLead = await prisma.lead.findFirstOrThrow({ where: { id: { not: converted.id } } });
  assert.equal(newLead.status, "NOVO");
  const open = await prisma.conversaCanal.findFirstOrThrow({ where: { id: { not: closed.id } } });
  assert.equal(open.status, "AGUARDANDO_ATENDIMENTO");
  assert.equal(open.leadId, newLead.id);
});

test("duas conversas ativas compativeis impedem escolha silenciosa", async () => {
  const client = await prisma.cliente.create({ data: { empresaId: empresaA.id, nome: "Conversa ambigua", telefone: normalizedPhone } });
  const contact = await prisma.contatoCanal.create({
    data: { empresaId: empresaA.id, canalIntegracaoId: integrationA.id, clienteId: client.id, externalId: normalizedPhone, telefoneNormalizado: normalizedPhone },
  });
  const lead = await prisma.lead.create({ data: { empresaId: empresaA.id, clienteId: client.id, origem: "WHATSAPP" } });
  await prisma.conversaCanal.createMany({
    data: [
      { empresaId: empresaA.id, canalIntegracaoId: integrationA.id, contatoCanalId: contact.id, leadId: lead.id, status: "NOVA", chaveAberta: `canal:${integrationA.id}:contato:${contact.id}` },
      { empresaId: empresaA.id, canalIntegracaoId: integrationA.id, contatoCanalId: contact.id, leadId: lead.id, status: "PENDENTE", chaveAberta: null },
    ],
  });
  const event = await createEvent({ wamid: "wamid.f1b2.conversation-ambiguous" });
  await assertProcessorError(event.id, "WHATSAPP_CONVERSATION_AMBIGUOUS");
  assert.equal(await prisma.mensagemCanal.count({ where: { empresaId: empresaA.id } }), 0);
  assert.equal((await prisma.eventoWebhook.findUniqueOrThrow({ where: { id: event.id } })).statusProcessamento, "RECEBIDO");
});

test("valida hash, identidade, provider, integracao e tipo antes de escrever", async () => {
  const invalidHash = await createEvent({ wamid: "wamid.f1b2.hash" });
  await prisma.eventoWebhook.update({ where: { id: invalidHash.id }, data: { payloadHash: "0".repeat(64) } });
  await assertProcessorError(invalidHash.id, "WHATSAPP_EVENT_PAYLOAD_INTEGRITY_FAILED");

  const invalidWamid = await createEvent({ wamid: "wamid.f1b2.wamid" });
  await mutatePayload(invalidWamid.id, (payload) => { payload.message.id = "wamid.f1b2.outro"; });
  await assertProcessorError(invalidWamid.id, "WHATSAPP_EVENT_PAYLOAD_INVALID");

  const invalidWaba = await createEvent({ wamid: "wamid.f1b2.waba", payloadWabaId: "waba-divergente" });
  await assertProcessorError(invalidWaba.id, "WHATSAPP_EVENT_PAYLOAD_INVALID");

  const invalidPhoneId = await createEvent({ wamid: "wamid.f1b2.phone-id", payloadPhoneId: "phone-divergente" });
  await assertProcessorError(invalidPhoneId.id, "WHATSAPP_EVENT_PAYLOAD_INVALID");

  const invalidType = await createEvent({ wamid: "wamid.f1b2.type" });
  await prisma.eventoWebhook.update({ where: { id: invalidType.id }, data: { tipoEvento: "WHATSAPP_STATUS_RECEIVED" } });
  await assertProcessorError(invalidType.id, "WHATSAPP_EVENT_UNSUPPORTED");

  await assertProcessorError(legacySiteEvent.id, "WHATSAPP_EVENT_UNSUPPORTED");
  assert.deepEqual(await chainCounts(), { clients: 0, contacts: 0, leads: 0, conversations: 0, messages: 0 });
});

test("flags, capabilities e integracao inativa impedem qualquer escrita", async () => {
  const event = await createEvent({ wamid: "wamid.f1b2.gates" });
  process.env.WHATSAPP_INBOUND_ENABLED = "false";
  await assertProcessorError(event.id, "WHATSAPP_EVENT_PROCESSING_NOT_AVAILABLE");
  process.env.WHATSAPP_INBOUND_ENABLED = "true";

  await prisma.empresaFuncionalidade.delete({
    where: { empresaId_chave: { empresaId: empresaA.id, chave: "WHATSAPP_INBOUND" } },
  });
  await assertProcessorError(event.id, "WHATSAPP_EVENT_PROCESSING_NOT_AVAILABLE");
  await enableCapabilities(empresaA.id);

  await prisma.canalIntegracao.update({ where: { id: integrationA.id }, data: { ativo: false } });
  await assertProcessorError(event.id, "WHATSAPP_EVENT_INTEGRATION_INVALID");
  assert.deepEqual(await chainCounts(), { clients: 0, contacts: 0, leads: 0, conversations: 0, messages: 0 });
  assert.equal((await prisma.eventoWebhook.findUniqueOrThrow({ where: { id: event.id } })).statusProcessamento, "RECEBIDO");
});

test("MensagemCanal equivalente e conflitante respeitam idempotencia", async () => {
  const client = await prisma.cliente.create({ data: { empresaId: empresaA.id, nome: "Mensagem existente", telefone: normalizedPhone } });
  const contact = await prisma.contatoCanal.create({
    data: { empresaId: empresaA.id, canalIntegracaoId: integrationA.id, clienteId: client.id, externalId: normalizedPhone, telefoneNormalizado: normalizedPhone },
  });
  const lead = await prisma.lead.create({ data: { empresaId: empresaA.id, clienteId: client.id, origem: "WHATSAPP" } });
  const conversation = await prisma.conversaCanal.create({
    data: {
      empresaId: empresaA.id,
      canalIntegracaoId: integrationA.id,
      contatoCanalId: contact.id,
      leadId: lead.id,
      status: "NOVA",
      chaveAberta: `canal:${integrationA.id}:contato:${contact.id}`,
    },
  });

  const equivalentEvent = await createEvent({ wamid: "wamid.f1b2.message-equivalent", text: "Original" });
  const equivalent = await prisma.mensagemCanal.create({
    data: {
      empresaId: empresaA.id,
      canalIntegracaoId: integrationA.id,
      conversaCanalId: conversation.id,
      externalId: equivalentEvent.externalEventId,
      direcao: "ENTRADA",
      tipo: "TEXTO",
      texto: "Original",
      status: "RECEBIDA",
      statusEntrega: "RECEBIDA",
      enviadaEm: new Date("2026-07-18T16:00:00.000Z"),
      simulada: false,
    },
  });
  assert.deepEqual(await processEvent(equivalentEvent.id), { processed: true, idempotent: false });
  assert.equal(await prisma.mensagemCanal.count({ where: { externalId: equivalentEvent.externalEventId } }), 1);
  assert.equal((await prisma.mensagemCanal.findUniqueOrThrow({ where: { id: equivalent.id } })).texto, "Original");

  const conflictingEvent = await createEvent({ wamid: "wamid.f1b2.message-conflict", text: "Original" });
  const conflicting = await prisma.mensagemCanal.create({
    data: {
      empresaId: empresaA.id,
      canalIntegracaoId: integrationA.id,
      conversaCanalId: conversation.id,
      externalId: conflictingEvent.externalEventId,
      direcao: "ENTRADA",
      tipo: "TEXTO",
      texto: "Divergente",
      status: "RECEBIDA",
      statusEntrega: "RECEBIDA",
      enviadaEm: new Date("2026-07-18T16:00:00.000Z"),
      simulada: false,
    },
  });
  await assertProcessorError(conflictingEvent.id, "WHATSAPP_MESSAGE_IDEMPOTENCY_CONFLICT");
  assert.equal((await prisma.mensagemCanal.findUniqueOrThrow({ where: { id: conflicting.id } })).texto, "Divergente");
  assert.equal((await prisma.eventoWebhook.findUniqueOrThrow({ where: { id: conflictingEvent.id } })).statusProcessamento, "RECEBIDO");
});

test("falha na mensagem desfaz contato, Cliente, Lead, conversa e claim do evento", async () => {
  const event = await createEvent({ wamid: "wamid.f1b2.rollback" });
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "f1b2_fail_message" BEFORE INSERT ON "MensagemCanal"
    WHEN NEW."externalId" = 'wamid.f1b2.rollback'
    BEGIN SELECT RAISE(ABORT, 'falha controlada'); END
  `);
  try {
    await assertProcessorError(event.id, "WHATSAPP_EVENT_PROCESSING_UNAVAILABLE");
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "f1b2_fail_message"');
  }
  assert.deepEqual(await chainCounts(), { clients: 0, contacts: 0, leads: 0, conversations: 0, messages: 0 });
  const pending = await prisma.eventoWebhook.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(pending.statusProcessamento, "RECEBIDO");
  assert.equal(pending.processadoEm, null);
});

test("concorrencia do mesmo evento e de eventos sobrepostos cria uma unica cadeia", async () => {
  const same = await createEvent({ wamid: "wamid.f1b2.concurrent-same" });
  const sameResults = await Promise.all([processEvent(same.id), processEvent(same.id)]);
  assert.deepEqual(sameResults.map((item) => item.idempotent).sort(), [false, true]);
  assert.deepEqual(await chainCounts(), { clients: 1, contacts: 1, leads: 1, conversations: 1, messages: 1 });

  await prisma.mensagemCanal.deleteMany({ where: { empresaId: empresaA.id } });
  await prisma.conversaCanal.deleteMany({ where: { empresaId: empresaA.id } });
  await prisma.lead.deleteMany({ where: { empresaId: empresaA.id } });
  await prisma.contatoCanal.deleteMany({ where: { empresaId: empresaA.id } });
  await prisma.cliente.deleteMany({ where: { empresaId: empresaA.id } });
  const first = await createEvent({ wamid: "wamid.f1b2.concurrent-a", text: "A" });
  const second = await createEvent({ wamid: "wamid.f1b2.concurrent-b", text: "B" });
  await Promise.all([processEvent(first.id), processEvent(second.id)]);
  assert.deepEqual(await chainCounts(), { clients: 1, contacts: 1, leads: 1, conversations: 1, messages: 2 });
  assert.equal(await prisma.eventoWebhook.count({ where: { id: { in: [first.id, second.id] }, statusProcessamento: "PROCESSADO" } }), 2);
});

test("tenant, Site, callback e ausencia de efeitos externos permanecem isolados", async () => {
  await prisma.cliente.create({ data: { empresaId: empresaB.id, nome: "Mesmo telefone outro tenant", telefone: normalizedPhone } });
  const event = await createEvent({ wamid: "wamid.f1b2.tenant" });
  await processEvent(event.id);
  assert.equal(await prisma.cliente.count({ where: { empresaId: empresaA.id } }), 1);
  assert.equal(await prisma.cliente.count({ where: { empresaId: empresaB.id } }), 1);
  assert.deepEqual(await prisma.eventoWebhook.findUniqueOrThrow({ where: { id: legacySiteEvent.id } }), legacySiteEvent);
  assert.deepEqual(await unrelatedCounts(), { businesses: 0, notes: 0, followUps: 0, audits: 0 });

  const callbackSource = fs.readFileSync(path.join(__dirname, "..", "src", "integrations", "whatsappWebhook.js"), "utf8");
  const intakeSource = fs.readFileSync(path.join(__dirname, "..", "src", "integrations", "whatsappWebhookIntake.js"), "utf8");
  const processorSource = fs.readFileSync(path.join(__dirname, "..", "src", "integrations", "whatsappWebhookProcessor.js"), "utf8");
  assert.doesNotMatch(callbackSource, /whatsappWebhookProcessor|processWhatsAppWebhookEvent/);
  assert.doesNotMatch(intakeSource, /whatsappWebhookProcessor|processWhatsAppWebhookEvent/);
  assert.doesNotMatch(processorSource, /\b(?:fetch|axios|Graph API|OAuth)\b/i);
  assert.doesNotMatch(processorSource, /require\(["'](?:node:)?(?:http|https|net|dns)["']\)/i);
  for (const model of ["negocio", "nota", "acompanhamento", "auditoriaFuncionalidade"]) {
    assert.doesNotMatch(processorSource, new RegExp(`\\.${model}\\.(?:create|update|delete|upsert)`, "i"));
  }
});

async function createEvent({
  wamid,
  text = "Mensagem F1B2",
  contactName = null,
  payloadWabaId = wabaId,
  payloadPhoneId = phoneNumberId,
  integration = integrationA,
  empresaId = empresaA.id,
} = {}) {
  const parsed = parseAtomicMessages(validPayload({
    messages: [message(wamid, text)],
    contacts: contactName ? [{ wa_id: senderId, profile: { name: contactName } }] : undefined,
    entryId: payloadWabaId,
    phoneId: payloadPhoneId,
  }))[0];
  return prisma.eventoWebhook.create({
    data: {
      empresaId,
      canalIntegracaoId: integration.id,
      provedor: "WHATSAPP",
      externalEventId: wamid,
      tipoEvento: "WHATSAPP_MESSAGE_RECEIVED",
      payloadHash: parsed.payloadHash,
      payloadJson: parsed.payloadJson,
      statusProcessamento: "RECEBIDO",
      tentativas: 0,
    },
  });
}

async function mutatePayload(eventId, mutate) {
  const event = await prisma.eventoWebhook.findUniqueOrThrow({ where: { id: eventId } });
  const payload = JSON.parse(event.payloadJson);
  mutate(payload);
  const payloadJson = canonicalStringify(payload);
  const payloadHash = crypto.createHash("sha256").update(payloadJson, "utf8").digest("hex");
  await prisma.eventoWebhook.update({ where: { id: eventId }, data: { payloadJson, payloadHash } });
}

async function processEvent(eventoWebhookId) {
  return processWhatsAppWebhookEvent({ prisma, eventoWebhookId });
}

async function assertProcessorError(eventoWebhookId, code) {
  await assert.rejects(
    () => processEvent(eventoWebhookId),
    (error) => error?.name === "WhatsAppWebhookProcessingError" && error?.code === code,
  );
}

async function createWhatsAppIntegration(empresaId, suffix, integrationWabaId, integrationPhoneId) {
  return prisma.canalIntegracao.create({
    data: {
      empresaId,
      tipo: "WHATSAPP_META",
      nome: `WhatsApp F1B2 ${suffix}`,
      chaveInterna: `whatsapp-f1b2-${suffix}`,
      status: "ATIVO",
      modoTeste: true,
      ativo: true,
      providerEnvironment: `sandbox-f1b2-${suffix}`,
      metaAppId: `app-f1b2-${suffix}`,
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

function message(id, body) {
  return {
    id,
    from: senderId,
    timestamp: "1784390400",
    type: "text",
    text: { body },
  };
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
