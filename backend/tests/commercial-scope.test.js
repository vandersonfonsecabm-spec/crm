const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

if (!process.env.CRM_TEST_DATABASE_URL) {
  throw new Error("commercial-scope.test.js exige a sandbox oficial do Prisma.");
}

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "commercial-scope-test-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOW_COMPANY_REGISTRATION = "true";
process.env.INTEGRATION_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.DATABASE_URL = process.env.CRM_TEST_DATABASE_URL;

let api;
let prisma;
let server;
let baseUrl;

before(async () => {
  api = require("../src/server");
  prisma = api.prisma;
  await new Promise((resolve) => {
    server = api.app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("nucleo comercial isola clientes, notas, acompanhamentos e funil por empresa", async () => {
  const beforeCounts = await coreCounts();
  const beforeChannelCounts = await channelCounts();

  const companyA = await registerCompany("Empresa Comercial A", "admin-a@comercial.test");
  const companyB = await registerCompany("Empresa Comercial B", "admin-b@comercial.test");
  const tokenA = companyA.token;
  const tokenB = companyB.token;

  const manager = await request("POST", "/usuarios", {
    nome: "Gerente Comercial A",
    email: "gerente-a@comercial.test",
    senha: "SenhaGerente123",
    papel: "GERENTE",
  }, tokenA);
  assert.equal(manager.status, 201);
  const seller = await request("POST", "/usuarios", {
    nome: "Vendedor Comercial A",
    email: "vendedor-a@comercial.test",
    senha: "SenhaVendedor123",
    papel: "VENDEDOR",
  }, tokenA);
  assert.equal(seller.status, 201);

  const managerLogin = await login("gerente-a@comercial.test", "SenhaGerente123");
  const sellerLogin = await login("vendedor-a@comercial.test", "SenhaVendedor123");

  const clientA = await createClient(tokenA, "Cliente Empresa A", "Novo", 1500);
  const clientB = await createClient(tokenB, "Cliente Empresa B", "Proposta", 7000);
  assert.equal(clientA.body.empresaId, companyA.empresa.id);
  assert.equal(clientB.body.empresaId, companyB.empresa.id);

  const invalidClient = await request("POST", "/clientes", {
    nome: "   ",
    telefone: "123",
    email: "email-invalido",
    valor: -1,
  }, tokenA);
  assert.equal(invalidClient.status, 400);
  assert.equal(invalidClient.body.codigo, "CLIENT_VALIDATION_ERROR");
  assert.deepEqual(Object.keys(invalidClient.body.campos).sort(), ["email", "nome", "telefone", "valor"]);

  const ambiguousPayloads = [
    { favorito: "true" },
    { favorito: 1 },
    { quente: "false" },
    { quente: 0 },
    { tags: "[\"tag\"]" },
    { tags: { nome: "tag" } },
  ];
  for (const ambiguous of ambiguousPayloads) {
    const rejected = await request("POST", "/clientes", {
      nome: "Cliente payload ambiguo",
      ...ambiguous,
    }, tokenA);
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.codigo, "CLIENT_VALIDATION_ERROR");
  }

  const clientWithTenant = await request("POST", "/clientes", {
    empresaId: companyB.empresa.id,
    nome: "Cliente Tenant Indevido",
  }, tokenA);
  assert.equal(clientWithTenant.status, 400);

  const clientQueryTenant = await request("GET", "/clientes?empresaId=999", undefined, tokenA);
  assert.equal(clientQueryTenant.status, 400);

  const listA = await request("GET", "/clientes", undefined, tokenA);
  assert.equal(listA.status, 200);
  assert.ok(listA.body.data.some((cliente) => cliente.id === clientA.body.id));
  assert.equal(listA.body.data.some((cliente) => cliente.id === clientB.body.id), false);
  assert.equal(listA.body.pagination.total, 1);

  const listB = await request("GET", "/clientes", undefined, tokenB);
  assert.equal(listB.body.data.some((cliente) => cliente.id === clientB.body.id), true);
  assert.equal(listB.body.data.some((cliente) => cliente.id === clientA.body.id), false);
  assert.equal(listB.body.pagination.total, 1);

  const readCrossClient = await request("GET", `/clientes/${clientB.body.id}/notas`, undefined, tokenA);
  assert.equal(readCrossClient.status, 404);

  const patchCrossClient = await request("PATCH", `/clientes/${clientB.body.id}`, { status: "Fechado" }, tokenA);
  assert.equal(patchCrossClient.status, 404);
  const preservedClientB = await prisma.cliente.findUnique({ where: { id: clientB.body.id } });
  assert.equal(preservedClientB.status, "Proposta");

  const deleteCrossClient = await request("DELETE", `/clientes/${clientB.body.id}`, undefined, tokenA);
  assert.equal(deleteCrossClient.status, 404);
  assert.equal(await prisma.cliente.count({ where: { id: clientB.body.id } }), 1);

  const updatedClientA = await request("PATCH", `/clientes/${clientA.body.id}`, { status: "Contato", quente: true }, tokenA);
  assert.equal(updatedClientA.status, 200);
  assert.equal(updatedClientA.body.status, "Contato");
  assert.equal(updatedClientA.body.nome, clientA.body.nome);
  assert.equal(updatedClientA.body.telefone, clientA.body.telefone);
  assert.equal(updatedClientA.body.email, clientA.body.email);

  const missingArchiveRevision = await request("POST", `/clientes/${clientA.body.id}/arquivar`, {}, tokenA);
  assert.equal(missingArchiveRevision.status, 422);
  const sellerArchive = await request("POST", `/clientes/${clientA.body.id}/arquivar`, { revisao: updatedClientA.body.revisao }, sellerLogin.body.access_token);
  assert.equal(sellerArchive.status, 403);

  const invalidPatch = await request("PATCH", `/clientes/${clientA.body.id}`, { email: "invalido" }, tokenA);
  assert.equal(invalidPatch.status, 400);
  assert.equal(invalidPatch.body.codigo, "CLIENT_VALIDATION_ERROR");
  const clientAfterInvalidPatch = await prisma.cliente.findUnique({ where: { id: clientA.body.id } });
  assert.equal(clientAfterInvalidPatch.email, clientA.body.email);
  const tagsBeforeInvalidPatch = clientAfterInvalidPatch.tags;
  const ambiguousPatch = await request("PATCH", `/clientes/${clientA.body.id}`, {
    favorito: "false",
    tags: { apagar: true },
  }, tokenA);
  assert.equal(ambiguousPatch.status, 400);
  const clientAfterAmbiguousPatch = await prisma.cliente.findUnique({ where: { id: clientA.body.id } });
  assert.equal(clientAfterAmbiguousPatch.favorito, clientAfterInvalidPatch.favorito);
  assert.equal(clientAfterAmbiguousPatch.tags, tagsBeforeInvalidPatch);

  const noteA = await request("POST", `/clientes/${clientA.body.id}/notas`, {
    texto: "Nota isolada da empresa A",
    tipo: "nota",
  }, tokenA);
  assert.equal(noteA.status, 200);
  assert.equal(noteA.body.empresaId, companyA.empresa.id);

  const noteTenant = await request("POST", `/clientes/${clientA.body.id}/notas`, {
    empresaId: companyB.empresa.id,
    texto: "Nota com tenant externo",
  }, tokenA);
  assert.equal(noteTenant.status, 400);

  const crossNoteCreate = await request("POST", `/clientes/${clientB.body.id}/notas`, {
    texto: "Nota cruzada indevida",
  }, tokenA);
  assert.equal(crossNoteCreate.status, 404);

  const noteB = await request("POST", `/clientes/${clientB.body.id}/notas`, {
    texto: "Nota isolada da empresa B",
    tipo: "nota",
  }, tokenB);
  assert.equal(noteB.status, 200);
  const notesA = await request("GET", `/clientes/${clientA.body.id}/notas`, undefined, tokenA);
  assert.equal(notesA.status, 200);
  assert.ok(notesA.body.some((nota) => nota.id === noteA.body.id));
  assert.equal(notesA.body.some((nota) => nota.id === noteB.body.id), false);

  const crossNoteDelete = await request("DELETE", `/clientes/${clientB.body.id}/notas/${noteB.body.id}`, undefined, tokenA);
  assert.equal(crossNoteDelete.status, 404);
  assert.equal(await prisma.nota.count({ where: { id: noteB.body.id } }), 1);

  const scheduleA = await createSchedule(tokenA, clientA.body.id, "Agenda empresa A");
  assert.equal(scheduleA.status, 201);
  assert.equal(scheduleA.body.clienteId, clientA.body.id);
  const storedScheduleA = await prisma.acompanhamento.findUnique({ where: { id: scheduleA.body.id } });
  assert.equal(storedScheduleA.empresaId, companyA.empresa.id);

  const scheduleTenant = await request("POST", "/acompanhamentos", {
    empresaId: companyB.empresa.id,
    clienteId: clientA.body.id,
    titulo: "Agenda com tenant externo",
    dataHora: futureDate(),
  }, tokenA);
  assert.equal(scheduleTenant.status, 400);

  const crossScheduleCreate = await createSchedule(tokenA, clientB.body.id, "Agenda cruzada");
  assert.equal(crossScheduleCreate.status, 404);

  const scheduleB = await createSchedule(tokenB, clientB.body.id, "Agenda empresa B");
  assert.equal(scheduleB.status, 201);
  const schedulesA = await request("GET", "/acompanhamentos", undefined, tokenA);
  assert.equal(schedulesA.status, 200);
  assert.ok(schedulesA.body.data.some((item) => item.id === scheduleA.body.id));
  assert.equal(schedulesA.body.data.some((item) => item.id === scheduleB.body.id), false);

  const crossSchedulePatch = await request("PATCH", `/acompanhamentos/${scheduleB.body.id}`, {
    titulo: "Alteracao cruzada",
  }, tokenA);
  assert.equal(crossSchedulePatch.status, 404);

  const originalScheduleA = await prisma.acompanhamento.findUnique({ where: { id: scheduleA.body.id } });
  const rescheduledDate = new Date(originalScheduleA.dataHora.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const partialSchedulePatch = await request("PATCH", `/acompanhamentos/${scheduleA.body.id}`, {
    dataHora: rescheduledDate,
  }, tokenA);
  assert.equal(partialSchedulePatch.status, 200);
  assert.equal(partialSchedulePatch.body.titulo, originalScheduleA.titulo);
  assert.equal(partialSchedulePatch.body.clienteId, originalScheduleA.clienteId);
  assert.equal(partialSchedulePatch.body.dataHora, rescheduledDate);
  const storedAfterPartialPatch = await prisma.acompanhamento.findUnique({ where: { id: scheduleA.body.id } });
  assert.equal(storedAfterPartialPatch.empresaId, originalScheduleA.empresaId);
  assert.equal(storedAfterPartialPatch.titulo, originalScheduleA.titulo);
  assert.equal(storedAfterPartialPatch.clienteId, originalScheduleA.clienteId);
  assert.equal(storedAfterPartialPatch.dataHora.toISOString(), rescheduledDate);

  const invalidScheduleDate = await request("PATCH", `/acompanhamentos/${scheduleA.body.id}`, {
    dataHora: "data-invalida",
  }, tokenA);
  assert.equal(invalidScheduleDate.status, 422);
  for (const invalidDate of [
    "2026-02-30T10:00:00Z",
    "2025-02-29T10:00:00Z",
    "2026-04-31T10:00:00Z",
    "2026-13-01T10:00:00Z",
    "2026-00-01T10:00:00Z",
    "2026-01-00T10:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T10:60:00Z",
    "2026-01-01T10:00:60Z",
    "2026-01-01",
    "2026-01-01T10:00:00Zextra",
  ]) {
    const rejectedDate = await request("PATCH", `/acompanhamentos/${scheduleA.body.id}`, {
      dataHora: invalidDate,
    }, tokenA);
    assert.equal(rejectedDate.status, 422, invalidDate);
  }
  const validLeapDate = await request("PATCH", `/acompanhamentos/${scheduleA.body.id}`, {
    dataHora: "2024-02-29T10:00:00-03:00",
  }, tokenA);
  assert.equal(validLeapDate.status, 200);
  assert.equal(validLeapDate.body.dataHora, "2024-02-29T13:00:00.000Z");
  const invalidScheduleStatus = await request("PATCH", `/acompanhamentos/${scheduleA.body.id}`, {
    status: "INVALIDO",
  }, tokenA);
  assert.equal(invalidScheduleStatus.status, 422);

  const completedSchedule = await request("POST", `/acompanhamentos/${scheduleA.body.id}/concluir`, {}, tokenA);
  assert.equal(completedSchedule.status, 200);
  assert.equal(completedSchedule.body.status, "CONCLUIDO");
  assert.ok(completedSchedule.body.concluidoEm);
  const repeatedCompletion = await request("POST", `/acompanhamentos/${scheduleA.body.id}/concluir`, {}, tokenA);
  assert.equal(repeatedCompletion.status, 200);

  const reopenedSchedule = await request("POST", `/acompanhamentos/${scheduleA.body.id}/reabrir`, {}, tokenA);
  assert.equal(reopenedSchedule.status, 200);
  assert.equal(reopenedSchedule.body.status, "PENDENTE");
  assert.equal(reopenedSchedule.body.concluidoEm, null);

  const cancelledSchedule = await request("POST", `/acompanhamentos/${scheduleA.body.id}/cancelar`, {}, tokenA);
  assert.equal(cancelledSchedule.status, 200);
  assert.equal(cancelledSchedule.body.status, "CANCELADO");
  assert.equal(cancelledSchedule.body.clienteId, originalScheduleA.clienteId);

  const missingSchedule = await request("PATCH", "/acompanhamentos/2147483647", {
    titulo: "Agenda inexistente",
  }, tokenA);
  assert.equal(missingSchedule.status, 404);

  const agendaSummaryA = await request("GET", "/acompanhamentos/resumo", undefined, tokenA);
  assert.equal(agendaSummaryA.status, 200);
  assert.ok(Number.isInteger(agendaSummaryA.body.indicadores.total));
  assert.ok(agendaSummaryA.body.proximos.every((item) => item.clienteId !== clientB.body.id));
  const invalidSummaryPeriod = await request(
    "GET",
    "/acompanhamentos/resumo?dataInicial=2026-02-30T00%3A00%3A00Z",
    undefined,
    tokenA,
  );
  assert.equal(invalidSummaryPeriod.status, 422);

  const dashboardA = await request("GET", "/dashboard", undefined, tokenA);
  const dashboardB = await request("GET", "/dashboard", undefined, tokenB);
  assert.equal(dashboardA.status, 200);
  assert.equal(dashboardB.status, 200);
  assert.equal(dashboardA.body.indicadores.clientes, 1);
  assert.equal(dashboardB.body.indicadores.clientes, 1);
  assert.equal(dashboardA.body.pedidosRecentes.some((cliente) => cliente.id === clientB.body.id), false);
  assert.equal(dashboardB.body.pedidosRecentes.some((cliente) => cliente.id === clientA.body.id), false);

  const funnelA = await request("GET", "/clientes", undefined, tokenA);
  assert.equal(funnelA.status, 200);
  assert.ok(funnelA.body.data.some((cliente) => cliente.id === clientA.body.id && cliente.status === "Contato"));
  assert.equal(funnelA.body.data.some((cliente) => cliente.id === clientB.body.id), false);

  const managerClient = await createClient(managerLogin.body.access_token, "Cliente Gerente A", "Novo", 500);
  assert.equal(managerClient.status, 200);
  assert.equal(managerClient.body.empresaId, companyA.empresa.id);
  const sellerList = await request("GET", "/clientes", undefined, sellerLogin.body.access_token);
  assert.equal(sellerList.status, 200);


  const noteRelation = await prisma.nota.findUnique({
    where: { id: noteA.body.id },
    include: { cliente: true },
  });
  assert.equal(noteRelation.empresaId, noteRelation.cliente.empresaId);
  const scheduleRelation = await prisma.acompanhamento.findUnique({
    where: { id: scheduleA.body.id },
    include: { cliente: true },
  });
  assert.equal(scheduleRelation.empresaId, scheduleRelation.cliente.empresaId);

  assert.deepEqual(await channelCounts(), beforeChannelCounts);
  assert.equal((await coreCounts()).cliente, beforeCounts.cliente + 3);
});

test("clientes usam paginação global, detalhe sob demanda e exclusão protegida", async () => {
  const company = await registerCompany("Empresa Escala Audit", "admin-escala@comercial.test");
  const empresaId = company.empresa.id;
  const token = company.token;
  const clients = Array.from({ length: 150 }, (_, index) => ({
    empresaId,
    nome: `Cliente Escala ${String(index + 1).padStart(3, "0")}`,
    telefone: `1198${String(index).padStart(7, "0")}`,
    email: `escala-${index + 1}@example.test`,
    empresa: "Carteira representativa",
    interesse: index === 149 ? "Busca global exclusiva" : "Escala",
    status: index % 5 === 0 ? "Proposta" : "Novo",
    valor: index * 100,
    origem: "Teste",
    favorito: index % 3 === 0,
    quente: index % 7 === 0,
    ultimoContato: index % 14,
    proximoFollowUp: index % 11 === 0 ? "Hoje" : "Depois",
    tags: JSON.stringify(index === 149 ? ["alvo-global"] : ["escala"]),
  }));
  await prisma.cliente.createMany({ data: clients });
  const stored = await prisma.cliente.findMany({
    where: { empresaId },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  await prisma.nota.createMany({
    data: stored.slice(0, 20).flatMap((client, clientIndex) =>
      Array.from({ length: 5 }, (_, noteIndex) => ({
        empresaId,
        clienteId: client.id,
        texto: `Nota representativa ${clientIndex}-${noteIndex} com conteúdo suficiente para medir o payload legado.`,
        tipo: "nota",
      })),
    ),
  });

  const page = await request("GET", "/clientes?page=1&limit=20", undefined, token);
  const dashboard = await request("GET", "/dashboard", undefined, token);
  assert.equal(page.status, 200);
  assert.equal(page.body.data.length, 20);
  assert.equal(page.body.pagination.total, 150);
  assert.equal(page.body.pagination.totalPages, 8);
  assert.ok(page.body.data.every((client) => !Object.prototype.hasOwnProperty.call(client, "notas")));
  assert.equal(dashboard.body.indicadores.clientes, 150);
  assert.equal(dashboard.body.atividadesRecentes.length, 5);

  const globalSearch = await request("GET", "/clientes?search=alvo-global&limit=10", undefined, token);
  assert.equal(globalSearch.status, 200);
  assert.equal(globalSearch.body.pagination.total, 1);
  assert.equal(globalSearch.body.data[0].nome, "Cliente Escala 150");

  const proposalFilter = await request("GET", "/clientes?status=Proposta&limit=10", undefined, token);
  assert.equal(proposalFilter.status, 200);
  assert.equal(proposalFilter.body.pagination.total, 30);
  assert.ok(proposalFilter.body.data.every((client) => client.status === "Proposta"));

  const detail = await request("GET", `/clientes/${stored[0].id}`, undefined, token);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.notas.length, 5);

  const legacyPayload = await prisma.cliente.findMany({
    where: { empresaId },
    include: { notas: true },
  });
  const legacyBytes = Buffer.byteLength(JSON.stringify(legacyPayload));
  const optimizedBytes = Buffer.byteLength(JSON.stringify(page.body)) + Buffer.byteLength(JSON.stringify(dashboard.body));
  assert.ok(optimizedBytes < legacyBytes / 2, { legacyBytes, optimizedBytes });
  console.log(`[audit-dashboard] calls_before=2 calls_after=2 legacy_bytes=${legacyBytes} optimized_bytes=${optimizedBytes} legacy_records=150 page_records=20`);

  const freeClient = await createClient(token, "Cliente Excluivel", "Novo", 10);
  const bypassCreate = await createClient(token, "Cliente status arquivado", "Arquivado", 11);
  assert.ok([400, 422].includes(bypassCreate.status));
  const bypassPatch = await request("PATCH", `/clientes/${freeClient.body.id}`, { status: "Arquivado" }, token);
  assert.ok([400, 422].includes(bypassPatch.status));
  const archivedFreeClient = await request("POST", `/clientes/${freeClient.body.id}/arquivar`, { revisao: freeClient.body.revisao }, token);
  assert.equal(archivedFreeClient.status, 200);
  assert.equal(archivedFreeClient.body.status, "Arquivado");
  assert.ok(archivedFreeClient.body.arquivadoEm);
  const archivedList = await request("GET", "/clientes?arquivado=true&limit=20", undefined, token);
  assert.equal(archivedList.status, 200);
  assert.ok(archivedList.body.data.some((client) => client.id === freeClient.body.id));
  const restoredFreeClient = await request("POST", `/clientes/${freeClient.body.id}/restaurar`, { revisao: archivedFreeClient.body.revisao }, token);
  assert.equal(restoredFreeClient.status, 200);
  assert.equal(restoredFreeClient.body.status, "Novo");
  assert.equal(restoredFreeClient.body.arquivadoEm, null);
  const archivedAgain = await request("POST", `/clientes/${freeClient.body.id}/arquivar`, { revisao: restoredFreeClient.body.revisao }, token);
  assert.equal(archivedAgain.status, 200);
  assert.equal((await request("DELETE", `/clientes/${freeClient.body.id}`, { revisao: archivedAgain.body.revisao }, token)).status, 200);
  assert.equal(await prisma.cliente.count({ where: { id: freeClient.body.id } }), 0);

  const noteOnlyClient = await createClient(token, "Cliente com historico de nota", "Novo", 12);
  await prisma.nota.create({ data: { empresaId, clienteId: noteOnlyClient.body.id, texto: "Historico que deve permanecer preservado.", tipo: "nota" } });
  const archivedNoteOnly = await request("POST", `/clientes/${noteOnlyClient.body.id}/arquivar`, { revisao: noteOnlyClient.body.revisao }, token);
  assert.equal(archivedNoteOnly.status, 200);
  const noteOnlyDelete = await request("DELETE", `/clientes/${noteOnlyClient.body.id}`, { revisao: archivedNoteOnly.body.revisao }, token);
  assert.equal(noteOnlyDelete.status, 409);
  assert.equal(noteOnlyDelete.body.codigo, "CLIENT_HAS_RELATIONS");
  assert.equal(await prisma.cliente.count({ where: { id: noteOnlyClient.body.id, arquivadoEm: { not: null } } }), 1);
  assert.equal(await prisma.nota.count({ where: { empresaId, clienteId: noteOnlyClient.body.id } }), 1);

  const leadClient = await createClient(token, "Cliente com Lead", "Novo", 20);
  await prisma.lead.create({ data: { empresaId, clienteId: leadClient.body.id, origem: "Teste" } });
  const archivedLead = await request("POST", `/clientes/${leadClient.body.id}/arquivar`, { revisao: leadClient.body.revisao }, token);
  assert.equal(archivedLead.status, 200);
  const leadConflict = await request("DELETE", `/clientes/${leadClient.body.id}`, { revisao: archivedLead.body.revisao }, token);
  assert.equal(leadConflict.status, 409);
  assert.equal(leadConflict.body.codigo, "CLIENT_HAS_RELATIONS");

  const businessClient = await createClient(token, "Cliente com Negocio", "Novo", 30);
  await prisma.negocio.create({ data: { empresaId, clienteId: businessClient.body.id, titulo: "Negocio protegido" } });
  const archivedBusiness = await request("POST", `/clientes/${businessClient.body.id}/arquivar`, { revisao: businessClient.body.revisao }, token);
  assert.equal(archivedBusiness.status, 200);
  const businessConflict = await request("DELETE", `/clientes/${businessClient.body.id}`, { revisao: archivedBusiness.body.revisao }, token);
  assert.equal(businessConflict.status, 409);

  const bothClient = await createClient(token, "Cliente com ambos", "Novo", 40);
  const linkedLead = await prisma.lead.create({ data: { empresaId, clienteId: bothClient.body.id, origem: "Teste" } });
  await prisma.negocio.create({ data: { empresaId, clienteId: bothClient.body.id, leadId: linkedLead.id, titulo: "Negocio e Lead" } });
  const archivedBoth = await request("POST", `/clientes/${bothClient.body.id}/arquivar`, { revisao: bothClient.body.revisao }, token);
  assert.equal(archivedBoth.status, 200);
  assert.equal((await request("DELETE", `/clientes/${bothClient.body.id}`, { revisao: archivedBoth.body.revisao }, token)).status, 409);

  const otherCompany = await registerCompany("Empresa Exclusao Audit", "admin-exclusao@comercial.test");
  assert.equal((await request("DELETE", `/clientes/${leadClient.body.id}`, { revisao: archivedLead.body.revisao }, otherCompany.token)).status, 404);
  assert.equal((await request("DELETE", "/clientes/2147483647", undefined, token)).status, 404);

  const originalDeleteMany = prisma.cliente.deleteMany;
  const originalTransaction = prisma.$transaction;
  prisma.cliente.deleteMany = async () => {
    throw new Error("SQLITE_INTERNAL at C:\\secret\\database.db");
  };
  prisma.$transaction = async (callback) => callback(prisma);
  try {
    const unexpectedClient = await createClient(token, "Cliente erro inesperado", "Novo", 50);
    const archivedUnexpected = await request("POST", `/clientes/${unexpectedClient.body.id}/arquivar`, { revisao: unexpectedClient.body.revisao }, token);
    assert.equal(archivedUnexpected.status, 200);
    const unexpected = await request("DELETE", `/clientes/${unexpectedClient.body.id}`, { revisao: archivedUnexpected.body.revisao }, token);
    assert.equal(unexpected.status, 500);
    assert.equal(unexpected.body.codigo, "CLIENT_DELETE_ERROR");
    assert.doesNotMatch(JSON.stringify(unexpected.body), /SQLITE|secret|database\.db/);
  } finally {
    prisma.cliente.deleteMany = originalDeleteMany;
    prisma.$transaction = originalTransaction;
  }
});

async function registerCompany(nome, email) {
  const registration = await request("POST", "/auth/register-company", {
    empresaNome: nome,
    adminNome: `Admin ${nome}`,
    email,
    senha: "SenhaComercial123",
  });
  assert.equal(registration.status, 201);
  const loginResponse = await login(email);
  return {
    empresa: registration.body.empresa,
    usuario: registration.body.usuario,
    token: loginResponse.body.access_token,
  };
}

async function login(email, senha = "SenhaComercial123") {
  const response = await request("POST", "/auth/login", {
    email,
    senha,
  });
  assert.equal(response.status, 200);
  return response;
}

async function createClient(token, nome, status, valor) {
  return request("POST", "/clientes", {
    nome,
    telefone: "11999990000",
    email: `${nome.toLowerCase().replace(/\s+/g, "-")}@example.test`,
    empresa: "Empresa ficticia",
    interesse: "Teste comercial",
    status,
    valor,
    origem: "Teste",
    tags: ["qa"],
  }, token);
}

async function createSchedule(token, clienteId, titulo) {
  return request("POST", "/acompanhamentos", {
    clienteId,
    titulo,
    descricao: "Acompanhamento ficticio",
    dataHora: futureDate(),
    prioridade: "MEDIA",
    tipo: "LIGACAO",
    responsavel: "QA",
  }, token);
}

function futureDate() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

async function coreCounts() {
  return {
    cliente: await prisma.cliente.count(),
    nota: await prisma.nota.count(),
    acompanhamento: await prisma.acompanhamento.count(),
  };
}

async function channelCounts() {
  return {
    canalIntegracao: await prisma.canalIntegracao.count(),
    contatoCanal: await prisma.contatoCanal.count(),
    conversaCanal: await prisma.conversaCanal.count(),
    mensagemCanal: await prisma.mensagemCanal.count(),
  };
}

async function request(method, pathname, body, token) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}
