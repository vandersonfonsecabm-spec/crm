const FEATURE_KEYS = Object.freeze({
  LEADS_COMMUNICATION: "LEADS_COMMUNICATION",
  SITE_LEAD_CAPTURE: "SITE_LEAD_CAPTURE",
  NEGOCIOS_KANBAN: "NEGOCIOS_KANBAN",
});

const FEATURE_ENV_KEYS = Object.freeze({
  [FEATURE_KEYS.LEADS_COMMUNICATION]: "LEADS_COMMUNICATION_ENABLED",
  [FEATURE_KEYS.SITE_LEAD_CAPTURE]: "SITE_LEAD_CAPTURE_ENABLED",
  [FEATURE_KEYS.NEGOCIOS_KANBAN]: "NEGOCIOS_KANBAN_ENABLED",
});

function isGlobalFeatureEnabled(featureKey, env = process.env) {
  if (featureKey === FEATURE_KEYS.SITE_LEAD_CAPTURE) {
    return env.LEADS_COMMUNICATION_ENABLED === "true" && env.SITE_LEAD_CAPTURE_ENABLED === "true";
  }
  const envKey = FEATURE_ENV_KEYS[featureKey];
  return Boolean(envKey) && env[envKey] === "true";
}

async function isFeatureEnabledForTenant({ prisma, empresaId, featureKey, env = process.env }) {
  if (!isGlobalFeatureEnabled(featureKey, env) || !isValidTenantInput(empresaId, featureKey)) return false;

  try {
    const feature = await prisma.empresaFuncionalidade.findUnique({
      where: { empresaId_chave: { empresaId, chave: featureKey } },
      select: { habilitada: true },
    });
    return feature?.habilitada === true;
  } catch (error) {
    console.error("Falha ao consultar funcionalidade do tenant.", safeFeatureError(error, featureKey));
    return false;
  }
}

async function capabilitiesForTenant({ prisma, empresaId, env = process.env }) {
  const globallyEnabled = Object.values(FEATURE_KEYS).filter((key) => isGlobalFeatureEnabled(key, env));
  const disabled = { leadsCommunication: false, siteLeadCapture: false, negociosKanban: false };
  if (!Number.isInteger(empresaId) || empresaId < 1 || globallyEnabled.length === 0) return disabled;

  try {
    const features = await prisma.empresaFuncionalidade.findMany({
      where: { empresaId, chave: { in: globallyEnabled }, habilitada: true },
      select: { chave: true },
    });
    const enabled = new Set(features.map((item) => item.chave));
    return {
      leadsCommunication: enabled.has(FEATURE_KEYS.LEADS_COMMUNICATION),
      siteLeadCapture: enabled.has(FEATURE_KEYS.SITE_LEAD_CAPTURE),
      negociosKanban: enabled.has(FEATURE_KEYS.NEGOCIOS_KANBAN),
    };
  } catch (error) {
    console.error("Falha ao carregar funcionalidades do tenant.", safeFeatureError(error));
    return disabled;
  }
}

function createTenantFeatureMiddleware({ prisma, featureKey }) {
  return async function tenantFeatureMiddleware(req, res, next) {
    const empresaId = req.auth?.empresaId;
    const enabled = await isFeatureEnabledForTenant({ prisma, empresaId, featureKey });
    if (!enabled) return res.status(404).json({ erro: "Recurso nao encontrado.", codigo: "NOT_FOUND" });
    return next();
  };
}

async function setTenantFeature({ prisma, empresaId, featureKey, enabled, operatedBy, reason, usuarioId = null }) {
  validateFeatureChange({ empresaId, featureKey, enabled, operatedBy, reason, usuarioId });

  return prisma.$transaction(async (tx) => {
    const empresa = await tx.empresa.findUnique({ where: { id: empresaId }, select: { id: true } });
    if (!empresa) throw featureChangeError("Empresa nao encontrada.");

    if (usuarioId !== null) {
      const usuario = await tx.usuario.findFirst({ where: { id: usuarioId, empresaId }, select: { id: true } });
      if (!usuario) throw featureChangeError("Usuario de auditoria invalido para a empresa.");
    }

    const current = await tx.empresaFuncionalidade.findUnique({
      where: { empresaId_chave: { empresaId, chave: featureKey } },
    });
    const now = new Date();
    const feature = await tx.empresaFuncionalidade.upsert({
      where: { empresaId_chave: { empresaId, chave: featureKey } },
      create: {
        empresaId,
        chave: featureKey,
        habilitada: enabled,
        habilitadoEm: enabled ? now : null,
        habilitadoPorUsuarioId: enabled ? usuarioId : null,
      },
      update: {
        habilitada: enabled,
        habilitadoEm: enabled ? now : null,
        habilitadoPorUsuarioId: enabled ? usuarioId : null,
      },
    });

    const audit = await tx.auditoriaFuncionalidade.create({
      data: {
        empresaId,
        funcionalidadeId: feature.id,
        chave: featureKey,
        valorAnterior: current?.habilitada ?? null,
        valorNovo: enabled,
        operadoPor: operatedBy.trim(),
        usuarioId,
        motivo: reason.trim(),
      },
    });
    return { feature, audit };
  });
}

function validateFeatureChange({ empresaId, featureKey, enabled, operatedBy, reason, usuarioId }) {
  if (!Number.isInteger(empresaId) || empresaId < 1) throw featureChangeError("Empresa invalida.");
  if (!Object.values(FEATURE_KEYS).includes(featureKey)) throw featureChangeError("Funcionalidade invalida.");
  if (typeof enabled !== "boolean") throw featureChangeError("Valor da funcionalidade invalido.");
  if (!String(operatedBy || "").trim() || String(operatedBy).trim().length > 120) throw featureChangeError("Operador invalido.");
  if (!String(reason || "").trim() || String(reason).trim().length > 500) throw featureChangeError("Motivo invalido.");
  if (usuarioId !== null && (!Number.isInteger(usuarioId) || usuarioId < 1)) throw featureChangeError("Usuario de auditoria invalido.");
}

function isValidTenantInput(empresaId, featureKey) {
  return Number.isInteger(empresaId) && empresaId > 0 && Object.values(FEATURE_KEYS).includes(featureKey);
}

function safeFeatureError(error, featureKey) {
  return { featureKey, code: String(error?.code || "FEATURE_QUERY_ERROR") };
}

function featureChangeError(message) {
  const error = new Error(message);
  error.code = "TENANT_FEATURE_CHANGE_INVALID";
  return error;
}

module.exports = {
  FEATURE_KEYS,
  capabilitiesForTenant,
  createTenantFeatureMiddleware,
  isFeatureEnabledForTenant,
  isGlobalFeatureEnabled,
  setTenantFeature,
};
