process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const { createChannelService } = require("../src/channels/channelService");
const { createLeadsCommunicationServices } = require("../src/leads-communication/services");

const prisma = new PrismaClient({
  datasourceUrl: requiredEnv("CRM_TEST_DATABASE_URL"),
});
const suffix = `${Date.now()}-${process.pid}`;
let tenantId;

after(async () => {
  if (tenantId) {
    await prisma.canalIntegracao.deleteMany({ where: { empresaId: tenantId } });
    await prisma.empresa.delete({ where: { id: tenantId } });
  }
  await prisma.$disconnect();
});

test("writer legado bloqueia Instagram real e preserva fixtures e outros canais", async () => {
  const tenant = await prisma.empresa.create({
    data: {
      nome: `Tenant Instagram writer ${suffix}`,
      slug: `instagram-writer-${suffix}`,
    },
  });
  tenantId = tenant.id;
  const service = createChannelService({ prisma });
  const communication = createLeadsCommunicationServices({ prisma });
  const canonical = await prisma.canalIntegracao.create({
    data: instagramChannel({
      empresaId: tenant.id,
      chaveInterna: "instagram-meta-inbound-real",
      instagramBusinessAccountId: `17890000000001-${suffix}`,
    }),
  });
  const legacy = await prisma.canalIntegracao.create({
    data: instagramChannel({
      empresaId: tenant.id,
      chaveInterna: "instagram-meta-legacy",
      instagramBusinessAccountId: `17890000000002-${suffix}`,
    }),
  });
  const testChannel = await prisma.canalIntegracao.create({
    data: {
      empresaId: tenant.id,
      tipo: "INSTAGRAM_META",
      nome: "Instagram test editable",
      chaveInterna: "instagram-meta-test",
      status: "MODO_TESTE",
      modoTeste: true,
      ativo: true,
    },
  });
  const siteForm = await prisma.canalIntegracao.create({
    data: {
      empresaId: tenant.id,
      tipo: "SITE_FORM",
      nome: "Site editable",
      chaveInterna: "site-form-editable",
      status: "ATIVO",
      modoTeste: false,
      ativo: true,
    },
  });

  for (const channel of [canonical, legacy]) {
    await assert.rejects(
      service.updateChannel({
        empresaId: tenant.id,
        id: channel.id,
        body: { nome: "Blocked mutation", ativo: true },
      }),
      (error) => error.status === 403 && error.codigo === "CHANNEL_PLATFORM_MANAGED",
    );
    const preserved = await prisma.canalIntegracao.findUnique({
      where: { id: channel.id },
    });
    assert.equal(preserved.nome, channel.nome);
    assert.equal(preserved.ativo, channel.ativo);
    assert.equal(preserved.updatedAt.toISOString(), channel.updatedAt.toISOString());
  }

  const editedTest = await service.updateChannel({
    empresaId: tenant.id,
    id: testChannel.id,
    body: { nome: "Instagram test updated" },
  });
  assert.equal(editedTest.nome, "Instagram test updated");
  const editedSite = await service.updateChannel({
    empresaId: tenant.id,
    id: siteForm.id,
    body: { nome: "Site updated" },
  });
  assert.equal(editedSite.nome, "Site updated");

  const contact = await prisma.contatoCanal.create({
    data: {
      empresaId: tenant.id,
      canalIntegracaoId: canonical.id,
      externalId: `instagram-contact-${suffix}`,
    },
  });
  const conversation = await prisma.conversaCanal.create({
    data: {
      empresaId: tenant.id,
      canalIntegracaoId: canonical.id,
      contatoCanalId: contact.id,
      status: "ABERTA",
      chaveAberta: `instagram-conversation-${suffix}`,
    },
  });
  const context = {
    empresaId: tenant.id,
    usuarioId: -1,
    papel: "ADMIN",
  };
  const detail = await communication.getConversation(context, conversation.id);
  assert.equal(detail.podeResponderDiretamente, false);
  await assert.rejects(
    communication.createSimulatedMessage(context, conversation.id, {
      externalId: `instagram-outbound-${suffix}`,
      direcao: "SAIDA",
      texto: "Mensagem bloqueada",
    }),
    (error) => (
      error.status === 409
      && error.codigo === "CHANNEL_DIRECT_REPLY_UNAVAILABLE"
    ),
  );
  assert.equal(await prisma.mensagemCanal.count({
    where: { conversaCanalId: conversation.id },
  }), 0);
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

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} deve ser definido pelo supervisor de testes.`);
  return value;
}
