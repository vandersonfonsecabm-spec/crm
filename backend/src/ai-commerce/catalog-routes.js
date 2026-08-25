"use strict";

const { createCommercialCatalogService } = require("./catalog");
const { createSellableAvailabilityService } = require("./availability");
const { createCommercialSearchService } = require("./search");
const { createProductOfferService } = require("./offer");
const { CommerceCatalogError } = require("./common");

/**
 * Isolated route module. The integrator decides where to mount it and which
 * feature-flag gate to provide; this file never mutates the main server.
 */
function mountCatalogRoutes({ app, prisma, authenticate, requireRole, enabledForTenant = () => true, env = process.env, clock, policy = {} } = {}) {
  if (!app || !prisma || typeof authenticate !== "function") throw new Error("AI_COMMERCE_ROUTE_DEPENDENCY_MISSING");
  const catalog = createCommercialCatalogService({ prisma, clock, policy });
  const availability = createSellableAvailabilityService({ prisma, clock, policy, catalogService: catalog });
  const search = createCommercialSearchService({ prisma, availabilityService: availability, policy });
  const offer = createProductOfferService({ prisma, catalogService: catalog, availabilityService: availability, clock, policy });

  const readGuard = guard(authenticate, requireRole, ["ADMIN", "GERENTE", "VENDEDOR"]);
  const writeGuard = guard(authenticate, requireRole, ["ADMIN", "GERENTE"]);
  const route = (handler) => async (req, res) => {
    try {
      const empresaId = tenantFromRequest(req);
      if (!(await enabledForTenant(empresaId, req, env))) return res.status(404).json({ error: { code: "AI_COMMERCE_DISABLED", message: "Recurso nao encontrado." } });
      return await handler(req, res, empresaId);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      const code = typeof error?.code === "string" ? error.code : "AI_COMMERCE_INTERNAL_ERROR";
      return res.status(status).json({ error: { code, message: status >= 500 ? "Operacao comercial indisponivel." : String(error?.message || "Operacao invalida.") } });
    }
  };

  app.get("/catalogo-comercial", ...readGuard, route(async (req, res, empresaId) => res.json(await catalog.list({ empresaId, cursor: req.query.cursor, limit: req.query.limit, includeHidden: isManager(req), category: req.query.category, brand: req.query.brand, visibility: isManager(req) ? req.query.visibility : null }))));
  app.get("/catalogo-comercial/produtos", ...readGuard, route(async (req, res, empresaId) => res.json(await catalog.list({ empresaId, cursor: req.query.cursor, limit: req.query.limit, includeHidden: isManager(req), category: req.query.category, brand: req.query.brand, visibility: isManager(req) ? req.query.visibility : null }))));
  app.get("/catalogo-comercial/produtos/:id", ...readGuard, route(async (req, res, empresaId) => {
    const product = await catalog.get(empresaId, req.params.id, { includeHidden: isManager(req) });
    return res.json({ item: catalog.normalizePublic(product) });
  }));
  app.post("/catalogo-comercial/produtos", ...writeGuard, route(async (req, res, empresaId) => res.status(201).json({ item: await catalog.create({ empresaId, data: req.body || {}, actorUsuarioId: req.auth?.usuarioId }) })));
  app.patch("/catalogo-comercial/produtos/:id", ...writeGuard, route(async (req, res, empresaId) => res.json({ item: await catalog.update({ empresaId, catalogProductId: req.params.id, data: req.body || {}, expectedRevision: req.body?.revision ?? null }) })));
  app.post("/catalogo-comercial/produtos/:id/publicar", ...writeGuard, route(async (req, res, empresaId) => res.json({ item: await catalog.publish({ empresaId, catalogProductId: req.params.id, expectedRevision: req.body?.revision ?? null }) })));
  app.post("/catalogo-comercial/produtos/:id/arquivar", ...writeGuard, route(async (req, res, empresaId) => res.json({ item: await catalog.archive({ empresaId, catalogProductId: req.params.id, expectedRevision: req.body?.revision ?? null }) })));
  app.get("/catalogo-comercial/busca", ...readGuard, route(async (req, res, empresaId) => res.json(await search.search({ empresaId, query: req.query.q || req.query.query || "", category: req.query.category, brand: req.query.brand, minPrice: req.query.minPrice, maxPrice: req.query.maxPrice, availability: req.query.availability, visibility: isManager(req) ? req.query.visibility : null, includeAvailability: req.query.includeAvailability === "true", limit: req.query.limit }))));
  app.get("/catalogo-comercial/produtos/:id/disponibilidade", ...readGuard, route(async (req, res, empresaId) => res.json({ item: await availability.getSellableAvailability({ empresaId, catalogProductId: req.params.id, quantity: req.query.quantity, locationId: req.query.locationId }) })));
  app.post("/catalogo-comercial/ofertas/preview", ...readGuard, route(async (req, res, empresaId) => res.status(201).json({ item: await offer.create({ empresaId, catalogProductId: req.body?.catalogProductId, conversationId: req.body?.conversationId, customerId: req.body?.customerId, correlationId: req.get?.("X-Correlation-Id") || null }) })));
  app.get("/catalogo-comercial/ofertas/:id", ...readGuard, route(async (req, res, empresaId) => res.json({ item: await offer.get({ empresaId, offerId: req.params.id }) })));
}

function guard(authenticate, requireRole, roles) {
  const result = [authenticate];
  if (typeof requireRole === "function") result.push(requireRole(...roles));
  return result;
}
function tenantFromRequest(req) {
  const empresaId = Number(req.auth?.empresaId ?? req.user?.empresaId);
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0) throw new CommerceCatalogError("COMMERCE_TENANT_CONTEXT_INVALID", "Contexto de empresa invalido.", 401);
  return empresaId;
}
function isManager(req) { return ["ADMIN", "GERENTE"].includes(String(req.auth?.papel || req.user?.papel || "").toUpperCase()); }

module.exports = { mountCatalogRoutes, tenantFromRequest };
