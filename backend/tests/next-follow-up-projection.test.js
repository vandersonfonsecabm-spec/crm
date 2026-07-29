const assert = require("node:assert/strict");
const { after, beforeEach, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const {
  NO_FOLLOW_UP_PROJECTION,
  PROJECTION_CONFLICT_CODE,
  PROJECTION_RESULTS,
  reconcileNextFollowUpProjection,
  withProjectionRetry,
} = require("../src/follow-up-projection");

process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
let sequence = 0;

beforeEach(cleanDatabase);
after(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

test("projecao seleciona ativo mais antigo, desempata por id e aceita vencido", async () => {
  const fixture = await seedClients("selection");
  const date = new Date("2026-08-05T12:00:00.000Z");
  const first = await followUp(fixture.empresa.id, fixture.clientA.id, date, "PENDENTE");
  await followUp(fixture.empresa.id, fixture.clientA.id, date, "EM_ANDAMENTO");
  await followUp(fixture.empresa.id, fixture.clientA.id, new Date("2026-08-01T12:00:00.000Z"), "CONCLUIDO");

  const result = await prisma.$transaction((tx) => reconcileNextFollowUpProjection({
    tx,
    empresaId: fixture.empresa.id,
    clienteId: fixture.clientA.id,
  }));

  assert.deepEqual(result, {
    status: PROJECTION_RESULTS.UPDATED,
    clienteId: fixture.clientA.id,
    value: first.dataHora.toISOString(),
  });
  const projected = await prisma.cliente.findUniqueOrThrow({ where: { id: fixture.clientA.id } });
  assert.equal(projected.proximoFollowUp, first.dataHora.toISOString());
  assert.equal(projected.revisao, 2);
});

test("projecao sem ativo usa sentinela e no-op nao incrementa revisao", async () => {
  const fixture = await seedClients("no-op");
  await prisma.cliente.update({
    where: { id: fixture.clientA.id },
    data: { proximoFollowUp: NO_FOLLOW_UP_PROJECTION },
  });
  const before = await prisma.cliente.findUniqueOrThrow({ where: { id: fixture.clientA.id } });

  const result = await prisma.$transaction((tx) => reconcileNextFollowUpProjection({
    tx,
    empresaId: fixture.empresa.id,
    clienteId: fixture.clientA.id,
  }));

  const after = await prisma.cliente.findUniqueOrThrow({ where: { id: fixture.clientA.id } });
  assert.equal(result.status, PROJECTION_RESULTS.NO_CHANGE);
  assert.equal(after.proximoFollowUp, NO_FOLLOW_UP_PROJECTION);
  assert.equal(after.revisao, before.revisao);
});

test("projecao isola tenant e informa cliente ausente", async () => {
  const fixture = await seedClients("tenant");
  const other = await seedClients("tenant-other");
  await followUp(other.empresa.id, other.clientA.id, new Date("2026-08-05T12:00:00.000Z"), "PENDENTE");

  const result = await prisma.$transaction((tx) => reconcileNextFollowUpProjection({
    tx,
    empresaId: fixture.empresa.id,
    clienteId: other.clientA.id,
  }));

  assert.deepEqual(result, {
    status: PROJECTION_RESULTS.CLIENT_NOT_FOUND,
    clienteId: other.clientA.id,
  });
  assert.equal((await prisma.cliente.findUniqueOrThrow({ where: { id: fixture.clientA.id } })).proximoFollowUp, "Hoje");
});

test("conflito CAS nao persiste projecao e rollback preserva cliente", async () => {
  const fixture = await seedClients("cas");
  await followUp(fixture.empresa.id, fixture.clientA.id, new Date("2026-08-05T12:00:00.000Z"), "PENDENTE");
  const result = await prisma.$transaction(async (tx) => {
    const wrapped = wrapUpdateConflict(tx);
    return reconcileNextFollowUpProjection({
      tx: wrapped,
      empresaId: fixture.empresa.id,
      clienteId: fixture.clientA.id,
    });
  });
  assert.equal(result.status, PROJECTION_RESULTS.REVISION_CONFLICT);
  assert.equal((await prisma.cliente.findUniqueOrThrow({ where: { id: fixture.clientA.id } })).proximoFollowUp, "Hoje");

  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await reconcileNextFollowUpProjection({ tx, empresaId: fixture.empresa.id, clienteId: fixture.clientA.id });
      throw new Error("Falha intermediaria controlada.");
    }),
    /Falha intermediaria controlada/,
  );
  assert.equal((await prisma.cliente.findUniqueOrThrow({ where: { id: fixture.clientA.id } })).proximoFollowUp, "Hoje");
});

test("retry de conflito CAS e limitado e encerra na terceira tentativa", async () => {
  let attempts = 0;
  const fakePrisma = {
    $transaction: async (operation) => operation({}),
  };
  const result = await withProjectionRetry(fakePrisma, async () => {
    attempts += 1;
    if (attempts < 3) {
      const error = new Error("Conflito controlado.");
      error.codigo = PROJECTION_CONFLICT_CODE;
      throw error;
    }
    return "ok";
  });

  assert.equal(result, "ok");
  assert.equal(attempts, 3);

  attempts = 0;
  await assert.rejects(
    withProjectionRetry(fakePrisma, async () => {
      attempts += 1;
      const error = new Error("Conflito persistente.");
      error.codigo = PROJECTION_CONFLICT_CODE;
      throw error;
    }),
    (error) => error.codigo === PROJECTION_CONFLICT_CODE,
  );
  assert.equal(attempts, 3);
});

test("consulta portavel do dashboard conta clientes com acompanhamento ativo no dia", async () => {
  const fixture = await seedClients("dashboard");
  const other = await seedClients("dashboard-other");
  const start = new Date("2026-08-05T00:00:00.000Z");
  const end = new Date("2026-08-06T00:00:00.000Z");

  await followUp(fixture.empresa.id, fixture.clientA.id, new Date("2026-08-05T09:00:00.000Z"), "PENDENTE");
  await followUp(fixture.empresa.id, fixture.clientA.id, new Date("2026-08-05T11:00:00.000Z"), "EM_ANDAMENTO");
  await followUp(fixture.empresa.id, fixture.clientB.id, new Date("2026-08-05T13:00:00.000Z"), "CONCLUIDO");
  await followUp(other.empresa.id, other.clientA.id, new Date("2026-08-05T10:00:00.000Z"), "PENDENTE");

  const grouped = await prisma.acompanhamento.groupBy({
    by: ["clienteId"],
    where: {
      empresaId: fixture.empresa.id,
      clienteId: { not: null },
      status: { in: ["PENDENTE", "EM_ANDAMENTO"] },
      dataHora: { gte: start, lt: end },
    },
  });

  assert.deepEqual(grouped.map((entry) => entry.clienteId), [fixture.clientA.id]);
});

async function seedClients(label) {
  const suffix = `${label}-${process.pid}-${++sequence}`;
  const empresa = await prisma.empresa.create({ data: { nome: `Empresa ${suffix}`, slug: suffix } });
  const clientA = await prisma.cliente.create({ data: { empresaId: empresa.id, nome: `Cliente A ${suffix}`, origem: "QA" } });
  const clientB = await prisma.cliente.create({ data: { empresaId: empresa.id, nome: `Cliente B ${suffix}`, origem: "QA" } });
  return { empresa, clientA, clientB };
}

function followUp(empresaId, clienteId, dataHora, status) {
  return prisma.acompanhamento.create({
    data: {
      empresaId,
      clienteId,
      titulo: "Acompanhamento de teste",
      dataHora,
      status,
    },
  });
}

function wrapUpdateConflict(tx) {
  return new Proxy(tx, {
    get(target, property) {
      if (property !== "cliente") {
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return new Proxy(target.cliente, {
        get(delegate, method) {
          if (method === "updateMany") return async () => ({ count: 0 });
          const value = Reflect.get(delegate, method);
          return typeof value === "function" ? value.bind(delegate) : value;
        },
      });
    },
  });
}

async function cleanDatabase() {
  await prisma.historicoAcompanhamento.deleteMany();
  await prisma.acompanhamento.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.empresa.deleteMany();
}
