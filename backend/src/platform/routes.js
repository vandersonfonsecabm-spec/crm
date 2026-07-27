const { FEATURE_KEYS, setTenantFeature } = require("../tenant-features/service");

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const MAX_REASON_LENGTH = 500;

function mountPlatformRoutes({ app, prisma, authenticate }) {
  const rateLimiter = createPlatformRateLimiter();
  const guarded = [authenticate, requirePlatformOperator, rateLimiter];

  app.get("/platform/tenants", ...guarded, route(async (req, res) => {
    const page = positiveInteger(req.query.page, 1);
    const limit = Math.min(positiveInteger(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const search = String(req.query.busca || req.query.search || "").trim();
    const where = tenantSearchWhere(search);

    const [total, tenants] = await prisma.$transaction([
      prisma.empresa.count({ where }),
      prisma.empresa.findMany({
        where,
        orderBy: [{ nome: "asc" }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          nome: true,
          slug: true,
          ativo: true,
          createdAt: true,
          updatedAt: true,
          funcionalidades: {
            where: { chave: FEATURE_KEYS.AUTOMATIONS },
            select: { habilitada: true, habilitadoEm: true, updatedAt: true },
            take: 1,
          },
        },
      }),
    ]);

    res.json({
      data: tenants.map(presentTenant),
      pagination: pagination(page, limit, total),
    });
  }));

  app.get("/platform/tenants/:tenantId", ...guarded, route(async (req, res) => {
    const tenantId = parseId(req.params.tenantId);
    if (!tenantId) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");

    const tenant = await prisma.empresa.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        nome: true,
        slug: true,
        ativo: true,
        createdAt: true,
        updatedAt: true,
        funcionalidades: {
          where: { chave: FEATURE_KEYS.AUTOMATIONS },
          select: { habilitada: true, habilitadoEm: true, updatedAt: true },
          take: 1,
        },
      },
    });
    if (!tenant) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");
    res.json(presentTenant(tenant));
  }));

  app.patch("/platform/tenants/:tenantId/capabilities/automations", ...guarded, route(async (req, res) => {
    const tenantId = parseId(req.params.tenantId);
    if (!tenantId) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");

    const validation = validateAutomationCapabilityPayload(req.body);
    if (validation.error) return platformError(res, 422, validation.error, "PLATFORM_CAPABILITY_INVALID");

    const current = await prisma.empresaFuncionalidade.findUnique({
      where: { empresaId_chave: { empresaId: tenantId, chave: FEATURE_KEYS.AUTOMATIONS } },
      select: { habilitada: true },
    });
    const tenant = await prisma.empresa.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");

    const previousEnabled = current?.habilitada === true;
    if (previousEnabled === validation.data.enabled) {
      return res.json({
        changed: false,
        capability: FEATURE_KEYS.AUTOMATIONS,
        previousEnabled,
        newEnabled: previousEnabled,
      });
    }

    await setTenantFeature({
      prisma,
      empresaId: tenantId,
      featureKey: FEATURE_KEYS.AUTOMATIONS,
      enabled: validation.data.enabled,
      operatedBy: "platform-operator",
      reason: validation.data.reason || "Operacao interna da plataforma.",
      usuarioId: req.auth.usuarioId,
      allowExternalAuditUser: true,
    });

    res.json({
      changed: true,
      capability: FEATURE_KEYS.AUTOMATIONS,
      previousEnabled,
      newEnabled: validation.data.enabled,
    });
  }));

  app.get("/platform/tenants/:tenantId/capabilities/automations/audit", ...guarded, route(async (req, res) => {
    const tenantId = parseId(req.params.tenantId);
    if (!tenantId) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");

    const page = positiveInteger(req.query.page, 1);
    const limit = Math.min(positiveInteger(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const tenant = await prisma.empresa.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");

    const where = { empresaId: tenantId, chave: FEATURE_KEYS.AUTOMATIONS };
    const [total, rows] = await prisma.$transaction([
      prisma.auditoriaFuncionalidade.count({ where }),
      prisma.auditoriaFuncionalidade.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          chave: true,
          valorAnterior: true,
          valorNovo: true,
          motivo: true,
          createdAt: true,
          usuario: { select: { id: true, nome: true } },
        },
      }),
    ]);

    res.json({
      data: rows.map((row) => ({
        id: row.id,
        capability: row.chave,
        previousEnabled: row.valorAnterior,
        newEnabled: row.valorNovo,
        reason: row.motivo,
        createdAt: row.createdAt,
        actor: row.usuario ? { id: row.usuario.id, nome: row.usuario.nome } : null,
      })),
      pagination: pagination(page, limit, total),
    });
  }));
}

function requirePlatformOperator(req, res, next) {
  if (req.auth?.isPlatformOperator !== true) {
    return platformError(res, 403, "Voce nao possui permissao para operacoes da plataforma.", "PLATFORM_FORBIDDEN");
  }
  return next();
}

function createPlatformRateLimiter({ windowMs = 60_000, max = 90 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const key = String(req.auth?.usuarioId || req.ip || "anonymous");
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) return platformError(res, 429, "Muitas operacoes em pouco tempo.", "PLATFORM_RATE_LIMITED");
    return next();
  };
}

function tenantSearchWhere(search) {
  if (!search) return {};
  return {
    OR: [
      { nome: { contains: search } },
      { slug: { contains: search } },
    ],
  };
}

function presentTenant(tenant) {
  const automation = tenant.funcionalidades?.[0] || null;
  return {
    id: tenant.id,
    nome: tenant.nome,
    slug: tenant.slug,
    ativo: tenant.ativo,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
    capabilities: {
      automations: {
        enabled: automation?.habilitada === true,
        enabledAt: automation?.habilitadoEm ?? null,
        updatedAt: automation?.updatedAt ?? null,
      },
    },
  };
}

function validateAutomationCapabilityPayload(body) {
  const input = body && typeof body === "object" ? body : {};
  const unknown = Object.keys(input).filter((key) => !["enabled", "reason"].includes(key));
  if (unknown.length) return { error: `Campos nao permitidos: ${unknown.join(", ")}.` };
  if (typeof input.enabled !== "boolean") return { error: "enabled deve ser booleano." };
  const reason = String(input.reason || "").trim().replace(/\s+/g, " ");
  if (reason.length > MAX_REASON_LENGTH) return { error: "Motivo deve ter ate 500 caracteres." };
  return { data: { enabled: input.enabled, reason } };
}

function parseId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function pagination(page, limit, total) {
  return { page, limit, total, totalPages: total > 0 ? Math.ceil(total / limit) : 0 };
}

function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("Falha em operacao da plataforma.", { code: String(error?.code || "PLATFORM_ERROR") });
      platformError(res, 500, "Nao foi possivel concluir a operacao da plataforma.", "PLATFORM_ERROR");
    }
  };
}

function platformError(res, status, erro, codigo) {
  return res.status(status).json({ erro, codigo });
}

module.exports = {
  createPlatformRateLimiter,
  mountPlatformRoutes,
};
