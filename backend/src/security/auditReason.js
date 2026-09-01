"use strict";

const SENSITIVE_REASON_KEY_PATTERN = /\b(password|senha|token|secret|authorization|cookie|payload|accessTokenRef|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|app[_-]?secret|credential|signature|state|code|phoneNumberId|wabaId|instagramBusinessAccountId|messengerPageId|pageId|telefone|phone)\b/gi;
// Every URI scheme is sensitive, including opaque schemes without `//` such
// as data:, mailto:, urn: and custom provider schemes.
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:[^\s]+/gi;
const NETWORK_PATH_USERINFO_PATTERN = /\/\/[^\s/@?#]*:[^\s/@?#]+@[^\s/?#]+/g;
const NETWORK_PATH_PATTERN = /\/\/[^\s/?#]+[/?#][^\s]*/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi;
const JWT_PATTERN = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const KEY_VALUE_PATTERN = new RegExp(`(?<![A-Za-z0-9_])(["']?${SENSITIVE_REASON_KEY_PATTERN.source}["']?\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s,;]+)`, "gi");

function sanitizeAuditReason(value, sensitiveValues = [], maxLength = 500) {
  let sanitized = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const sensitiveValue of sensitiveValues) {
    const normalized = String(sensitiveValue ?? "").trim();
    if (normalized.length < 3) continue;
    sanitized = sanitized.replace(new RegExp(escapeRegExp(normalized), "gi"), "[REDACTED_VALUE]");
  }

  // A URI is sensitive even when its password is empty or the scheme is not
  // HTTP. Redact the complete URI before applying key/value rules so userinfo,
  // query and fragment values cannot survive in an audit trail.
  sanitized = sanitized
    .replace(URL_PATTERN, "[REDACTED_URL]")
    .replace(NETWORK_PATH_USERINFO_PATTERN, "[REDACTED_URL]")
    .replace(NETWORK_PATH_PATTERN, "[REDACTED_URL]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(JWT_PATTERN, "[REDACTED_TOKEN]")
    .replace(KEY_VALUE_PATTERN, (_match, prefix) => `${prefix.replace(/\s*[:=]\s*$/, "=")}[REDACTED]`)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/(?:\+\d{1,3}[\s().-]*)?(?:\(?\d{2,3}\)?[\s.-]*)?\d{4,5}[\s.-]?\d{4}\b/g, "[REDACTED_PHONE]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[REDACTED_DOCUMENT]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[REDACTED_DOCUMENT]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[REDACTED_ID]")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized.slice(0, maxLength);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { sanitizeAuditReason };
