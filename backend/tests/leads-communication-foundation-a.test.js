const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { after, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");

const backendDir = path.resolve(__dirname, "..");
const runDir = requiredEnv("CRM_PRISMA_TEST_RUN_DIR");
const historicalDatabase = path.join(runDir, "historical-9", "prisma", "test.db");
const tempDir = path.join(runDir, "leads-communication-foundation-a");
const emptyDatabase = path.join(tempDir, "empty.db");
const migratedCopy = path.join(tempDir, "existing.db");
const fixtureDatabase = path.join(tempDir, "fixtures.db");
const schemaPath = path.join(backendDir, "prisma", "schema.prisma");
const prismaCli = path.join(backendDir, "node_modules", "prisma", "build", "index.js");

let existingCountsBefore;
let legacyFixtureIds;
let migrated;

before(async () => {
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(emptyDatabase, "");
  migrate(emptyDatabase);

  fs.copyFileSync(historicalDatabase, migratedCopy);
  existingCountsBefore = await legacyCounts(migratedCopy);
  migrate(migratedCopy);

  fs.copyFileSync(historicalDatabase, fixtureDatabase);
  legacyFixtureIds = await seedLegacyRows(fixtureDatabase);
  migrate(fixtureDatabase);
  migrated = clientFor(fixtureDatabase);
});

after(async () => {
  if (migrated) await migrated.$disconnect();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("migrations aplicam do zero e preservam todas as tabelas existentes", async () => {
  const empty = clientFor(emptyDatabase);
  try {
    assert.deepEqual(await integrity(empty), { quickCheck: "ok", foreignKeyViolations: 0 });
    for (const model of ["lead", "negocio", "notaInternaConversa", "historicoAtribuicao", "eventoWebhook"]) {
      assert.equal(await empty[model].count(), 0);
    }
  } finally {
    await empty.$disconnect();
  }

  const migratedOfficialCopy = clientFor(migratedCopy);
  try {
    const existingCountsAfter = await legacyCounts(migratedCopy);
    for (const [table, total] of Object.entries(existingCountsBefore)) {
      assert.equal(existingCountsAfter[table], total, `${table} deve preservar a contagem legada`);
    }
    assert.deepEqual(await integrity(migratedOfficialCopy), { quickCheck: "ok", foreignKeyViolations: 0 });
    for (const model of ["lead", "negocio", "notaInternaConversa", "historicoAtribuicao", "eventoWebhook"]) {
      assert.equal(await migratedOfficialCopy[model].count(), 0);
    }
  } finally {
    await migratedOfficialCopy.$disconnect();
  }

  const optionalColumns = {
    Acompanhamento: ["leadId", "conversaCanalId", "negocioId"],
    ContatoCanal: ["clienteId"],
    ConversaCanal: ["leadId", "responsavelId", "primeiraMensagemEm", "primeiraRespostaHumanaEm", "aguardandoDesde", "encerradaEm", "reabertaEm"],
    MensagemCanal: ["statusEntrega", "enviadaEm", "entregueEm", "lidaEm", "falhouEm", "erroCodigo", "erroResumo"],
  };
  for (const [table, expected] of Object.entries(optionalColumns)) {
    const columns = await migrated.$queryRawUnsafe(`PRAGMA table_info(\"${table}\")`);
    const byName = new Map(columns.map((column) => [column.name, column]));
    for (const name of expected) {
      assert.equal(Number(byName.get(name)?.notnull), 0, `${table}.${name} deve permanecer opcional`);
    }
  }

  const schedule = await migrated.acompanhamento.findUnique({ where: { id: legacyFixtureIds.acompanhamentoId } });
  assert.equal(schedule.titulo, "Agenda legada Foundation A");
  assert.deepEqual([schedule.leadId, schedule.conversaCanalId, schedule.negocioId], [null, null, null]);
  const contact = await migrated.contatoCanal.findUnique({ where: { id: legacyFixtureIds.contatoId } });
  assert.equal(contact.externalId, legacyFixtureIds.contactExternalId);
  assert.equal(contact.clienteId, null);
  const conversation = await migrated.conversaCanal.findUnique({ where: { id: legacyFixtureIds.conversaId } });
  assert.equal(conversation.status, "ABERTA");
  assert.deepEqual([conversation.leadId, conversation.responsavelId, conversation.aguardandoDesde], [null, null, null]);
  const message = await migrated.mensagemCanal.findUnique({ where: { id: legacyFixtureIds.mensagemId } });
  assert.equal(message.externalId, legacyFixtureIds.messageExternalId);
  assert.equal(message.statusEntrega, null);
});

test("fundacao suporta cardinalidade, auditoria e idempotencia sem backfill", async () => {
  const empresaA = await migrated.empresa.create({ data: { nome: "Foundation A", slug: unique("foundation-a") } });
  const empresaB = await migrated.empresa.create({ data: { nome: "Foundation B", slug: unique("foundation-b") } });
  const responsavel = await migrated.usuario.create({
    data: { empresaId: empresaA.id, nome: "Responsavel A", email: unique("responsavel") + "@test.local", senhaHash: "teste" },
  });
  const autorNota = await migrated.usuario.create({
    data: { empresaId: empresaA.id, nome: "Autor A", email: unique("autor") + "@test.local", senhaHash: "teste" },
  });
  const usuarioRemovivel = await migrated.usuario.create({
    data: { empresaId: empresaA.id, nome: "Removivel A", email: unique("removivel") + "@test.local", senhaHash: "teste" },
  });
  const clienteA = await migrated.cliente.create({ data: { empresaId: empresaA.id, nome: "Cliente A" } });
  const clienteB = await migrated.cliente.create({ data: { empresaId: empresaB.id, nome: "Cliente B" } });

  const leadA1 = await migrated.lead.create({
    data: { empresaId: empresaA.id, clienteId: clienteA.id, responsavelId: responsavel.id, origem: "TESTE" },
  });
  const leadA2 = await migrated.lead.create({ data: { empresaId: empresaA.id, clienteId: clienteA.id } });
  assert.equal(await migrated.lead.count({ where: { clienteId: clienteA.id } }), 2);

  const negocioA1 = await migrated.negocio.create({
    data: { empresaId: empresaA.id, clienteId: clienteA.id, leadId: leadA1.id, responsavelId: responsavel.id, valor: 1250 },
  });
  await migrated.negocio.create({ data: { empresaId: empresaA.id, clienteId: clienteA.id, leadId: leadA2.id } });
  assert.equal(await migrated.negocio.count({ where: { clienteId: clienteA.id } }), 2);

  const canal = await migrated.canalIntegracao.create({
    data: { empresaId: empresaA.id, tipo: "WHATSAPP_META", nome: "Canal A", chaveInterna: unique("canal") },
  });
  const contato = await migrated.contatoCanal.create({
    data: { empresaId: empresaA.id, canalIntegracaoId: canal.id, clienteId: clienteA.id, externalId: unique("contato") },
  });
  const conversa = await migrated.conversaCanal.create({
    data: {
      empresaId: empresaA.id,
      canalIntegracaoId: canal.id,
      contatoCanalId: contato.id,
      leadId: leadA1.id,
      responsavelId: responsavel.id,
      status: "AGUARDANDO_ATENDIMENTO",
      aguardandoDesde: new Date(),
    },
  });

  const acompanhamento = await migrated.acompanhamento.create({
    data: {
      empresaId: empresaA.id,
      clienteId: clienteA.id,
      leadId: leadA1.id,
      conversaCanalId: conversa.id,
      negocioId: negocioA1.id,
      titulo: "Acompanhamento estrutural",
      dataHora: new Date(Date.now() + 60_000),
    },
  });
  assert.deepEqual(
    [acompanhamento.leadId, acompanhamento.conversaCanalId, acompanhamento.negocioId],
    [leadA1.id, conversa.id, negocioA1.id],
  );

  await migrated.notaInternaConversa.create({
    data: { empresaId: empresaA.id, conversaCanalId: conversa.id, autorId: autorNota.id, conteudo: "Nota privada" },
  });
  const historico = await migrated.historicoAtribuicao.create({
    data: {
      empresaId: empresaA.id,
      leadId: leadA1.id,
      responsavelAnteriorId: usuarioRemovivel.id,
      responsavelNovoId: responsavel.id,
      alteradoPorId: usuarioRemovivel.id,
      tipo: "TRANSFERIR",
    },
  });

  const evento = {
    empresaId: empresaA.id,
    canalIntegracaoId: canal.id,
    provedor: "PROVEDOR_TESTE",
    externalEventId: unique("evento"),
  };
  await migrated.eventoWebhook.create({ data: evento });
  await assert.rejects(migrated.eventoWebhook.create({ data: evento }), (error) => error.code === "P2002");

  const mensagem = {
    empresaId: empresaA.id,
    canalIntegracaoId: canal.id,
    conversaCanalId: conversa.id,
    externalId: unique("mensagem"),
    direcao: "ENTRADA",
  };
  await migrated.mensagemCanal.create({ data: mensagem });
  await assert.rejects(migrated.mensagemCanal.create({ data: mensagem }), (error) => error.code === "P2002");

  await assert.rejects(migrated.cliente.delete({ where: { id: clienteA.id } }), (error) => error.code === "P2003");
  await assert.rejects(migrated.conversaCanal.delete({ where: { id: conversa.id } }), (error) => error.code === "P2003");
  await assert.rejects(migrated.usuario.delete({ where: { id: autorNota.id } }), (error) => error.code === "P2003");

  await assert.rejects(migrated.usuario.delete({ where: { id: usuarioRemovivel.id } }), (error) => error.code === "P2003");
  const historicoPreservado = await migrated.historicoAtribuicao.findUnique({ where: { id: historico.id } });
  assert.equal(historicoPreservado.responsavelAnteriorId, usuarioRemovivel.id);
  assert.equal(historicoPreservado.alteradoPorId, usuarioRemovivel.id);

  const clienteSomenteContato = await migrated.cliente.create({ data: { empresaId: empresaA.id, nome: "Cliente desvinculavel" } });
  const contatoDesvinculavel = await migrated.contatoCanal.create({
    data: { empresaId: empresaA.id, canalIntegracaoId: canal.id, clienteId: clienteSomenteContato.id, externalId: unique("desvinculavel") },
  });
  await assert.rejects(migrated.cliente.delete({ where: { id: clienteSomenteContato.id } }), (error) => error.code === "P2003");
  assert.equal((await migrated.contatoCanal.findUnique({ where: { id: contatoDesvinculavel.id } })).clienteId, clienteSomenteContato.id);

  await assert.rejects(
    migrated.lead.create({ data: { empresaId: empresaA.id, clienteId: clienteB.id } }),
    (error) => error.code === "P2003",
  );
});

test("schema possui indices tenant e a fundacao so e ativada por modulos protegidos", async () => {
  const expectedIndexes = [
    "Lead_empresaId_status_idx",
    "Lead_empresaId_responsavelId_status_idx",
    "Lead_empresaId_clienteId_idx",
    "Lead_empresaId_createdAt_idx",
    "Negocio_empresaId_etapa_idx",
    "Negocio_empresaId_responsavelId_etapa_idx",
    "Negocio_empresaId_clienteId_idx",
    "Negocio_empresaId_leadId_idx",
    "EventoWebhook_empresaId_canalIntegracaoId_provedor_externalEventId_key",
    "ConversaCanal_empresaId_responsavelId_status_idx",
    "MensagemCanal_canalIntegracaoId_externalId_key",
  ];
  const indexes = await migrated.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type IN ('index')");
  const names = new Set(indexes.map(({ name }) => name));
  for (const name of expectedIndexes) assert.ok(names.has(name), `indice ausente: ${name}`);

  for (const table of ["Lead", "Negocio", "NotaInternaConversa", "HistoricoAtribuicao", "EventoWebhook"]) {
    const columns = await migrated.$queryRawUnsafe(`PRAGMA table_info(\"${table}\")`);
    assert.ok(columns.some((column) => column.name === "empresaId" && Number(column.notnull) === 1));
  }

  const schema = fs.readFileSync(schemaPath, "utf8");
  assert.equal((schema.match(/^model ConversaCanal \{/gm) || []).length, 1);
  assert.equal((schema.match(/^model MensagemCanal \{/gm) || []).length, 1);
  assert.equal((schema.match(/^model Conversa \{/gm) || []).length, 0);
  assert.equal((schema.match(/^model Mensagem \{/gm) || []).length, 0);

  const b1Directory = path.join(backendDir, "src", "leads-communication");
  const d1Directory = path.join(backendDir, "src", "site-leads");
  const g2aDirectory = path.join(backendDir, "src", "negocios-kanban");
  const b1Source = readJavaScript(b1Directory);
  assert.match(b1Source, /LEADS_COMMUNICATION_ENABLED/);
  assert.match(b1Source, /featureFlagMiddleware/);
  assert.match(b1Source, /prisma\.(lead|notaInternaConversa|historicoAtribuicao|eventoWebhook)\b/);
  const d1Source = readJavaScript(d1Directory);
  assert.match(d1Source, /LEADS_COMMUNICATION_ENABLED/);
  assert.match(d1Source, /SITE_LEAD_CAPTURE_ENABLED/);
  assert.match(d1Source, /prisma\.(lead|notaInternaConversa|eventoWebhook)\b/);
  const g2aSource = readJavaScript(g2aDirectory);
  assert.match(g2aSource, /NEGOCIOS_KANBAN/);
  assert.match(g2aSource, /prisma\.negocio\b/);
});

function migrate(databasePath) {
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: databaseUrl(databasePath) },
    stdio: "pipe",
  });
}

function clientFor(databasePath) {
  return new PrismaClient({ datasources: { db: { url: databaseUrl(databasePath) } } });
}

function databaseUrl(databasePath) {
  return `file:${databasePath.replaceAll("\\", "/")}`;
}

async function legacyCounts(databasePath) {
  const prisma = clientFor(databasePath);
  try {
    const tables = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' " +
        "AND name != '_prisma_migrations' AND name NOT IN ('Lead','Negocio','NotaInternaConversa','HistoricoAtribuicao','EventoWebhook','EmpresaFuncionalidade','AuditoriaFuncionalidade') ORDER BY name",
    );
    const result = {};
    for (const { name } of tables) {
      const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS total FROM \"${name}\"`);
      result[name] = Number(rows[0].total);
    }
    return result;
  } finally {
    await prisma.$disconnect();
  }
}

async function seedLegacyRows(databasePath) {
  const prisma = clientFor(databasePath);
  try {
    const suffix = unique("legacy");
    let empresa = await prisma.$queryRaw`SELECT "id" FROM "Empresa" ORDER BY "id" LIMIT 1`;
    if (empresa.length === 0) {
      const slug = `empresa-${suffix}`;
      await prisma.$executeRaw`
        INSERT INTO "Empresa" ("nome", "slug", "updatedAt")
        VALUES (${"Empresa legada Foundation A"}, ${slug}, ${new Date()})
      `;
      empresa = await prisma.$queryRaw`SELECT "id" FROM "Empresa" WHERE "slug" = ${slug}`;
    }
    let cliente = await prisma.$queryRaw`
      SELECT "id" FROM "Cliente" WHERE "empresaId" = ${empresa[0].id} ORDER BY "id" LIMIT 1
    `;
    if (cliente.length === 0) {
      await prisma.$executeRaw`
        INSERT INTO "Cliente" ("empresaId", "nome")
        VALUES (${empresa[0].id}, ${"Cliente legado Foundation A"})
      `;
      cliente = await prisma.$queryRaw`
        SELECT "id" FROM "Cliente"
        WHERE "empresaId" = ${empresa[0].id} AND "nome" = ${"Cliente legado Foundation A"}
        ORDER BY "id" DESC LIMIT 1
      `;
    }
    const channelKey = `canal-${suffix}`;
    await prisma.$executeRaw`
      INSERT INTO "CanalIntegracao" ("empresaId", "tipo", "nome", "chaveInterna", "updatedAt")
      VALUES (${empresa[0].id}, ${"WHATSAPP_META"}, ${"Canal legado Foundation A"}, ${channelKey}, ${new Date()})
    `;
    const channel = await prisma.$queryRaw`
      SELECT "id" FROM "CanalIntegracao" WHERE "empresaId" = ${empresa[0].id} AND "chaveInterna" = ${channelKey}
    `;
    const contactExternalId = `contato-${suffix}`;
    const contact = await prisma.contatoCanal.create({
      data: { empresaId: empresa[0].id, canalIntegracaoId: channel[0].id, externalId: contactExternalId, nome: "Contato legado" },
      select: { id: true },
    });
    const conversation = await prisma.conversaCanal.create({
      data: { empresaId: empresa[0].id, canalIntegracaoId: channel[0].id, contatoCanalId: contact.id, chaveAberta: `aberta-${suffix}` },
      select: { id: true },
    });
    const messageExternalId = `mensagem-${suffix}`;
    const message = await prisma.mensagemCanal.create({
      data: {
        empresaId: empresa[0].id,
        canalIntegracaoId: channel[0].id,
        conversaCanalId: conversation.id,
        externalId: messageExternalId,
        direcao: "ENTRADA",
        texto: "Mensagem legada",
      },
      select: { id: true },
    });
    const scheduleDate = new Date(Date.now() + 60_000);
    await prisma.$executeRaw`
      INSERT INTO "Acompanhamento" ("empresaId", "clienteId", "titulo", "dataHora", "updatedAt")
      VALUES (${empresa[0].id}, ${cliente[0].id}, ${"Agenda legada Foundation A"}, ${scheduleDate}, ${new Date()})
    `;
    const schedule = await prisma.$queryRaw`
      SELECT "id" FROM "Acompanhamento"
      WHERE "empresaId" = ${empresa[0].id} AND "titulo" = ${"Agenda legada Foundation A"}
      ORDER BY "id" DESC LIMIT 1
    `;
    return {
      acompanhamentoId: schedule[0].id,
      contatoId: contact.id,
      contactExternalId,
      conversaId: conversation.id,
      mensagemId: message.id,
      messageExternalId,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function integrity(prisma) {
  const quick = await prisma.$queryRawUnsafe("PRAGMA quick_check");
  const foreignKeys = await prisma.$queryRawUnsafe("PRAGMA foreign_key_check");
  return { quickCheck: quick[0].quick_check, foreignKeyViolations: foreignKeys.length };
}

function readJavaScript(directory, excludedDirectories = new Set()) {
  return fs.readdirSync(directory, { withFileTypes: true }).map((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (excludedDirectories.has(path.resolve(fullPath))) return "";
      return readJavaScript(fullPath, excludedDirectories);
    }
    return entry.isFile() && fullPath.endsWith(".js") ? fs.readFileSync(fullPath, "utf8") : "";
  }).join("\n");
}

function unique(prefix) {
  return `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function requiredEnv(name) {
  if (!process.env[name]) throw new Error(`${name} deve ser definido pelo supervisor de testes.`);
  return process.env[name];
}
