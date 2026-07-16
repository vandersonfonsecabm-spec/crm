const MANAGER_ROLES = new Set(["ADMIN", "GERENTE"]);
const KNOWN_ROLES = new Set(["ADMIN", "GERENTE", "VENDEDOR"]);

function isLeadsCommunicationEnabled(env = process.env) {
  return env.LEADS_COMMUNICATION_ENABLED === "true";
}

function featureFlagMiddleware(req, res, next) {
  if (!isLeadsCommunicationEnabled()) {
    return res.status(404).json({ erro: "Recurso nao encontrado.", codigo: "NOT_FOUND" });
  }
  return next();
}

function authContext(req) {
  const auth = req && req.auth;
  if (!auth || !Number.isInteger(auth.usuarioId) || !Number.isInteger(auth.empresaId) || !KNOWN_ROLES.has(auth.papel)) {
    throw domainError(401, "AUTH_CONTEXT_INVALID", "Sessao invalida.");
  }
  return { usuarioId: auth.usuarioId, empresaId: auth.empresaId, papel: auth.papel };
}

function isManager(context) {
  return MANAGER_ROLES.has(context.papel);
}

function requireManager(context) {
  if (!isManager(context)) throw domainError(403, "LEADS_COMMUNICATION_FORBIDDEN", "Acesso negado.");
}

function assertItemAccess(context, item) {
  if (!item || item.empresaId !== context.empresaId) throw notFound();
}

function requireResponsibleOrManager(context, item) {
  assertItemAccess(context, item);
  if (!isManager(context) && item.responsavelId !== context.usuarioId) {
    throw domainError(403, "LEADS_COMMUNICATION_FORBIDDEN", "Acesso negado.");
  }
}

function domainError(status, codigo, message, details) {
  const error = new Error(message);
  error.status = status;
  error.codigo = codigo;
  if (details !== undefined) error.details = details;
  return error;
}

function notFound(message = "Registro nao encontrado.") {
  return domainError(404, "LEADS_COMMUNICATION_NOT_FOUND", message);
}

module.exports = {
  assertItemAccess,
  authContext,
  domainError,
  featureFlagMiddleware,
  isLeadsCommunicationEnabled,
  isManager,
  notFound,
  requireResponsibleOrManager,
  requireManager,
};
