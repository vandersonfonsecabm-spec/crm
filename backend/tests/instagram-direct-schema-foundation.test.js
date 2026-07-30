process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  datasourceUrl: requiredEnv("CRM_TEST_DATABASE_URL"),
});
const suffix = `${Date.now()}-${process.pid}`;
const tenantIds = [];

after(async () => {
  if (tenantIds.length) {
    await prisma.empresaFuncionalidade.deleteMany({
      where: { empresaId: { in: tenantIds } },
    });
    await prisma.canalIntegracao.deleteMany({
      where: { empresaId: { in: tenantIds } },
    });
    await prisma.empresa.deleteMany({
      where: { id: { in: tenantIds } },
    });
  }
  await prisma.$disconnect();
});

test("fundacao Instagram preserva identidade, constraints e coexistencia de canais", async () => {
  const tenantA = await createTenant("instagram-a");
  const tenantB = await createTenant("instagram-b");
  const identity = "00017890000000001";
  const instagram = await prisma.canalIntegracao.create({
    data: instagramChannel({
      empresaId: tenantA.id,
      chaveInterna: "instagram-meta-inbound-real",
      instagramBusinessAccountId: identity,
    }),
  });

  assert.equal(instagram.tipo, "INSTAGRAM_META");
  assert.equal(instagram.instagramBusinessAccountId, identity);
  assert.equal(instagram.instagramUsernameMasked, "@conta_****");
  assert.equal(instagram.wabaId, null);
  assert.equal(instagram.phoneNumberId, null);

  await assertP2002(() => prisma.canalIntegracao.create({
    data: instagramChannel({
      empresaId: tenantA.id,
      chaveInterna: "instagram-meta-inbound-real",
      instagramBusinessAccountId: "00017890000000002",
    }),
  }));
  await assertP2002(() => prisma.canalIntegracao.create({
    data: instagramChannel({
      empresaId: tenantB.id,
      chaveInterna: "instagram-meta-inbound-real",
      instagramBusinessAccountId: identity,
    }),
  }));

  const instagramTest = await prisma.canalIntegracao.create({
    data: {
      empresaId: tenantA.id,
      tipo: "INSTAGRAM_META",
      nome: "Instagram test fixture",
      chaveInterna: "instagram-meta-test",
      status: "MODO_TESTE",
      modoTeste: true,
      ativo: true,
    },
  });
  const whatsapp = await prisma.canalIntegracao.create({
    data: {
      empresaId: tenantA.id,
      tipo: "WHATSAPP_META",
      nome: "WhatsApp preserved",
      chaveInterna: "whatsapp-meta-test-foundation",
      status: "MODO_TESTE",
      modoTeste: true,
      ativo: true,
    },
  });
  const siteForm = await prisma.canalIntegracao.create({
    data: {
      empresaId: tenantA.id,
      tipo: "SITE_FORM",
      nome: "Site form preserved",
      chaveInterna: "site-form-instagram-foundation",
      status: "ATIVO",
      modoTeste: true,
      ativo: true,
    },
  });

  assert.equal(instagramTest.instagramBusinessAccountId, null);
  assert.equal(whatsapp.instagramBusinessAccountId, null);
  assert.equal(siteForm.instagramBusinessAccountId, null);
  assert.equal(await prisma.canalIntegracao.count({
    where: { empresaId: tenantA.id },
  }), 4);

  await prisma.empresaFuncionalidade.createMany({
    data: [
      { empresaId: tenantA.id, chave: "INSTAGRAM_INTEGRATION", habilitada: false },
      { empresaId: tenantA.id, chave: "INSTAGRAM_INBOUND", habilitada: false },
      { empresaId: tenantA.id, chave: "WHATSAPP_INTEGRATION", habilitada: true },
      { empresaId: tenantA.id, chave: "WHATSAPP_INBOUND", habilitada: true },
    ],
  });
  const capabilities = await prisma.empresaFuncionalidade.findMany({
    where: { empresaId: tenantA.id },
    select: { chave: true, habilitada: true },
  });
  assert.deepEqual(capabilities.sort((left, right) => (
    left.chave.localeCompare(right.chave)
  )), [
    { chave: "INSTAGRAM_INBOUND", habilitada: false },
    { chave: "INSTAGRAM_INTEGRATION", habilitada: false },
    { chave: "WHATSAPP_INBOUND", habilitada: true },
    { chave: "WHATSAPP_INTEGRATION", habilitada: true },
  ]);
});

function instagramChannel({
  empresaId,
  chaveInterna,
  instagramBusinessAccountId,
}) {
  return {
    empresaId,
    tipo: "INSTAGRAM_META",
    nome: "Instagram inbound real",
    chaveInterna,
    status: "INATIVO",
    modoTeste: false,
    ativo: false,
    providerEnvironment: "INSTAGRAM_SCHEMA_TEST",
    metaAppId: "INSTAGRAM_APP_SCHEMA_TEST",
    instagramBusinessAccountId,
    instagramUsernameMasked: "@conta_****",
  };
}

async function createTenant(label) {
  const tenant = await prisma.empresa.create({
    data: {
      nome: `Tenant ${label} ${suffix}`,
      slug: `${label}-${suffix}`,
    },
  });
  tenantIds.push(tenant.id);
  return tenant;
}

async function assertP2002(operation) {
  await assert.rejects(operation, (error) => error?.code === "P2002");
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} deve ser definido pelo supervisor de testes.`);
  return value;
}
