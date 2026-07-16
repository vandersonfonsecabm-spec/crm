const crypto = require("node:crypto");
const { createSiteLeadRateLimiter } = require("./rateLimiter");
const { createSiteLeadService, isEnabled } = require("./service");
const { isHoneypotFilled } = require("./validation");

const MAX_BODY_BYTES = 32 * 1024;

function siteLeadBodyLimit(req, res, next) {
  if (!req.path.startsWith("/public/site-leads/")) return next();
  const length = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return res.status(413).json({ accepted: false, erro: "Formulario maior que o limite permitido.", codigo: "BODY_TOO_LARGE" });
  return next();
}

function mountSiteLeadPublicRoutes({ app, prisma, rateLimiter = createSiteLeadRateLimiter() }) {
  const service = createSiteLeadService({ prisma });

  app.options("/public/site-leads/:publicId", async (req, res) => {
    if (!isEnabled()) return res.sendStatus(404);
    const integration = await service.getPublicIntegration(req.params.publicId);
    if (!integration || !service.isOriginAllowed(integration, req.headers.origin)) return res.status(integration ? 403 : 404).json({ accepted: false, erro: "Recurso indisponivel.", codigo: "SITE_CAPTURE_UNAVAILABLE" });
    setCors(res, req.headers.origin);
    return res.sendStatus(204);
  });

  app.post("/public/site-leads/:publicId", async (req, res) => {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();
    try {
      if (!isEnabled()) return res.sendStatus(404);
      const integration = await service.getPublicIntegration(req.params.publicId);
      if (!integration) return res.sendStatus(404);
      const origin = req.headers.origin;
      if (!service.isOriginAllowed(integration, origin)) return res.status(403).json({ accepted: false, erro: "Origem nao permitida.", codigo: "ORIGIN_NOT_ALLOWED" });
      setCors(res, origin);
      if (Buffer.byteLength(JSON.stringify(req.body || {}), "utf8") > MAX_BODY_BYTES) return res.status(413).json({ accepted: false, erro: "Formulario maior que o limite permitido.", codigo: "BODY_TOO_LARGE" });
      rateLimiter.consume({ publicId: integration.publicId, ip: req.ip });
      if (isHoneypotFilled(req.body)) {
        safeLog({ requestId, integrationId: integration.id, result: "HONEYPOT_IGNORED", durationMs: Date.now() - startedAt });
        return res.status(202).json({ accepted: true, submissionId: safeSubmissionId(req.body?.submissionId) });
      }
      const result = await service.capture(integration, req.body);
      safeLog({ requestId, integrationId: integration.id, result: result.idempotent ? "IDEMPOTENT" : "ACCEPTED", durationMs: Date.now() - startedAt });
      return res.status(202).json({ accepted: true, submissionId: result.submissionId });
    } catch (error) {
      safeLog({ requestId, result: "ERROR", code: error?.codigo || error?.code || "INTERNAL_ERROR", durationMs: Date.now() - startedAt });
      return handleError(res, error);
    }
  });
}

function mountSiteLeadAdminRoutes({ app, prisma, authenticate, requireRole }) {
  const service = createSiteLeadService({ prisma });
  const guarded = [siteFeatureFlag, authenticate, requireRole("ADMIN")];
  const route = (handler) => async (req, res) => { try { await handler(req, res, authContext(req), service); } catch (error) { handleError(res, error); } };
  app.get("/canais/site-form", ...guarded, route(async (req, res, context, api) => res.json({ data: await api.listIntegrations(context) })));
  app.post("/canais/site-form", ...guarded, route(async (req, res, context, api) => res.status(201).json(await api.createIntegration(context, req.body))));
  app.patch("/canais/site-form/:id", ...guarded, route(async (req, res, context, api) => res.json(await api.updateIntegration(context, pathId(req), req.body))));
  app.post("/canais/site-form/:id/rotacionar", ...guarded, route(async (req, res, context, api) => res.json(await api.rotatePublicId(context, pathId(req)))));
}

function siteFeatureFlag(req, res, next) { if (!isEnabled()) return res.sendStatus(404); return next(); }
function authContext(req) { return { empresaId: req.auth.empresaId, usuarioId: req.auth.usuarioId, papel: req.auth.papel }; }
function pathId(req) { const id = Number(req.params.id); if (!Number.isInteger(id) || id < 1) { const error = new Error("ID invalido."); error.status = 400; error.codigo = "VALIDATION_ERROR"; throw error; } return id; }
function setCors(res, origin) { res.set("Access-Control-Allow-Origin", origin); res.set("Vary", "Origin"); res.set("Access-Control-Allow-Methods", "POST, OPTIONS"); res.set("Access-Control-Allow-Headers", "Content-Type"); }
function safeSubmissionId(value) { return /^[0-9a-f-]{36}$/i.test(String(value || "")) ? String(value).toLowerCase() : crypto.randomUUID(); }
function safeLog(value) { console.info(JSON.stringify({ scope: "site_lead_capture", ...value })); }
function handleError(res, error) { if (res.headersSent) return; const status = Number.isInteger(error?.status) ? error.status : error?.code === "P2002" ? 409 : 500; return res.status(status).json({ accepted: false, erro: status >= 500 ? "Nao foi possivel receber sua mensagem agora." : error.message, codigo: status >= 500 ? "INTERNAL_ERROR" : error.codigo || "REQUEST_ERROR", ...(status === 400 && error.campos ? { campos: error.campos } : {}) }); }

module.exports = { MAX_BODY_BYTES, mountSiteLeadAdminRoutes, mountSiteLeadPublicRoutes, siteLeadBodyLimit };
