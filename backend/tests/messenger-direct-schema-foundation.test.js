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

test("fundacao Messenger preserva identidade, constraints e coexistencia de canais", async () => {
  const tenantA = await createTenant("messenger-a");
  const tenantB = await createTenant("messenger-b");
  const identity = "00017890000000001";
  const messenger = await prisma.canalIntegracao.create({
    data: messengerChannel({
      empresaId: tenantA.id,
      chaveInterna: "messenger-meta-inbound-real",
      messengerPageId: identity,
    }),
  });

  assert.equal(messenger.tipo, "MESSENGER_META");
  assert.equal(messenger.messengerPageId, identity);
  assert.equal(messenger.messengerPageNameMasked, "@conta_****");
  assert.equal(messenger.wabaId, null);
  assert.equal(messenger.phoneNumberId, null);

  await assertP2002(() => prisma.canalIntegracao.create({
    data: messengerChannel({
      empresaId: tenantA.id,
      chaveInterna: "messenger-meta-inbound-real",
      messengerPageId: "00017890000000002",
    }),
  }));
  await assertP2002(() => prisma.canalIntegracao.create({
    data: messengerChannel({
      empresaId: tenantB.id,
      chaveInterna: "messenger-meta-inbound-real",
      messengerPageId: identity,
    }),
  }));

  const messengerTest = await prisma.canalIntegracao.create({
    data: {
      empresaId: tenantA.id,
      tipo: "MESSENGER_META",
      nome: "Messenger test fixture",
      chaveInterna: "messenger-meta-test",
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
  const instagram = await prisma.canalIntegracao.create({
    data: {
      empresaId: tenantA.id,
      tipo: "INSTAGRAM_META",
      nome: "Instagram preserved",
      chaveInterna: "instagram-meta-test-foundation",
      status: "MODO_TESTE",
      modoTeste: true,
      ativo: true,
      instagramBusinessAccountId: identity,
    },
  });
  const siteForm = await prisma.canalIntegracao.create({
    data: {
      empresaId: tenantA.id,
      tipo: "SITE_FORM",
      nome: "Site form preserved",
      chaveInterna: "site-form-messenger-foundation",
      status: "ATIVO",
      modoTeste: true,
      ativo: true,
    },
  });

  assert.equal(messengerTest.messengerPageId, null);
  assert.equal(whatsapp.messengerPageId, null);
  assert.equal(instagram.messengerPageId, null);
  assert.equal(instagram.instagramBusinessAccountId, identity);
  assert.equal(siteForm.messengerPageId, null);
  assert.equal(await prisma.canalIntegracao.count({
    where: { empresaId: tenantA.id },
  }), 5);

  await prisma.empresaFuncionalidade.createMany({
    data: [
      { empresaId: tenantA.id, chave: "MESSENGER_INTEGRATION", habilitada: false },
      { empresaId: tenantA.id, chave: "MESSENGER_INBOUND", habilitada: false },
      { empresaId: tenantA.id, chave: "WHATSAPP_INTEGRATION", habilitada: true },
      { empresaId: tenantA.id, chave: "WHATSAPP_INBOUND", habilitada: true },
      { empresaId: tenantA.id, chave: "INSTAGRAM_INTEGRATION", habilitada: true },
      { empresaId: tenantA.id, chave: "INSTAGRAM_INBOUND", habilitada: true },
    ],
  });
  const capabilities = await prisma.empresaFuncionalidade.findMany({
    where: { empresaId: tenantA.id },
    select: { chave: true, habilitada: true },
  });
  assert.deepEqual(capabilities.sort((left, right) => (
    left.chave.localeCompare(right.chave)
  )), [
    { chave: "INSTAGRAM_INBOUND", habilitada: true },
    { chave: "INSTAGRAM_INTEGRATION", habilitada: true },
    { chave: "MESSENGER_INBOUND", habilitada: false },
    { chave: "MESSENGER_INTEGRATION", habilitada: false },
    { chave: "WHATSAPP_INBOUND", habilitada: true },
    { chave: "WHATSAPP_INTEGRATION", habilitada: true },
  ]);
});

function messengerChannel({
  empresaId,
  chaveInterna,
  messengerPageId,
}) {
  return {
    empresaId,
    tipo: "MESSENGER_META",
    nome: "Messenger inbound real",
    chaveInterna,
    status: "INATIVO",
    modoTeste: false,
    ativo: false,
    providerEnvironment: "MESSENGER_SCHEMA_TEST",
    metaAppId: "MESSENGER_APP_SCHEMA_TEST",
    messengerPageId,
    messengerPageNameMasked: "@conta_****",
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
