const { randomUUID } = require("node:crypto");
const { normalizePhone } = require("../phoneNormalizer");

const MAX_EXTERNAL_ID = 160;
const MAX_NAME = 160;
const MAX_MESSAGE = 4000;
const ALLOWED_FIELDS = new Set(["externalId", "canalIntegracaoId", "telefone", "nome", "mensagem"]);
const FORBIDDEN_FIELDS = new Set(["empresaId", "clienteId", "notaId", "acompanhamentoId", "status", "resposta", "url", "token", "credencial"]);

function parseSimulationPayload(body = {}) {
  const keys = Object.keys(body || {});
  const unknown = keys.filter((key) => !ALLOWED_FIELDS.has(key));
  const forbidden = keys.filter((key) => FORBIDDEN_FIELDS.has(key));
  if (unknown.length || forbidden.length) {
    throw validationError(`Campos nao permitidos: ${[...new Set([...unknown, ...forbidden])].join(", ")}.`);
  }

  const message = normalizeRequiredText(body.mensagem, "Mensagem obrigatoria.", MAX_MESSAGE);
  const name = normalizeOptionalText(body.nome, MAX_NAME);
  const externalId = body.externalId === undefined || body.externalId === null || body.externalId === ""
    ? `sim:${randomUUID()}`
    : normalizeRequiredText(body.externalId, "External ID obrigatorio.", MAX_EXTERNAL_ID);
  const channelId = body.canalIntegracaoId === undefined || body.canalIntegracaoId === null || body.canalIntegracaoId === ""
    ? null
    : positiveInteger(body.canalIntegracaoId);
  if (body.canalIntegracaoId !== undefined && !channelId) throw validationError("Canal invalido.");

  return {
    externalId,
    canalIntegracaoId: channelId,
    telefoneNormalizado: normalizePhone(body.telefone),
    nome: name,
    mensagem: message,
  };
}

function normalizeRequiredText(value, message, maxLength) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) throw validationError(message);
  if (text.length > maxLength) throw validationError(`Campo excede ${maxLength} caracteres.`);
  return text;
}

function normalizeOptionalText(value, maxLength) {
  if (value === undefined || value === null || value === "") return null;
  return normalizeRequiredText(value, "Campo obrigatorio.", maxLength);
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  error.codigo = "VALIDATION_ERROR";
  return error;
}

module.exports = {
  parseSimulationPayload,
  MAX_EXTERNAL_ID,
  MAX_NAME,
  MAX_MESSAGE,
};
