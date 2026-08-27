const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");

const postgres = process.env.CRM_TEST_DATABASE_PROVIDER === "postgresql";
const suffix = `${Date.now()}-${process.pid}`;
let databasePath;
if (!postgres) {
  databasePath = path.join(requiredEnv("CRM_PRISMA_TEST_RUN_DIR"), "email-inbound-processing", `processing-${process.pid}.db`);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.copyFileSync(requiredEnv("CRM_TEST_BASE_DATABASE_PATH"), databasePath);
}
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
  CRM_TEST_DATABASE_URL: postgres ? requiredEnv("CRM_TEST_DATABASE_URL") : databaseUrl(databasePath),
});

const { PrismaClient } = require("@prisma/client");
const { createEmailInboundProcessor } = require("../src/integrations/emailInboundProcessor");
const { buildRawEmailFixture, createEmailTestSimulator } = require("../src/integrations/emailTestSimulator");
const { normalizeInboundMessage, EMAIL_LIMITS } = require("../src/integrations/emailProviderAdapter");
const { normalizeEmailAddress } = require("../src/integrations/emailFoundation");
const { createLeadsCommunicationServices } = require("../src/leads-communication/services");
const { createCustomer360Service } = require("../src/customer-360/service");
const { createAutomationService } = require("../src/automations/service");

let prisma;
const tenantIds = [];

before(() => { prisma = new PrismaClient(); });
after(async () => {
  let cleanupError;
  try { if (tenantIds.length) await cleanupTenants(tenantIds); } catch (error) { cleanupError = error; }
  if (prisma) await prisma.$disconnect();
  if (databasePath) removeDatabase(databasePath);
  if (cleanupError) throw cleanupError;
});

test("texto MIME cria pipeline comercial, metadata sanitizada e replay idempotente", async () => {
  const fixture = await seedActiveMailbox("email-text");
  const simulator = simulatorFor(fixture.env);
  const messageId = `<text-${suffix}@events.example.test>`;
  const raw = buildRawEmailFixture({
    mailboxAddress: fixture.mailbox,
    fromAddress: "sender@contact.example.test",
    fromName: "Synthetic Customer",
    messageId,
    subject: "Pedido de proposta",
    text: "Preciso de uma proposta comercial.",
    html: "<p>Preciso de uma <strong>proposta</strong>.</p><script>unsafe()</script>",
    attachment: { filename: "folder/brief.txt", content: "metadata only" },
  });
  const first = await simulator.deliver({ raw, mailboxAddress: fixture.mailbox });
  const replay = await simulator.deliver({ raw, mailboxAddress: fixture.mailbox });
  assert.equal(first.accepted, true);
  assert.equal(first.idempotent, false);
  assert.equal(first.state, "PROCESSED");
  assert.equal(replay.idempotent, true);

  const counts = await commercialCounts(fixture.tenant.id);
  assert.deepEqual(counts, { events: 1, contacts: 1, clients: 1, leads: 1, conversations: 1, messages: 1, metadata: 1 });
  const contact = await prisma.contatoCanal.findFirst({ where: { empresaId: fixture.tenant.id } });
  const client = await prisma.cliente.findFirst({ where: { empresaId: fixture.tenant.id } });
  const lead = await prisma.lead.findFirst({ where: { empresaId: fixture.tenant.id } });
  const conversation = await prisma.conversaCanal.findFirst({ where: { empresaId: fixture.tenant.id } });
  const metadata = await prisma.emailMessageMetadata.findFirst({ where: { empresaId: fixture.tenant.id } });
  const message = await prisma.mensagemCanal.findFirst({ where: { empresaId: fixture.tenant.id } });
  const event = await prisma.eventoWebhook.findFirst({ where: { empresaId: fixture.tenant.id } });
  const channel = await prisma.canalIntegracao.findUnique({ where: { id: fixture.channel.id } });
  assert.equal(contact.externalId, "sender@contact.example.test");
  assert.equal(contact.telefoneNormalizado, null);
  assert.equal(client.email, "sender@contact.example.test");
  assert.equal(client.telefone, "");
  assert.equal(lead.origem, "EMAIL");
  assert.equal(conversation.emailSubject, "Pedido de proposta");
  assert.equal(metadata.attachmentCount, 1);
  assert.equal(metadata.htmlSanitized.includes("script"), false);
  assert.equal(metadata.attachmentsJson.includes("metadata only"), false);
  assert.equal(JSON.parse(metadata.attachmentsJson)[0].filename, "brief.txt");
  assert.equal(message.texto, "Preciso de uma proposta comercial.");
  assert.equal(event.payloadJson.includes("Content-Type:"), false);
  assert.equal(event.statusProcessamento, "PROCESSADO");
  assert.ok(channel.lastWebhookAt);
  assert.ok(channel.verifiedAt);
  assert.ok(channel.connectedAt);

  const context = { empresaId: fixture.tenant.id, usuarioId: 1, papel: "ADMIN" };
  const inbox = createLeadsCommunicationServices({ prisma });
  const detail = await inbox.getConversation(context, conversation.id);
  const messages = await inbox.listMessages(context, conversation.id, { page: 1, limit: 20 });
  assert.equal(detail.emailSubject, "Pedido de proposta");
  assert.equal(detail.ultimaMensagem.emailMetadata.subject, "Pedido de proposta");
  assert.equal(messages.data[0].emailMetadata.attachmentCount, 1);
  assert.equal(messages.data[0].emailMetadata.htmlSanitized, undefined);
  const timeline = await createCustomer360Service({ prisma }).getTimeline(context, client.id, { tipo: "MENSAGEM" });
  assert.equal(timeline.data[0].titulo, "E-mail recebido: Pedido de proposta");
  assert.match(timeline.data[0].descricao, /1 anexo/);
});

test("threading por In-Reply-To preserva conversa e remetente sem telefone", async () => {
  const fixture = await seedActiveMailbox("email-thread");
  const simulator = simulatorFor(fixture.env);
  const rootId = `<root-${suffix}@events.example.test>`;
  await simulator.deliver({ mailboxAddress: fixture.mailbox, fromAddress: "thread@contact.example.test", messageId: rootId, subject: "Contrato", text: "Primeira mensagem" });
  await simulator.deliver({ mailboxAddress: fixture.mailbox, fromAddress: "thread@contact.example.test", messageId: `<reply-${suffix}@events.example.test>`, inReplyTo: rootId, references: [rootId], subject: "Re: Contrato", text: "Segunda mensagem" });
  const counts = await commercialCounts(fixture.tenant.id);
  assert.equal(counts.events, 2);
  assert.equal(counts.messages, 2);
  assert.equal(counts.conversations, 1);
  assert.equal(counts.contacts, 1);
  assert.equal(counts.clients, 1);
  assert.equal(counts.leads, 1);

  await simulator.deliver({ mailboxAddress: fixture.mailbox, fromAddress: "thread@contact.example.test", messageId: `<second-root-${suffix}@events.example.test>`, subject: "Nova oportunidade", text: "Outra thread" });
  const conversations = await prisma.conversaCanal.findMany({ where: { empresaId: fixture.tenant.id }, orderBy: { id: "asc" } });
  assert.equal(conversations.length, 2);
  const user = await prisma.usuario.create({ data: { empresaId: fixture.tenant.id, nome: "Email manager", email: `email-manager-${suffix}@operator.example.test`, senhaHash: "not-used", papel: "ADMIN", ativo: true } });
  await prisma.conversaCanal.updateMany({ where: { id: { in: conversations.map((item) => item.id) } }, data: { status: "ENCERRADA", chaveAberta: null, encerradaEm: new Date() } });
  const service = createLeadsCommunicationServices({ prisma });
  for (const conversation of conversations) {
    await service.reopenConversation({ empresaId: fixture.tenant.id, usuarioId: user.id, papel: "ADMIN" }, conversation.id, { motivo: "Reabertura focal de thread" });
  }
  const reopened = await prisma.conversaCanal.findMany({ where: { id: { in: conversations.map((item) => item.id) } } });
  assert.equal(reopened.every((item) => item.chaveAberta === item.emailThreadKey), true);
  assert.equal(new Set(reopened.map((item) => item.chaveAberta)).size, 2);
});

test("inbound reutiliza Cliente existente pelo e-mail antes de criar cadastro", async () => {
  const fixture = await seedActiveMailbox("email-existing-client");
  const sender = "known@contact.example.test";
  const existing = await prisma.cliente.create({ data: { empresaId: fixture.tenant.id, nome: "Known customer", telefone: "", email: "  Known@Contact.Example.Test  ", empresa: "Existing", interesse: "", origem: "CRM" } });
  await simulatorFor(fixture.env).deliver({ mailboxAddress: fixture.mailbox, fromAddress: sender, messageId: `<known-${suffix}@events.example.test>`, subject: "Existing", text: "Reuse me" });
  const counts = await commercialCounts(fixture.tenant.id);
  assert.equal(counts.clients, 1);
  const contact = await prisma.contatoCanal.findFirstOrThrow({ where: { empresaId: fixture.tenant.id, externalId: sender } });
  assert.equal(contact.clienteId, existing.id);
});

test("inbound restaura estado coerente e preserva responsavel ao reabrir thread", async () => {
  const fixture = await seedActiveMailbox("email-inbound-status");
  const simulator = simulatorFor(fixture.env);
  const rootId = `<status-root-${suffix}@events.example.test>`;
  await simulator.deliver({ mailboxAddress: fixture.mailbox, fromAddress: "status@contact.example.test", messageId: rootId, subject: "Status", text: "Mensagem inicial" });
  const owner = await prisma.usuario.create({ data: { empresaId: fixture.tenant.id, nome: "Email owner", email: `email-owner-${suffix}@operator.example.test`, senhaHash: "not-used", papel: "ADMIN", ativo: true } });
  let conversation = await prisma.conversaCanal.findFirstOrThrow({ where: { empresaId: fixture.tenant.id } });
  await prisma.conversaCanal.update({ where: { id: conversation.id }, data: { responsavelId: owner.id, status: "AGUARDANDO_CLIENTE" } });
  const replyId = `<status-reply-${suffix}@events.example.test>`;
  await simulator.deliver({ mailboxAddress: fixture.mailbox, fromAddress: "status@contact.example.test", messageId: replyId, inReplyTo: rootId, references: [rootId], subject: "Re: Status", text: "Resposta do cliente" });
  conversation = await prisma.conversaCanal.findUniqueOrThrow({ where: { id: conversation.id } });
  assert.equal(conversation.status, "EM_ATENDIMENTO");
  assert.equal(conversation.responsavelId, owner.id);

  await prisma.conversaCanal.update({ where: { id: conversation.id }, data: { status: "ENCERRADA", chaveAberta: null, encerradaEm: new Date() } });
  await simulator.deliver({ mailboxAddress: fixture.mailbox, fromAddress: "status@contact.example.test", messageId: `<status-reopen-${suffix}@events.example.test>`, inReplyTo: replyId, references: [rootId, replyId], subject: "Re: Status", text: "Nova resposta do cliente" });
  conversation = await prisma.conversaCanal.findUniqueOrThrow({ where: { id: conversation.id } });
  assert.equal(conversation.status, "EM_ATENDIMENTO");
  assert.equal(conversation.responsavelId, owner.id);
  assert.equal(conversation.chaveAberta, conversation.emailThreadKey);
});

test("threading ambiguo e replay divergente falham sem sobrescrever o fluxo original", async () => {
  const fixture = await seedActiveMailbox("email-thread-conflict");
  const simulator = simulatorFor(fixture.env);
  const sender = "thread-conflict@contact.example.test";
  const firstRoot = `<thread-a-${suffix}@events.example.test>`;
  const secondRoot = `<thread-b-${suffix}@events.example.test>`;
  await simulator.deliver({ mailboxAddress: fixture.mailbox, fromAddress: sender, messageId: firstRoot, subject: "Thread A", text: "A0" });
  const firstReferences = [firstRoot];
  for (let index = 1; index <= 3; index += 1) {
    const messageId = `<thread-a-${index}-${suffix}@events.example.test>`;
    await simulator.deliver({ mailboxAddress: fixture.mailbox, fromAddress: sender, messageId, inReplyTo: firstReferences.at(-1), references: [...firstReferences], subject: "Re: Thread A", text: `A${index}` });
    firstReferences.push(messageId);
  }
  await simulator.deliver({ mailboxAddress: fixture.mailbox, fromAddress: sender, messageId: secondRoot, subject: "Thread B", text: "B0" });
  const before = await commercialCounts(fixture.tenant.id);
  await assert.rejects(
    simulator.deliver({ mailboxAddress: fixture.mailbox, fromAddress: sender, messageId: `<ambiguous-${suffix}@events.example.test>`, references: [...firstReferences, secondRoot], subject: "Ambiguous", text: "Must not attach" }),
    (error) => error.code === "EMAIL_THREAD_AMBIGUOUS",
  );
  const afterAmbiguous = await commercialCounts(fixture.tenant.id);
  assert.equal(afterAmbiguous.messages, before.messages);
  assert.equal(afterAmbiguous.conversations, before.conversations);

  const originalRaw = buildRawEmailFixture({ mailboxAddress: fixture.mailbox, fromAddress: sender, messageId: `<replay-conflict-${suffix}@events.example.test>`, text: "Original" });
  await simulator.deliver({ raw: originalRaw, mailboxAddress: fixture.mailbox });
  const beforeReplay = await commercialCounts(fixture.tenant.id);
  const divergentRaw = buildRawEmailFixture({ mailboxAddress: fixture.mailbox, fromAddress: sender, messageId: `<replay-conflict-${suffix}@events.example.test>`, text: "Divergent" });
  await assert.rejects(simulator.deliver({ raw: divergentRaw, mailboxAddress: fixture.mailbox }), (error) => error.code === "EMAIL_REPLAY_CONFLICT");
  assert.deepEqual(await commercialCounts(fixture.tenant.id), beforeReplay);
});

test("lead novo de E-mail aciona automacao canonicamente e uma unica vez", async () => {
  const fixture = await seedActiveMailbox("email-automation");
  const operator = await prisma.usuario.create({ data: { empresaId: fixture.tenant.id, nome: "Automation owner", email: `automation-owner-${suffix}@operator.example.test`, senhaHash: "not-used", papel: "ADMIN", ativo: true } });
  await prisma.empresaFuncionalidade.create({ data: { empresaId: fixture.tenant.id, chave: "AUTOMATIONS", habilitada: true, habilitadoEm: new Date(), habilitadoPorUsuarioId: operator.id } });
  const automationEnv = { ...fixture.env, AUTOMATIONS_ENABLED: "true" };
  const automation = createAutomationService({ prisma, env: automationEnv });
  const context = { empresaId: fixture.tenant.id, usuarioId: operator.id, papel: "ADMIN" };
  const rule = await automation.createRule(context, { nome: "Lead de E-mail", prioridade: 10, gatilho: "LEAD_CREATED", timezone: "UTC", condicoes: [], acoes: [{ tipo: "CREATE_INTERNAL_EVENT", eventoTipo: "EMAIL_LEAD_CREATED_TEST", resumo: "Evento tecnico." }] });
  await automation.activateRule(context, rule.id);
  const simulator = simulatorFor(automationEnv);
  const raw = buildRawEmailFixture({ mailboxAddress: fixture.mailbox, fromAddress: "automation@contact.example.test", messageId: `<automation-${suffix}@events.example.test>`, text: "Create lead" });
  await simulator.deliver({ raw, mailboxAddress: fixture.mailbox });
  await simulator.deliver({ raw, mailboxAddress: fixture.mailbox });
  assert.equal(await prisma.automacaoExecucao.count({ where: { empresaId: fixture.tenant.id, leadId: { not: null } } }), 1);
  assert.equal(await prisma.automacaoAcaoJob.count({ where: { empresaId: fixture.tenant.id } }), 1);
});

test("duas threads raiz concorrentes convergem para um lead no PostgreSQL", { skip: !postgres }, async () => {
  const fixture = await seedActiveMailbox("email-root-concurrency");
  const sender = "root-concurrency@contact.example.test";
  const client = await prisma.cliente.create({ data: { empresaId: fixture.tenant.id, nome: "Concurrent sender", telefone: "", email: sender, empresa: "", interesse: "", origem: "E-mail" } });
  await prisma.contatoCanal.create({ data: { empresaId: fixture.tenant.id, canalIntegracaoId: fixture.channel.id, clienteId: client.id, externalId: sender, telefoneNormalizado: null, nome: "Concurrent sender" } });
  const clients = [new PrismaClient(), new PrismaClient()];
  try {
    const results = await Promise.all(clients.map((db, index) => simulatorFor(fixture.env, db).deliver({ mailboxAddress: fixture.mailbox, fromAddress: sender, messageId: `<root-concurrent-${index}-${suffix}@events.example.test>`, subject: `Root ${index}`, text: `Concurrent root ${index}` })));
    assert.equal(results.every((item) => item.state === "PROCESSED"), true);
  } finally {
    await Promise.all(clients.map((db) => db.$disconnect()));
  }
  const counts = await commercialCounts(fixture.tenant.id);
  assert.equal(counts.leads, 1);
  assert.equal(counts.conversations, 2);
  assert.equal(counts.messages, 2);
});

test("envelope confiavel aceita BCC e usa fallback normalizado sem Message-ID", async () => {
  const fixture = await seedActiveMailbox("email-envelope");
  const raw = buildRawEmailFixture({
    mailboxAddress: "visible-recipient@other.example.test",
    fromAddress: "bcc-sender@contact.example.test",
    messageId: `<removed-${suffix}@events.example.test>`,
    text: "Mensagem entregue por BCC",
  });
  const withoutMessageId = Buffer.from(raw.toString("utf8").replace(/^Message-ID:.*\r\n/m, ""), "utf8");
  const accepted = await simulatorFor(fixture.env).deliver({
    raw: withoutMessageId,
    mailboxAddress: fixture.mailbox,
    providerMessageId: `provider-${suffix}`,
  });
  assert.equal(accepted.state, "PROCESSED");
  assert.equal((await commercialCounts(fixture.tenant.id)).messages, 1);
  const fallbackA = await normalizeInboundMessage({ raw: withoutMessageId, mailboxAddress: fixture.mailbox, providerType: "GENERIC", receivedAt: "2026-07-31T12:00:00.000Z" });
  const fallbackB = await normalizeInboundMessage({ raw: withoutMessageId, mailboxAddress: fixture.mailbox, providerType: "GENERIC", receivedAt: "2026-07-31T12:05:00.000Z" });
  const changedBody = Buffer.from(withoutMessageId.toString("utf8").replace("Mensagem entregue por BCC", "Outra mensagem entregue por BCC"), "utf8");
  const fallbackChanged = await normalizeInboundMessage({ raw: changedBody, mailboxAddress: fixture.mailbox, providerType: "GENERIC" });
  assert.equal(fallbackA.externalEventId, fallbackB.externalEventId);
  assert.notEqual(fallbackA.externalEventId, fallbackChanged.externalEventId);
});

test("auto-reply bounce e anexo sem texto sao terminais sem escrita comercial", async () => {
  const fixture = await seedActiveMailbox("email-terminal");
  const simulator = simulatorFor(fixture.env);
  await simulator.deliver({ mailboxAddress: fixture.mailbox, messageId: `<auto-${suffix}@events.example.test>`, autoSubmitted: "auto-replied", text: "Automatic reply" });
  await simulator.deliver({ mailboxAddress: fixture.mailbox, messageId: `<bounce-${suffix}@events.example.test>`, bounce: true, text: "Delivery failed" });
  await simulator.deliver({ mailboxAddress: fixture.mailbox, messageId: `<attachment-${suffix}@events.example.test>`, text: "", attachment: { filename: "only.bin", content: "x", contentType: "application/octet-stream" } });
  const counts = await commercialCounts(fixture.tenant.id);
  assert.deepEqual(counts, { events: 3, contacts: 0, clients: 0, leads: 0, conversations: 0, messages: 0, metadata: 0 });
  const events = await prisma.eventoWebhook.findMany({ where: { empresaId: fixture.tenant.id }, orderBy: { tipoEvento: "asc" } });
  assert.equal(events.every((event) => event.statusProcessamento === "PROCESSADO"), true);
  const channel = await prisma.canalIntegracao.findUnique({ where: { id: fixture.channel.id } });
  assert.ok(channel.lastWebhookAt);
  assert.equal(channel.verifiedAt, null);
  assert.equal(channel.connectedAt, null);
});

test("concorrencia e isolamento multi-tenant produzem uma cadeia por canal", async () => {
  const firstTenant = await seedActiveMailbox("email-concurrency-a");
  const secondTenant = await seedActiveMailbox("email-concurrency-b");
  const sharedSender = "shared@contact.example.test";
  const firstRaw = buildRawEmailFixture({ mailboxAddress: firstTenant.mailbox, fromAddress: sharedSender, messageId: `<concurrent-${suffix}@events.example.test>`, text: "Concurrent delivery" });
  const concurrentClients = postgres ? [new PrismaClient(), new PrismaClient()] : [prisma, prisma];
  let results;
  try {
    results = await Promise.all(concurrentClients.map((client) => simulatorFor(firstTenant.env, client).deliver({ raw: firstRaw, mailboxAddress: firstTenant.mailbox })));
  } finally {
    if (postgres) await Promise.all(concurrentClients.map((client) => client.$disconnect()));
  }
  assert.equal(results.filter((item) => item.idempotent === false).length, 1);
  assert.equal(results.filter((item) => item.idempotent === true).length, 1);
  await simulatorFor(secondTenant.env).deliver({ mailboxAddress: secondTenant.mailbox, fromAddress: sharedSender, messageId: `<tenant-b-${suffix}@events.example.test>`, text: "Tenant B delivery" });
  assert.deepEqual(await commercialCounts(firstTenant.tenant.id), { events: 1, contacts: 1, clients: 1, leads: 1, conversations: 1, messages: 1, metadata: 1 });
  assert.deepEqual(await commercialCounts(secondTenant.tenant.id), { events: 1, contacts: 1, clients: 1, leads: 1, conversations: 1, messages: 1, metadata: 1 });
  const contacts = await prisma.contatoCanal.findMany({ where: { externalId: sharedSender }, orderBy: { empresaId: "asc" } });
  assert.equal(contacts.length, 2);
  assert.notEqual(contacts[0].empresaId, contacts[1].empresaId);
  assert.notEqual(contacts[0].canalIntegracaoId, contacts[1].canalIntegracaoId);

  const mismatchedTenant = await seedActiveMailbox("email-corrupt-route");
  const inconsistentAddress = `mismatch-${suffix}@tenant.example.test`;
  await assert.rejects(
    prisma.emailMailboxAddress.create({ data: { empresaId: mismatchedTenant.tenant.id, canalIntegracaoId: firstTenant.channel.id, addressNormalized: inconsistentAddress, kind: "ALIAS" } }),
    (error) => error.code === "P2003",
  );
  assert.equal((await commercialCounts(mismatchedTenant.tenant.id)).events, 0);
});

test("gates e limites falham fechado e timeout transacional vira falha sanitizada", async () => {
  const fixture = await seedActiveMailbox("email-fail-closed");
  const disabledEnv = { ...fixture.env, EMAIL_INBOUND_ENABLED: "false" };
  const disabled = createEmailInboundProcessor({ prisma, env: disabledEnv });
  await assert.rejects(disabled.ingestRawEmail({ raw: buildRawEmailFixture({ mailboxAddress: fixture.mailbox }), mailboxAddress: fixture.mailbox, providerType: "GENERIC" }), (error) => error.code === "EMAIL_INBOUND_DISABLED");
  assert.equal((await commercialCounts(fixture.tenant.id)).events, 0);

  await assert.rejects(normalizeInboundMessage({ raw: Buffer.alloc(EMAIL_LIMITS.rawBytes + 1, 65), mailboxAddress: fixture.mailbox, providerType: "GENERIC" }), (error) => error.code === "EMAIL_BODY_LIMIT_EXCEEDED");
  assert.equal(normalizeEmailAddress("User@EXAMPLE.COM"), "User@example.com");
  assert.throws(() => normalizeEmailAddress("user@example.com:25"), (error) => error.code === "EMAIL_ADDRESS_INVALID");
  assert.throws(() => normalizeEmailAddress("user@example.com/path"), (error) => error.code === "EMAIL_ADDRESS_INVALID");
  const validRaw = buildRawEmailFixture({ mailboxAddress: fixture.mailbox, messageId: `<headers-${suffix}@events.example.test>` });
  const duplicateFrom = Buffer.from(validRaw.toString("utf8").replace("From:", "From: duplicate@contact.example.test\r\nFrom:"), "utf8");
  await assert.rejects(normalizeInboundMessage({ raw: duplicateFrom, mailboxAddress: fixture.mailbox, providerType: "GENERIC" }), (error) => error.code === "EMAIL_HEADER_AMBIGUOUS");
  const duplicateContentType = Buffer.from(validRaw.toString("utf8").replace("Content-Type:", "Content-Type: text/plain\r\nContent-Type:"), "utf8");
  await assert.rejects(normalizeInboundMessage({ raw: duplicateContentType, mailboxAddress: fixture.mailbox, providerType: "GENERIC" }), (error) => error.code === "EMAIL_HEADER_AMBIGUOUS");
  const duplicateTransferEncoding = Buffer.from(validRaw.toString("utf8").replace("Content-Transfer-Encoding:", "Content-Transfer-Encoding: 7bit\r\nContent-Transfer-Encoding:"), "utf8");
  await assert.rejects(normalizeInboundMessage({ raw: duplicateTransferEncoding, mailboxAddress: fixture.mailbox, providerType: "GENERIC" }), (error) => error.code === "EMAIL_HEADER_AMBIGUOUS");
  const deepMime = Buffer.from(`From: sender@contact.example.test\r\nTo: ${fixture.mailbox}\r\nMessage-ID: <deep-${suffix}@events.example.test>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="b0"\r\n\r\n${Array.from({ length: EMAIL_LIMITS.multipartContainers + 1 }, (_, index) => `--b${index}\r\nContent-Type: multipart/mixed; boundary="b${index + 1}"\r\n`).join("")}--b${EMAIL_LIMITS.multipartContainers + 1}--\r\n`, "utf8");
  await assert.rejects(normalizeInboundMessage({ raw: deepMime, mailboxAddress: fixture.mailbox, providerType: "GENERIC" }), (error) => error.code === "EMAIL_MIME_STRUCTURE_LIMIT_EXCEEDED");
  await assert.rejects(simulatorFor(fixture.env).deliver({ mailboxAddress: "not-reserved@example.com" }), (error) => error.code === "EMAIL_SIMULATOR_IDENTITY_INVALID");
  assert.throws(() => createEmailTestSimulator({ processor: createEmailInboundProcessor({ prisma, env: fixture.env }), env: { ...fixture.env, NODE_ENV: "production" } }), (error) => error.code === "EMAIL_SIMULATOR_UNAVAILABLE");
  assert.equal((await commercialCounts(fixture.tenant.id)).events, 0);

  let transactionCall = 0;
  const transactionOptions = [];
  const timeoutClient = new Proxy(prisma, {
    get(target, property) {
      if (property === "$transaction") {
        return (...args) => {
          transactionCall += 1;
          transactionOptions.push(args[1]);
          if (transactionCall === 2) {
            const timeout = new Error("synthetic private transaction detail");
            timeout.code = "P2028";
            return Promise.reject(timeout);
          }
          return target.$transaction(...args);
        };
      }
      const value = target[property];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const failureProcessor = createEmailInboundProcessor({ prisma: timeoutClient, env: fixture.env });
  await assert.rejects(
    failureProcessor.ingestRawEmail({
      raw: buildRawEmailFixture({ mailboxAddress: fixture.mailbox, messageId: `<failure-${suffix}@events.example.test>` }),
      mailboxAddress: fixture.mailbox,
      providerType: "GENERIC",
    }),
    (error) => error.code === "EMAIL_PROCESSING_FAILED" && !error.message.includes("private"),
  );
  const failedEvent = await prisma.eventoWebhook.findFirstOrThrow({
    where: { empresaId: fixture.tenant.id, provedor: "EMAIL", statusProcessamento: "FALHOU" },
  });
  const failedChannel = await prisma.canalIntegracao.findUniqueOrThrow({ where: { id: fixture.channel.id } });
  assert.equal(failedEvent.statusProcessamento, "FALHOU");
  assert.equal(failedEvent.erroCodigo, "P2028");
  assert.equal(failedEvent.erroResumo, "Falha sanitizada no processamento de E-mail.");
  assert.equal(failedChannel.lastFailureCode, "P2028");
  assert.ok(failedChannel.lastFailureAt);
  assert.equal(transactionCall, 3);
  assert.deepEqual(transactionOptions, [
    { maxWait: 5000, timeout: 15000 },
    { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 },
    { maxWait: 5000, timeout: 15000 },
  ]);

  let failedRecordCall = 0;
  const failedRecordClient = new Proxy(prisma, {
    get(target, property) {
      if (property === "$transaction") {
        return (...args) => {
          failedRecordCall += 1;
          if (failedRecordCall === 2) {
            const processingTimeout = new Error("processing private detail");
            processingTimeout.code = "P2028";
            return Promise.reject(processingTimeout);
          }
          if (failedRecordCall === 3) {
            const recordTimeout = new Error("record private detail");
            recordTimeout.code = "P2028";
            return Promise.reject(recordTimeout);
          }
          return target.$transaction(...args);
        };
      }
      const value = target[property];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const unavailableFailureProcessor = createEmailInboundProcessor({
    prisma: failedRecordClient,
    env: fixture.env,
    logger: { error() { throw new Error("logger private detail"); } },
  });
  await assert.rejects(
    unavailableFailureProcessor.ingestRawEmail({
      raw: buildRawEmailFixture({ mailboxAddress: fixture.mailbox, messageId: `<record-failure-${suffix}@events.example.test>` }),
      mailboxAddress: fixture.mailbox,
      providerType: "GENERIC",
    }),
    (error) => error.code === "EMAIL_FAILURE_RECORD_UNAVAILABLE"
      && !error.message.includes("private")
      && !error.message.includes("P2028"),
  );
  assert.equal(failedRecordCall, 3);
});

function simulatorFor(env, client = prisma) {
  return createEmailTestSimulator({ processor: createEmailInboundProcessor({ prisma: client, env }), env });
}

async function seedActiveMailbox(label) {
  const tenant = await prisma.empresa.create({ data: { nome: label, slug: `${label}-${suffix}` } });
  tenantIds.push(tenant.id);
  const mailbox = `${label}@tenant.example.test`;
  const channel = await prisma.canalIntegracao.create({ data: {
    empresaId: tenant.id,
    tipo: "EMAIL",
    nome: "Synthetic e-mail inbox",
    chaveInterna: "email-inbound-real",
    publicId: `email-${label}-${suffix}`,
    status: "ATIVO",
    modoTeste: false,
    ativo: true,
    providerEnvironment: "EMAIL_SYNTHETIC_TEST",
    emailProviderType: "GENERIC",
  } });
  await prisma.emailMailboxAddress.create({ data: { empresaId: tenant.id, canalIntegracaoId: channel.id, addressNormalized: mailbox, kind: "PRIMARY", primarySlot: `email-primary:${channel.id}` } });
  await prisma.empresaFuncionalidade.createMany({ data: [
    { empresaId: tenant.id, chave: "EMAIL_INTEGRATION", habilitada: true, habilitadoEm: new Date() },
    { empresaId: tenant.id, chave: "EMAIL_INBOUND", habilitada: true, habilitadoEm: new Date() },
  ] });
  return { tenant, channel, mailbox, env: {
    NODE_ENV: "test",
    EMAIL_SYNTHETIC_SIMULATOR_ENABLED: "true",
    EMAIL_PROVIDER_TYPE: "GENERIC",
    EMAIL_PROVIDER_ENVIRONMENT: "EMAIL_SYNTHETIC_TEST",
    EMAIL_INTEGRATION_ENABLED: "true",
    EMAIL_INBOUND_ENABLED: "true",
  } };
}

async function commercialCounts(empresaId) {
  const [events, contacts, clients, leads, conversations, messages, metadata] = await Promise.all([
    prisma.eventoWebhook.count({ where: { empresaId, provedor: "EMAIL" } }),
    prisma.contatoCanal.count({ where: { empresaId } }),
    prisma.cliente.count({ where: { empresaId } }),
    prisma.lead.count({ where: { empresaId } }),
    prisma.conversaCanal.count({ where: { empresaId } }),
    prisma.mensagemCanal.count({ where: { empresaId } }),
    prisma.emailMessageMetadata.count({ where: { empresaId } }),
  ]);
  return { events, contacts, clients, leads, conversations, messages, metadata };
}

async function cleanupTenants(ids) {
  const where = { empresaId: { in: ids } };
  await prisma.automacaoEventoInterno.deleteMany({ where });
  await prisma.automacaoAcaoJob.deleteMany({ where });
  await prisma.automacaoExecucao.deleteMany({ where });
  await prisma.automacaoRegra.deleteMany({ where });
  await prisma.emailMessageMetadata.deleteMany({ where });
  await prisma.mensagemCanal.deleteMany({ where });
  await prisma.eventoWebhook.deleteMany({ where });
  await prisma.historicoAtribuicao.deleteMany({ where });
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
