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

test("writer legado bloqueia Messenger real e preserva fixtures e outros canais", async () => {
  const tenant = await prisma.empresa.create({
    data: {
      nome: `Tenant Messenger writer ${suffix}`,
      slug: `messenger-writer-${suffix}`,
    },
  });
  tenantId = tenant.id;
  const service = createChannelService({ prisma });
  const communication = createLeadsCommunicationServices({ prisma });
  const canonical = await prisma.canalIntegracao.create({
    data: messengerChannel({
      empresaId: tenant.id,
      chaveInterna: "messenger-meta-inbound-real",
      messengerPageId: `17890000000001-${suffix}`,
    }),
  });
  const legacy = await prisma.canalIntegracao.create({
    data: messengerChannel({
      empresaId: tenant.id,
      chaveInterna: "messenger-meta-legacy",
      messengerPageId: `17890000000002-${suffix}`,
    }),
  });
  const testChannel = await prisma.canalIntegracao.create({
    data: {
      empresaId: tenant.id,
      tipo: "MESSENGER_META",
      nome: "Messenger test editable",
      chaveInterna: "messenger-meta-test",
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
  const whatsapp = await prisma.canalIntegracao.create({
    data: {
      empresaId: tenant.id,
      tipo: "WHATSAPP_META",
      nome: "WhatsApp test reply",
      chaveInterna: "whatsapp-meta-messenger-guard",
      status: "MODO_TESTE",
      modoTeste: true,
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
    body: { nome: "Messenger test updated" },
  });
  assert.equal(editedTest.nome, "Messenger test updated");
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
      externalId: `messenger-contact-${suffix}`,
    },
  });
  const conversation = await prisma.conversaCanal.create({
    data: {
      empresaId: tenant.id,
      canalIntegracaoId: canonical.id,
      contatoCanalId: contact.id,
      status: "ABERTA",
      chaveAberta: `messenger-conversation-${suffix}`,
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
    service.registerSimulatedMessage({
      empresaId: tenant.id,
      canalIntegracaoId: canonical.id,
      conversaCanalId: conversation.id,
      externalId: `messenger-internal-writer-${suffix}`,
      direcao: "ENTRADA",
      texto: "Mensagem bloqueada pelo writer interno",
    }),
    (error) => error.status === 403 && error.codigo === "CHANNEL_PLATFORM_MANAGED",
  );
  await assert.rejects(
    communication.createSimulatedMessage(context, conversation.id, {
      externalId: `messenger-outbound-${suffix}`,
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

  const whatsappContact = await prisma.contatoCanal.create({
    data: {
      empresaId: tenant.id,
      canalIntegracaoId: whatsapp.id,
      externalId: `whatsapp-contact-${suffix}`,
    },
  });
  const whatsappConversation = await prisma.conversaCanal.create({
    data: {
      empresaId: tenant.id,
      canalIntegracaoId: whatsapp.id,
      contatoCanalId: whatsappContact.id,
      status: "ABERTA",
      chaveAberta: `whatsapp-conversation-${suffix}`,
    },
  });
  const whatsappDetail = await communication.getConversation(context, whatsappConversation.id);
  assert.equal(whatsappDetail.podeResponderDiretamente, true);
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

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} deve ser definido pelo supervisor de testes.`);
  return value;
}
