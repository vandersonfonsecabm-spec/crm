const { test } = require("node:test");
const assert = require("node:assert/strict");

const postgres = process.env.CRM_TEST_DATABASE_PROVIDER === "postgresql";

test("PostgreSQL preserva ao menos um ADMIN ativo sob remocoes concorrentes", { skip: !postgres }, async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = requiredPostgresUrl();

  const { PrismaClient } = require("@prisma/client");
  const { updateUserWithLastAdminGuard } = require("../src/user-security");
  const firstClient = new PrismaClient();
  const secondClient = new PrismaClient();
  const suffix = `${Date.now()}-${process.pid}`;
  let empresaId;

  try {
    const empresa = await firstClient.empresa.create({
      data: { nome: `Auth Concurrency ${suffix}`, slug: `auth-concurrency-${suffix}` },
    });
    empresaId = empresa.id;
    const [firstAdmin, secondAdmin] = await Promise.all([
      firstClient.usuario.create({
        data: {
          empresaId,
          nome: "Admin Concorrente A",
          email: `admin-a-${suffix}@test.local`,
          senhaHash: "nao-utilizado-no-teste",
          papel: "ADMIN",
        },
      }),
      firstClient.usuario.create({
        data: {
          empresaId,
          nome: "Admin Concorrente B",
          email: `admin-b-${suffix}@test.local`,
          senhaHash: "nao-utilizado-no-teste",
          papel: "ADMIN",
        },
      }),
    ]);

    const results = await Promise.all([
      updateUserWithLastAdminGuard({ prisma: firstClient, id: firstAdmin.id, empresaId, data: { ativo: false } }),
      updateUserWithLastAdminGuard({ prisma: secondClient, id: secondAdmin.id, empresaId, data: { ativo: false } }),
    ]);

    assert.deepEqual(results.map((result) => result.kind).sort(), ["last-admin", "updated"]);
    assert.equal(await firstClient.usuario.count({ where: { empresaId, papel: "ADMIN", ativo: true } }), 1);
  } finally {
    try {
      if (empresaId) {
        await firstClient.usuario.deleteMany({ where: { empresaId } });
        await firstClient.empresa.delete({ where: { id: empresaId } });
      }
    } finally {
      await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
    }
  }
});

function requiredPostgresUrl() {
  const value = String(process.env.CRM_TEST_DATABASE_URL || "").trim();
  if (!/^postgres(ql)?:\/\//i.test(value)) throw new Error("CRM_TEST_DATABASE_URL PostgreSQL obrigatoria.");
  return value;
}
