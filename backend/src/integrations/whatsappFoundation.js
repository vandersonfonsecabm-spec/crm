const WHATSAPP_OPERATIONAL_STATUS = Object.freeze({
  NOT_CONFIGURED: "NOT_CONFIGURED",
  CONFIGURED: "CONFIGURED",
});

function createWhatsAppFoundationService({ prisma }) {
  async function getOperationalStatus({ empresaId }) {
    const channel = await prisma.canalIntegracao.findFirst({
      where: {
        empresaId,
        tipo: "WHATSAPP_META",
        ativo: true,
        modoTeste: false,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        providerEnvironment: true,
        metaAppId: true,
        wabaId: true,
        phoneNumberId: true,
        graphApiVersion: true,
        accessTokenRef: true,
        credentialStatus: true,
        connectedAt: true,
        verifiedAt: true,
        lastWebhookAt: true,
        lastFailureAt: true,
      },
    });

    if (!isLocallyConfigured(channel)) {
      return { status: WHATSAPP_OPERATIONAL_STATUS.NOT_CONFIGURED, ready: false };
    }

    return {
      status: WHATSAPP_OPERATIONAL_STATUS.CONFIGURED,
      ready: true,
      connectedAt: channel.connectedAt,
      verifiedAt: channel.verifiedAt,
      lastWebhookAt: channel.lastWebhookAt,
      lastFailureAt: channel.lastFailureAt,
    };
  }

  return { getOperationalStatus };
}

function isLocallyConfigured(channel) {
  return Boolean(
    channel
      && channel.providerEnvironment
      && channel.metaAppId
      && channel.wabaId
      && channel.phoneNumberId
      && channel.graphApiVersion
      && channel.accessTokenRef
      && channel.credentialStatus === "ATIVA",
  );
}

module.exports = {
  WHATSAPP_OPERATIONAL_STATUS,
  createWhatsAppFoundationService,
  isLocallyConfigured,
};
