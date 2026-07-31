const crypto = require("node:crypto");
const { domainToASCII } = require("node:url");

const EMAIL_CHANNEL_TYPE = "EMAIL";
const REAL_EMAIL_INBOUND_KEY = "email-inbound-real";
const EMAIL_CAPABILITY_KEYS = Object.freeze({
  INTEGRATION: "EMAIL_INTEGRATION",
  INBOUND: "EMAIL_INBOUND",
});
const EMAIL_PROVIDER_TYPES = new Set(["GENERIC"]);
const EMAIL_LOCAL_PART_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const EMAIL_DOMAIN_LABEL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

function normalizeEmailAddress(value, field = "emailAddress") {
  const text = extractAddress(value);
  if (!text || text.length > 320 || /[\u0000-\u001f\u007f]/.test(text)) {
    throw emailError(422, "EMAIL_ADDRESS_INVALID", `${field} invalido.`);
  }
  const at = text.lastIndexOf("@");
  if (at <= 0 || at !== text.indexOf("@") || at === text.length - 1) {
    throw emailError(422, "EMAIL_ADDRESS_INVALID", `${field} invalido.`);
  }
  const local = text.slice(0, at);
  const rawDomain = text.slice(at + 1);
  if (!EMAIL_LOCAL_PART_PATTERN.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..") || /[\\/:?#\[\]@]/.test(rawDomain)) {
    throw emailError(422, "EMAIL_ADDRESS_INVALID", `${field} invalido.`);
  }
  const domain = domainToASCII(rawDomain).toLowerCase();
  const labels = domain.split(".");
  if (!domain || domain.length > 253 || labels.length < 2 || labels.some((label) => !EMAIL_DOMAIN_LABEL_PATTERN.test(label))) {
    throw emailError(422, "EMAIL_ADDRESS_INVALID", `${field} invalido.`);
  }
  const normalized = `${local}@${domain}`;
  if (normalized.length > 320) throw emailError(422, "EMAIL_ADDRESS_INVALID", `${field} invalido.`);
  return normalized;
}

function extractAddress(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/<([^<>]+)>$/);
  return (match ? match[1] : text).trim();
}

function normalizeProviderType(value) {
  const providerType = String(value ?? "").trim().toUpperCase();
  if (!EMAIL_PROVIDER_TYPES.has(providerType)) {
    throw emailError(422, "EMAIL_PROVIDER_TYPE_INVALID", "providerType invalido.");
  }
  return providerType;
}

function normalizeAliases(values, primaryAddress) {
  if (values === undefined) return undefined;
  if (!Array.isArray(values) || values.length > 20) {
    throw emailError(422, "EMAIL_ALIASES_INVALID", "aliases invalido.");
  }
  const aliases = [...new Set(values.map((value) => normalizeEmailAddress(value, "alias")))];
  if (aliases.includes(primaryAddress)) {
    throw emailError(422, "EMAIL_ALIASES_INVALID", "Alias nao pode repetir o endereco principal.");
  }
  return aliases.sort();
}

function maskEmailAddress(value) {
  if (!value) return null;
  const [local, domain] = String(value).split("@");
  if (!local || !domain) return null;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, Math.min(8, local.length - visible.length)))}@${domain}`;
}

function stableHash(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function normalizeOptionalText(value, field, maxLength) {
  if (value === undefined || value === null || value === "") return null;
  return normalizeRequiredText(value, field, maxLength);
}

function normalizeRequiredText(value, field, maxLength) {
  const text = String(value ?? "").trim().replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ");
  if (!text || text.length > maxLength) {
    throw emailError(422, "EMAIL_INPUT_INVALID", `${field} invalido.`);
  }
  return text;
}

function normalizeExpectedUpdatedAt(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw emailError(422, "EMAIL_EXPECTED_UPDATED_AT_INVALID", "expectedUpdatedAt invalido.");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw emailError(422, "EMAIL_EXPECTED_UPDATED_AT_INVALID", "expectedUpdatedAt invalido.");
  }
  return parsed;
}

function sanitizeReason(value, sensitiveValues = []) {
  const text = normalizeRequiredText(value, "reason", 500);
  let sanitized = text.replace(/(password|senha|token|secret|authorization|cookie|payload|accessTokenRef)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
  for (const secret of sensitiveValues.filter(Boolean)) {
    sanitized = sanitized.replace(new RegExp(escapeRegExp(String(secret)), "gi"), "[REDACTED]");
  }
  return sanitized.slice(0, 500);
}

function normalizeCorrelationId(value) {
  const text = String(value ?? "").trim();
  return /^[A-Za-z0-9._:-]{1,120}$/.test(text) ? text : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function emailError(status, code, message) {
  const error = new Error(message);
  error.name = "EmailInboundError";
  error.status = status;
  error.code = code;
  return error;
}

function isEmailError(error) {
  return error?.name === "EmailInboundError" || /^EMAIL_|^PLATFORM_/.test(String(error?.code || ""));
}

module.exports = {
  EMAIL_CAPABILITY_KEYS,
  EMAIL_CHANNEL_TYPE,
  EMAIL_PROVIDER_TYPES,
  REAL_EMAIL_INBOUND_KEY,
  emailError,
  isEmailError,
  maskEmailAddress,
  normalizeAliases,
  normalizeCorrelationId,
  normalizeEmailAddress,
  normalizeExpectedUpdatedAt,
  normalizeOptionalText,
  normalizeProviderType,
  normalizeRequiredText,
  sanitizeReason,
  stableHash,
};
