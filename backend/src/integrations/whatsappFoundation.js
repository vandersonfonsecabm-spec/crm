const {
  WHATSAPP_OPERATIONAL_STATUS,
  createWhatsappInboundLifecycleService,
} = require("./whatsappInboundLifecycle");

function createWhatsAppFoundationService({ prisma, env = process.env }) {
  const lifecycle = createWhatsappInboundLifecycleService({ prisma, env });

  async function getOperationalStatus({ empresaId }) {
    const result = await lifecycle.getStatus({ tenantId: empresaId });
    if (result.state === WHATSAPP_OPERATIONAL_STATUS.NOT_CONFIGURED) {
      return { canalIntegracaoId: result.canalIntegracaoId || null, status: result.state, ready: false };
    }
    return {
      canalIntegracaoId: result.canalIntegracaoId,
      credentialConfigured: result.credentialConfigured,
      status: result.state,
      ready: result.ready,
      connectedAt: result.connectedAt,
      verifiedAt: result.verifiedAt,
      lastWebhookAt: result.lastWebhookAt,
      lastFailureAt: result.lastFailureAt,
    };
  }

  return { getOperationalStatus };
}

module.exports = {
  WHATSAPP_OPERATIONAL_STATUS,
  createWhatsAppFoundationService,
};
