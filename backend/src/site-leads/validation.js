const SUBMISSION_FIELDS = ["submissionId", "nome", "telefone", "email", "cidade", "estado", "empresa", "produtoInteresse", "mensagem", "paginaOrigem", "campanha", "utmSource", "utmMedium", "utmContent", "utmTerm", "referrer", "iniciadoEm", "aceitePoliticaPrivacidade", "versaoPoliticaPrivacidade", "campoHoneypot"];

function validateSubmission(input) {
  const body = objectInput(input);
  rejectUnknown(body, SUBMISSION_FIELDS);
  rejectTenantFields(body);
  const submissionId = requiredUuid(body.submissionId, "submissionId");
  const nome = text(body.nome, "nome", 120, { required: true, min: 2 });
  const telefone = text(body.telefone, "telefone", 30);
  const email = normalizeEmail(body.email);
  if (!telefone && !email) throw invalid("Informe telefone ou e-mail.", { telefone: "Informe telefone ou e-mail.", email: "Informe telefone ou e-mail." });
  if (body.aceitePoliticaPrivacidade !== true) throw invalid("O aceite da politica de privacidade e obrigatorio.", { aceitePoliticaPrivacidade: "Aceite obrigatorio." });
  return {
    submissionId, nome, telefone, email,
    cidade: text(body.cidade, "cidade", 100), estado: text(body.estado, "estado", 50),
    empresa: text(body.empresa, "empresa", 160), produtoInteresse: text(body.produtoInteresse, "produtoInteresse", 200),
    mensagem: text(body.mensagem, "mensagem", 4000), paginaOrigem: optionalUrl(body.paginaOrigem, "paginaOrigem"),
    campanha: text(body.campanha, "campanha", 200), utmSource: text(body.utmSource, "utmSource", 200),
    utmMedium: text(body.utmMedium, "utmMedium", 200), utmContent: text(body.utmContent, "utmContent", 200),
    utmTerm: text(body.utmTerm, "utmTerm", 200), referrer: optionalUrl(body.referrer, "referrer"),
    iniciadoEm: optionalDate(body.iniciadoEm, "iniciadoEm"), aceitePoliticaPrivacidade: true,
    versaoPoliticaPrivacidade: text(body.versaoPoliticaPrivacidade, "versaoPoliticaPrivacidade", 120, { required: true }),
  };
}

function validateIntegrationCreate(input) {
  const body = objectInput(input);
  rejectUnknown(body, ["nome", "identificacao", "origensPermitidas", "politicaPrivacidade", "ativo"]);
  rejectTenantFields(body);
  return { nome: text(body.nome, "nome", 120, { required: true, min: 2 }), identificacao: text(body.identificacao, "identificacao", 160, { required: true }), origensPermitidas: allowedOrigins(body.origensPermitidas), politicaPrivacidade: text(body.politicaPrivacidade, "politicaPrivacidade", 2048, { required: true }), ativo: body.ativo === undefined ? true : boolean(body.ativo, "ativo") };
}

function validateIntegrationPatch(input) {
  const body = objectInput(input);
  rejectUnknown(body, ["nome", "identificacao", "origensPermitidas", "politicaPrivacidade", "ativo"]);
  rejectTenantFields(body);
  if (!Object.keys(body).length) throw invalid("Informe ao menos um campo.");
  const data = {};
  if (Object.hasOwn(body, "nome")) data.nome = text(body.nome, "nome", 120, { required: true, min: 2 });
  if (Object.hasOwn(body, "identificacao")) data.identificacao = text(body.identificacao, "identificacao", 160, { required: true });
  if (Object.hasOwn(body, "origensPermitidas")) data.origensPermitidas = allowedOrigins(body.origensPermitidas);
  if (Object.hasOwn(body, "politicaPrivacidade")) data.politicaPrivacidade = text(body.politicaPrivacidade, "politicaPrivacidade", 2048, { required: true });
  if (Object.hasOwn(body, "ativo")) data.ativo = boolean(body.ativo, "ativo");
  return data;
}

function allowedOrigins(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw invalid("Informe de 1 a 20 origens permitidas.");
  return [...new Set(value.map(normalizeOrigin))];
}

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.includes("*")) throw invalid("Origem permitida invalida.");
  let parsed;
  try { parsed = new URL(raw); } catch { throw invalid("Origem permitida invalida."); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) throw invalid("Origem permitida deve conter somente protocolo, host e porta.");
  return parsed.origin;
}

function text(value, field, max, options = {}) {
  if (value === undefined || value === null || value === "") { if (options.required) throw invalid(`${field} obrigatorio.`, { [field]: "Campo obrigatorio." }); return null; }
  if (typeof value !== "string") throw invalid(`${field} deve ser texto.`);
  const result = value.trim().replace(/\s+/g, " ");
  if (options.required && result.length < (options.min || 1)) throw invalid(`${field} invalido.`, { [field]: "Campo invalido." });
  if (result.length > max) throw invalid(`${field} excede ${max} caracteres.`, { [field]: `Maximo de ${max} caracteres.` });
  return result || null;
}

function normalizeEmail(value) { const email = text(value, "email", 254); if (!email) return null; const normalized = email.toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw invalid("email invalido.", { email: "E-mail invalido." }); return normalized; }
function optionalUrl(value, field) { const raw = text(value, field, 2048); if (!raw) return null; try { return new URL(raw).toString(); } catch { throw invalid(`${field} deve ser uma URL valida.`, { [field]: "URL invalida." }); } }
function optionalDate(value, field) { if (value === undefined || value === null || value === "") return null; const date = new Date(value); if (Number.isNaN(date.getTime())) throw invalid(`${field} invalido.`); return date; }
function boolean(value, field) { if (typeof value !== "boolean") throw invalid(`${field} deve ser booleano.`); return value; }
function requiredUuid(value, field) { const result = text(value, field, 64, { required: true }); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw invalid(`${field} invalido.`, { [field]: "Identificador invalido." }); return result.toLowerCase(); }
function rejectUnknown(body, allowed) { const unknown = Object.keys(body).filter((key) => !allowed.includes(key)); if (unknown.length) throw invalid(`Campos nao permitidos: ${unknown.join(", ")}.`); }
function rejectTenantFields(body) { for (const field of ["empresaId", "usuarioId", "canalIntegracaoId", "clienteId", "leadId", "conversaId"]) if (Object.hasOwn(body, field)) throw invalid(`${field} nao pode ser informado.`); }
function objectInput(value) { if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("Payload invalido."); return value; }
function invalid(message, campos) { const error = new Error(message); error.status = 400; error.codigo = "VALIDATION_ERROR"; if (campos) error.campos = campos; return error; }
function isHoneypotFilled(input) { return typeof input?.campoHoneypot === "string" && input.campoHoneypot.trim().length > 0; }

module.exports = { isHoneypotFilled, normalizeOrigin, validateIntegrationCreate, validateIntegrationPatch, validateSubmission };
