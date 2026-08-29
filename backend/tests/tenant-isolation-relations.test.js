const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const { relationSpecs } = require("../scripts/check-tenant-relation-integrity.cjs");

const runDir = requiredEnv("CRM_PRISMA_TEST_RUN_DIR");
const sourceDatabase = requiredEnv("CRM_TEST_BASE_DATABASE_PATH");
const testDir = path.join(runDir, "tenant-isolation-relations");
const databasePath = path.join(testDir, `relations-${process.pid}.db`);
let prisma;

before(() => {
  fs.mkdirSync(testDir, { recursive: true });
  fs.copyFileSync(sourceDatabase, databasePath);
  prisma = new PrismaClient({ datasourceUrl: databaseUrl(databasePath) });
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  removeDatabase(databasePath);
});

test("todas as 169 relacoes tenant-scoped mapeadas usam FK composta", async () => {
  assert.equal(relationSpecs.length, 169);
  for (const [, childTable, childField, parentTable, tenantField = "empresaId"] of relationSpecs) {
    const rows = await prisma.$queryRawUnsafe(`PRAGMA foreign_key_list("${childTable}")`);
    const grouped = Map.groupBy(rows, (row) => Number(row.id));
    const found = [...grouped.values()].some((group) => {
      if (group[0]?.table !== parentTable) return false;
      const pairs = new Map(group.map((row) => [row.from, row.to]));
      return pairs.get(tenantField) === "empresaId" && pairs.get(childField) === "id";
    });
    assert.equal(found, true, `${childTable}.${childField} -> ${parentTable} sem FK tenant composta`);
  }
});

test("SQLite rejeita vinculos cruzados centrais e preserva relacoes validas", async () => {
  const fixture = await seedTenants();
  const validLead = await prisma.lead.create({
    data: { empresaId: fixture.tenantA.id, clienteId: fixture.clientA.id, responsavelId: fixture.userA.id },
  });
  assert.equal(validLead.empresaId, fixture.tenantA.id);

  await assertP2003(() => prisma.lead.create({
    data: { empresaId: fixture.tenantA.id, clienteId: fixture.clientB.id },
  }));
  await assertP2003(() => prisma.sincronizacaoIntegracao.create({
    data: { empresaId: fixture.tenantA.id, integracaoId: fixture.integrationB.id },
  }));
  await assertP2003(() => prisma.eventoWebhook.create({
    data: {
      empresaId: fixture.tenantA.id,
      canalIntegracaoId: fixture.channelB.id,
      provedor: "TENANT_ISOLATION_TEST",
      externalEventId: unique("cross-event"),
    },
  }));
  await assertP2003(() => prisma.automacaoExecucao.create({
    data: {
      empresaId: fixture.tenantA.id,
      regraId: fixture.ruleB.id,
      regraVersao: 1,
      regraSnapshotJson: "{}",
      entidadeTipo: "LEAD",
      entidadeId: validLead.id,
      leadId: validLead.id,
      occurrenceKey: unique("cross-execution"),
      idempotencyKey: unique("cross-idempotency"),
    },
  }));
  await assertP2003(() => prisma.platformTenantAudit.create({
    data: {
      actorUserId: fixture.userA.id,
      tenantId: fixture.tenantA.id,
      action: "TENANT_ISOLATION_TEST",
      tenantName: fixture.tenantA.nome,
      tenantSlug: fixture.tenantA.slug,
      adminUserId: fixture.userB.id,
    },
  }));

  assert.equal(await prisma.lead.count({ where: { empresaId: fixture.tenantA.id } }), 1);
  assert.equal(await prisma.sincronizacaoIntegracao.count({ where: { empresaId: fixture.tenantA.id } }), 0);
  assert.equal(await prisma.eventoWebhook.count({ where: { empresaId: fixture.tenantA.id } }), 0);
  assert.equal(await prisma.automacaoExecucao.count({ where: { empresaId: fixture.tenantA.id } }), 0);
  assert.equal(await prisma.platformTenantAudit.count({ where: { tenantId: fixture.tenantA.id } }), 0);
});

test("servicos internos recarregam integracao e importacao pelo tenant", async () => {
  const fixture = await seedTenants();
  const blingService = require("../src/integrations/blingService").createBlingService({ prisma });
  const { cancelImportacao } = require("../src/integrations/importService");
  const importB = await prisma.importacaoDados.create({
    data: {
      empresaId: fixture.tenantB.id,
      integracaoId: fixture.integrationB.id,
      formato: "CSV",
      nomeArquivo: "tenant-b.csv",
      tamanhoBytes: 1,
      hashArquivo: unique("hash"),
      tipoEntidade: "PRODUTO",
      createdByUsuarioId: fixture.userB.id,
    },
  });

  await assert.rejects(
    blingService.sincronizar({ integracao: fixture.integrationB, empresaId: fixture.tenantA.id, entidades: ["PRODUTOS"] }),
    (error) => error.code === "INTEGRATION_NOT_FOUND" && error.status === 404,
  );
  await assert.rejects(
    cancelImportacao({ prisma, importacao: importB, empresaId: fixture.tenantA.id }),
    (error) => error.code === "IMPORT_NOT_FOUND" && error.status === 404,
  );
  assert.equal(await prisma.sincronizacaoIntegracao.count({ where: { empresaId: fixture.tenantA.id } }), 0);
  assert.equal((await prisma.importacaoDados.findUnique({ where: { id: importB.id } })).status, importB.status);
});

async function seedTenants() {
  const tenantA = await prisma.empresa.create({ data: { nome: unique("Tenant A"), slug: unique("tenant-a") } });
  const tenantB = await prisma.empresa.create({ data: { nome: unique("Tenant B"), slug: unique("tenant-b") } });
  const userA = await prisma.usuario.create({ data: { empresaId: tenantA.id, nome: "User A", email: `${unique("user-a")}@test.local`, senhaHash: "test" } });
  const userB = await prisma.usuario.create({ data: { empresaId: tenantB.id, nome: "User B", email: `${unique("user-b")}@test.local`, senhaHash: "test" } });
  const clientA = await prisma.cliente.create({ data: { empresaId: tenantA.id, nome: "Client A" } });
  const clientB = await prisma.cliente.create({ data: { empresaId: tenantB.id, nome: "Client B" } });
  const integrationB = await prisma.integracao.create({ data: { empresaId: tenantB.id, nome: "Integration B", tipo: "BLING", status: "ATIVA" } });
  const channelB = await prisma.canalIntegracao.create({ data: { empresaId: tenantB.id, tipo: "SITE_FORM", nome: "Channel B", chaveInterna: unique("channel-b") } });
  const ruleB = await prisma.automacaoRegra.create({
    data: { empresaId: tenantB.id, nome: "Rule B", gatilho: "LEAD_CREATED", timezone: "UTC", createdById: userB.id, updatedById: userB.id },
  });
  return { tenantA, tenantB, userA, userB, clientA, clientB, integrationB, channelB, ruleB };
}

async function assertP2003(run) {
  await assert.rejects(run, (error) => error.code === "P2003");
}

function unique(prefix) {
  return `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function databaseUrl(file) {
  return `file:${path.resolve(file).replace(/\\/g, "/")}`;
}

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value || !path.isAbsolute(value)) throw new Error(`${name} absoluto e obrigatorio.`);
  return value;
}
