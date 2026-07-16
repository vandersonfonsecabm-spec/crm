const { domainError } = require("./policy");

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function rejectUnknown(input, allowed) {
  const value = objectInput(input);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw invalid(`Campos nao permitidos: ${unknown.join(", ")}.`);
  return value;
}

function rejectEmpresaId(input) {
  if (input && Object.hasOwn(input, "empresaId")) throw invalid("empresaId nao pode ser informado.");
}

function pagination(query = {}) {
  const page = optionalInteger(query.page, "page", { min: 1 }) ?? 1;
  const limit = optionalInteger(query.limit, "limit", { min: 1, max: MAX_LIMIT }) ?? DEFAULT_LIMIT;
  return { page, limit, skip: (page - 1) * limit };
}

function optionalInteger(value, field, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === "") return undefined;
  const text = String(value);
  if (!/^-?\d+$/.test(text)) throw invalid(`${field} deve ser um numero inteiro.`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw invalid(`${field} fora do intervalo permitido.`);
  return parsed;
}

function requiredInteger(value, field) {
  const parsed = optionalInteger(value, field, { min: 1 });
  if (parsed === undefined) throw invalid(`${field} obrigatorio.`);
  return parsed;
}

function optionalText(value, field, max, { nullable = true } = {}) {
  if (value === undefined) return undefined;
  if (value === null) {
    if (nullable) return null;
    throw invalid(`${field} nao pode ser nulo.`);
  }
  if (typeof value !== "string") throw invalid(`${field} deve ser texto.`);
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return nullable ? null : (() => { throw invalid(`${field} obrigatorio.`); })();
  if (text.length > max) throw invalid(`${field} excede ${max} caracteres.`);
  return text;
}

function requiredText(value, field, max) {
  const text = optionalText(value, field, max, { nullable: false });
  if (!text) throw invalid(`${field} obrigatorio.`);
  return text;
}

function optionalBoolean(value, field) {
  if (value === undefined || value === "") return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw invalid(`${field} deve ser booleano.`);
}

function enumValue(value, field, values, { optional = false } = {}) {
  if (optional && (value === undefined || value === "")) return undefined;
  if (!values.includes(value)) throw invalid(`${field} invalido.`);
  return value;
}

function objectInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("Payload invalido.");
  return value;
}

function invalid(message) {
  return domainError(400, "VALIDATION_ERROR", message);
}

module.exports = {
  enumValue,
  invalid,
  objectInput,
  optionalBoolean,
  optionalInteger,
  optionalText,
  pagination,
  rejectEmpresaId,
  rejectUnknown,
  requiredInteger,
  requiredText,
};
