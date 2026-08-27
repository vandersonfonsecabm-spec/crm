process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const { validateTestPostgresUrl } = require("../src/database/prisma-client");
const { relationSpecs } = require("../scripts/check-tenant-relation-integrity.cjs");

const databaseUrl = validateTestPostgresUrl(
  process.env.CRM_TEST_DATABASE_URL || process.env.POSTGRES_TEST_DATABASE_URL,
  process.env,
);
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const concurrentPrisma = new PrismaClient({ datasourceUrl: databaseUrl });

before(async () => {
  await prisma.$connect();
  await concurrentPrisma.$connect();
});

after(async () => {
  await Promise.all([prisma.$disconnect(), concurrentPrisma.$disconnect()]);
});

test("PostgreSQL possui as 162 FKs compostas tenant-scoped", async () => {
  const constraints = await prisma.$queryRawUnsafe(`
    SELECT child.relname AS "childTable",
           parent.relname AS "parentTable",
           pg_get_constraintdef(constraint_row.oid) AS definition
      FROM pg_constraint constraint_row
      JOIN pg_class child ON child.oid = constraint_row.conrelid
      JOIN pg_class parent ON parent.oid = constraint_row.confrelid
     WHERE constraint_row.contype = 'f'
       AND child.relnamespace = current_schema()::regnamespace`);

  assert.equal(relationSpecs.length, 162);
  for (const [, childTable, childField, parentTable, tenantField = "empresaId"] of relationSpecs) {
    const expectedForeign = normalizeConstraint(`FOREIGN KEY (${tenantField}, ${childField})`);
    const expectedReference = normalizeConstraint(`REFERENCES ${parentTable}(empresaId, id)`);
    const found = constraints.some((row) => row.childTable === childTable
      && row.parentTable === parentTable
      && normalizeConstraint(row.definition).includes(expectedForeign)
      && normalizeConstraint(row.definition).includes(expectedReference));
    assert.equal(found, true, `${childTable}.${childField} -> ${parentTable} sem FK tenant composta no PostgreSQL`);
  }
});

test("PostgreSQL rejeita vinculos cruzados e reverte a transacao inteira", async () => {
  const fixture = await seedTenants();

  await assertP2003(() => prisma.lead.create({
    data: { empresaId: fixture.tenantA.id, clienteId: fixture.clientB.id },
  }));

  await assertP2003(() => prisma.$transaction(async (tx) => {
    await tx.nota.create({
      data: { empresaId: fixture.tenantA.id, clienteId: fixture.clientA.id, texto: "rollback controlado" },
    });
    await tx.sincronizacaoIntegracao.create({
      data: { empresaId: fixture.tenantA.id, integracaoId: fixture.integrationB.id },
    });
  }));

  assert.equal(await prisma.lead.count({ where: { empresaId: fixture.tenantA.id } }), 0);
  assert.equal(await prisma.nota.count({ where: { empresaId: fixture.tenantA.id } }), 0);
  assert.equal(await prisma.sincronizacaoIntegracao.count({ where: { empresaId: fixture.tenantA.id } }), 0);
});

test("duas conexoes concorrentes nao conseguem persistir update cruzado", async () => {
  const fixture = await seedTenants();
  const lead = await prisma.lead.create({
    data: { empresaId: fixture.tenantA.id, clienteId: fixture.clientA.id, responsavelId: fixture.userA.id },
  });

  const [valid, crossed] = await Promise.allSettled([
    prisma.lead.update({ where: { id: lead.id }, data: { clienteId: fixture.clientA.id } }),
    concurrentPrisma.lead.update({ where: { id: lead.id }, data: { clienteId: fixture.clientB.id } }),
  ]);

  assert.equal(valid.status, "fulfilled");
  assert.equal(crossed.status, "rejected");
  assert.equal(crossed.reason?.code, "P2003");
  const stored = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
  assert.equal(stored.empresaId, fixture.tenantA.id);
  assert.equal(stored.clienteId, fixture.clientA.id);
});

async function seedTenants() {
  const tenantA = await prisma.empresa.create({ data: { nome: unique("Tenant A"), slug: unique("tenant-a") } });
  const tenantB = await prisma.empresa.create({ data: { nome: unique("Tenant B"), slug: unique("tenant-b") } });
  const userA = await prisma.usuario.create({ data: { empresaId: tenantA.id, nome: "User A", email: `${unique("user-a")}@test.local`, senhaHash: "test" } });
  const userB = await prisma.usuario.create({ data: { empresaId: tenantB.id, nome: "User B", email: `${unique("user-b")}@test.local`, senhaHash: "test" } });
  const clientA = await prisma.cliente.create({ data: { empresaId: tenantA.id, nome: "Client A" } });
  const clientB = await prisma.cliente.create({ data: { empresaId: tenantB.id, nome: "Client B" } });
  const integrationB = await prisma.integracao.create({ data: { empresaId: tenantB.id, nome: "Integration B", tipo: "BLING", status: "ATIVA" } });
  return { tenantA, tenantB, userA, userB, clientA, clientB, integrationB };
}

async function assertP2003(run) {
  await assert.rejects(run, (error) => error?.code === "P2003");
}

function normalizeConstraint(value) {
  return String(value).replace(/"/g, "").replace(/\s+/g, " ").toLowerCase();
}

function unique(prefix) {
  return `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
