const bcrypt = require("bcryptjs");
const { validateCompanyRegistration } = require("../auth");
const { FEATURE_KEYS, setTenantFeature } = require("../tenant-features/service");
const {
  createWhatsappInboundProvisioningService,
} = require("./whatsappInboundProvisioning");
const {
  createInstagramInboundProvisioningService,
} = require("./instagramInboundProvisioning");
const {
  createMessengerInboundProvisioningService,
} = require("./messengerInboundProvisioning");
const {
  createEmailInboundProvisioningService,
} = require("./emailInboundProvisioning");
const {
  createWhatsappInboundLifecycleService,
} = require("../integrations/whatsappInboundLifecycle");
const {
  createInstagramInboundLifecycleService,
} = require("../integrations/instagramInboundLifecycle");
const {
  createMessengerInboundLifecycleService,
} = require("../integrations/messengerInboundLifecycle");
const {
  createEmailInboundLifecycleService,
} = require("../integrations/emailInboundLifecycle");
const { isEmailError } = require("../integrations/emailFoundation");

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const MAX_REASON_LENGTH = 500;

function mountPlatformRoutes({ app, prisma, authenticate }) {
  const rateLimiter = createPlatformRateLimiter();
  const guarded = [authenticate, requirePlatformOperator, rateLimiter];
  const whatsappInboundProvisioning = createWhatsappInboundProvisioningService({ prisma });
  const whatsappInboundLifecycle = createWhatsappInboundLifecycleService({ prisma });
  const instagramInboundProvisioning = createInstagramInboundProvisioningService({ prisma });
  const instagramInboundLifecycle = createInstagramInboundLifecycleService({ prisma });
  const messengerInboundProvisioning = createMessengerInboundProvisioningService({ prisma });
  const messengerInboundLifecycle = createMessengerInboundLifecycleService({ prisma });
  const emailInboundProvisioning = createEmailInboundProvisioningService({ prisma });
  const emailInboundLifecycle = createEmailInboundLifecycleService({ prisma });

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

  app.post("/platform/tenants", ...guarded, route(async (req, res) => {
    const validation = validateTenantCreationPayload(req.body);
    if (validation.error) return platformError(res, 422, validation.error, "PLATFORM_TENANT_INVALID");

    const { empresaNome, slug, adminNome, email, senha } = validation.data;
    const existing = await findTenantProvisioningConflict(prisma, { slug, email });
    if (existing) return platformError(res, 409, existing.message, existing.code);

    const senhaHash = await bcrypt.hash(senha, 12);
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const repeated = await findTenantProvisioningConflict(tx, { slug, email });
        if (repeated) throw tenantProvisioningConflict(repeated.message, repeated.code);

        const empresa = await tx.empresa.create({
          data: {
            nome: empresaNome,
            slug,
          },
        });
        const usuario = await tx.usuario.create({
          data: {
            empresaId: empresa.id,
            nome: adminNome,
            email,
            senhaHash,
            papel: "ADMIN",
          },
        });
        await tx.platformTenantAudit.create({
          data: {
            actorUserId: req.auth.usuarioId,
            tenantId: empresa.id,
            action: "TENANT_CREATED",
            tenantName: empresa.nome,
            tenantSlug: empresa.slug,
            adminUserId: usuario.id,
          },
        });
        return { empresa, usuario };
      });
    } catch (error) {
      if (error?.code === "PLATFORM_TENANT_CONFLICT" || error?.code === "P2002") {
        return platformError(res, 409, "Tenant ou e-mail ja cadastrado.", "PLATFORM_TENANT_CONFLICT");
      }
      throw error;
    }

    res.status(201).json({
      tenant: presentTenant({ ...result.empresa, funcionalidades: [] }),
      admin: {
        id: result.usuario.id,
        nome: result.usuario.nome,
        email: result.usuario.email,
        papel: result.usuario.papel,
        ativo: result.usuario.ativo,
      },
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

  app.put("/platform/tenants/:tenantId/integrations/whatsapp/inbound", ...guarded, route(async (req, res) => {
    const tenantId = parseId(req.params.tenantId);
    if (!tenantId) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");

    try {
      const result = await whatsappInboundProvisioning.provision({
        tenantId,
        actorUserId: req.auth.usuarioId,
        body: req.body,
        correlationId: req.get("x-correlation-id"),
      });
      return res.status(result.created ? 201 : 200).json(result.body);
    } catch (error) {
      if (Number.isInteger(error?.status) && /^WHATSAPP_|^PLATFORM_/.test(String(error?.code || ""))) {
        return platformError(res, error.status, error.message, error.code);
      }
      throw error;
    }
  }));

  app.put("/platform/tenants/:tenantId/integrations/instagram/inbound", ...guarded, route(async (req, res) => {
    const tenantId = parseId(req.params.tenantId);
    if (!tenantId) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");

    try {
      const result = await instagramInboundProvisioning.provision({
        tenantId,
        actorUserId: req.auth.usuarioId,
        body: req.body,
        correlationId: req.get("x-correlation-id"),
      });
      return res.status(result.created ? 201 : 200).json(result.body);
    } catch (error) {
      if (isInstagramPlatformError(error)) {
        return platformError(res, error.status, error.message, error.code);
      }
      throw error;
    }
  }));

  app.put("/platform/tenants/:tenantId/integrations/messenger/inbound", ...guarded, route(async (req, res) => {
    const tenantId = parseId(req.params.tenantId);
    if (!tenantId) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");

    try {
      const result = await messengerInboundProvisioning.provision({
        tenantId,
        actorUserId: req.auth.usuarioId,
        body: req.body,
        correlationId: req.get("x-correlation-id"),
      });
      return res.status(result.created ? 201 : 200).json(result.body);
    } catch (error) {
      if (isMessengerPlatformError(error)) {
        return platformError(res, error.status, error.message, error.code);
      }
      throw error;
    }
  }));

  app.put("/platform/tenants/:tenantId/integrations/email/inbound", ...guarded, route(async (req, res) => {
    const tenantId = parseId(req.params.tenantId);
    if (!tenantId) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");
    try {
      const result = await emailInboundProvisioning.provision({ tenantId, actorUserId: req.auth.usuarioId, body: req.body, correlationId: req.get("x-correlation-id") });
      return res.status(result.created ? 201 : 200).json(result.body);
    } catch (error) {
      if (isEmailError(error)) return platformError(res, error.status, error.message, error.code);
      throw error;
    }
  }));

  app.get("/platform/tenants/:tenantId/integrations/email/inbound/status", ...guarded, route(async (req, res) => {
    const tenantId = parseId(req.params.tenantId);
    if (!tenantId) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");
    try {
      return res.json(await emailInboundLifecycle.getStatus({ tenantId }));
    } catch (error) {
      if (isEmailError(error)) return platformError(res, error.status, error.message, error.code);
      throw error;
    }
  }));

  for (const [path, action] of [["activate", "activate"], ["pause", "pause"], ["reactivate", "reactivate"]]) {
    app.post(`/platform/tenants/:tenantId/integrations/email/inbound/${path}`, ...guarded, route(async (req, res) => {
      const tenantId = parseId(req.params.tenantId);
      if (!tenantId) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");
      try {
        return res.json(await emailInboundLifecycle[action]({ tenantId, actorUserId: req.auth.usuarioId, body: req.body, correlationId: req.get("x-correlation-id") }));
      } catch (error) {
        if (isEmailError(error)) return platformError(res, error.status, error.message, error.code);
        throw error;
      }
    }));
  }

  app.get("/platform/tenants/:tenantId/integrations/messenger/inbound/status", ...guarded, route(async (req, res) => {
    const tenantId = parseId(req.params.tenantId);
    if (!tenantId) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");

    try {
      return res.json(await messengerInboundLifecycle.getStatus({ tenantId }));
    } catch (error) {
      if (isMessengerPlatformError(error)) {
        return platformError(res, error.status, error.message, error.code);
      }
      throw error;
    }
  }));

  for (const [path, action] of [
    ["activate", "activate"],
    ["pause", "pause"],
    ["reactivate", "reactivate"],
  ]) {
    app.post(`/platform/tenants/:tenantId/integrations/messenger/inbound/${path}`, ...guarded, route(async (req, res) => {
      const tenantId = parseId(req.params.tenantId);
      if (!tenantId) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");

      try {
        return res.json(await messengerInboundLifecycle[action]({
          tenantId,
          actorUserId: req.auth.usuarioId,
          body: req.body,
          correlationId: req.get("x-correlation-id"),
        }));
      } catch (error) {
        if (isMessengerPlatformError(error)) {
          return platformError(res, error.status, error.message, error.code);
        }
        throw error;
      }
    }));
  }

  app.get("/platform/tenants/:tenantId/integrations/instagram/inbound/status", ...guarded, route(async (req, res) => {
    const tenantId = parseId(req.params.tenantId);
    if (!tenantId) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");

    try {
      return res.json(await instagramInboundLifecycle.getStatus({ tenantId }));
    } catch (error) {
      if (isInstagramPlatformError(error)) {
        return platformError(res, error.status, error.message, error.code);
      }
      throw error;
    }
  }));

  for (const [path, action] of [
    ["activate", "activate"],
    ["pause", "pause"],
    ["reactivate", "reactivate"],
  ]) {
    app.post(`/platform/tenants/:tenantId/integrations/instagram/inbound/${path}`, ...guarded, route(async (req, res) => {
      const tenantId = parseId(req.params.tenantId);
      if (!tenantId) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");

      try {
        return res.json(await instagramInboundLifecycle[action]({
          tenantId,
          actorUserId: req.auth.usuarioId,
          body: req.body,
          correlationId: req.get("x-correlation-id"),
        }));
      } catch (error) {
        if (isInstagramPlatformError(error)) {
          return platformError(res, error.status, error.message, error.code);
        }
        throw error;
      }
    }));
  }

  app.get("/platform/tenants/:tenantId/integrations/whatsapp/inbound/status", ...guarded, route(async (req, res) => {
    const tenantId = parseId(req.params.tenantId);
    if (!tenantId) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");

    try {
      return res.json(await whatsappInboundLifecycle.getStatus({ tenantId }));
    } catch (error) {
      if (isWhatsappPlatformError(error)) {
        return platformError(res, error.status, error.message, error.code);
      }
      throw error;
    }
  }));

  for (const [path, action] of [
    ["activate", "activate"],
    ["pause", "pause"],
    ["reactivate", "reactivate"],
  ]) {
    app.post(`/platform/tenants/:tenantId/integrations/whatsapp/inbound/${path}`, ...guarded, route(async (req, res) => {
      const tenantId = parseId(req.params.tenantId);
      if (!tenantId) return platformError(res, 404, "Tenant nao encontrado.", "PLATFORM_TENANT_NOT_FOUND");

      try {
        return res.json(await whatsappInboundLifecycle[action]({
          tenantId,
          actorUserId: req.auth.usuarioId,
          body: req.body,
          correlationId: req.get("x-correlation-id"),
        }));
      } catch (error) {
        if (isWhatsappPlatformError(error)) {
          return platformError(res, error.status, error.message, error.code);
        }
        throw error;
      }
    }));
  }

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

function validateTenantCreationPayload(body) {
  const input = body && typeof body === "object" ? body : {};
  const unknown = Object.keys(input).filter((key) => !["companyName", "slug", "adminName", "adminEmail", "adminPassword"].includes(key));
  if (unknown.length) return { error: `Campos nao permitidos: ${unknown.join(", ")}.` };
  const mapped = {
    empresaNome: input.companyName,
    adminNome: input.adminName,
    email: input.adminEmail,
    senha: input.adminPassword,
    slug: input.slug,
  };
  const validation = validateCompanyRegistration(mapped);
  if (validation.error) return validation;
  return validation;
}

async function findTenantProvisioningConflict(prismaClient, { slug, email }) {
  const [tenant, user] = await Promise.all([
    prismaClient.empresa.findUnique({ where: { slug }, select: { id: true } }),
    prismaClient.usuario.findFirst({ where: { email }, select: { id: true } }),
  ]);
  if (tenant) return { code: "PLATFORM_TENANT_SLUG_EXISTS", message: "Slug de tenant ja cadastrado." };
  if (user) return { code: "PLATFORM_TENANT_EMAIL_EXISTS", message: "E-mail de administrador ja cadastrado." };
  return null;
}

function tenantProvisioningConflict(message, code) {
  const error = new Error(message);
  error.code = "PLATFORM_TENANT_CONFLICT";
  error.publicCode = code;
  return error;
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

function isWhatsappPlatformError(error) {
  return Number.isInteger(error?.status)
    && (/^WHATSAPP_|^PLATFORM_/).test(String(error?.code || ""));
}

function isInstagramPlatformError(error) {
  return Number.isInteger(error?.status)
    && (/^INSTAGRAM_|^PLATFORM_/).test(String(error?.code || ""));
}

function isMessengerPlatformError(error) {
  return Number.isInteger(error?.status)
    && (/^MESSENGER_|^PLATFORM_/).test(String(error?.code || ""));
}

module.exports = {
  createPlatformRateLimiter,
  mountPlatformRoutes,
};
