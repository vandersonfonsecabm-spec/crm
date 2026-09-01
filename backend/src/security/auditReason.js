"use strict";

const SENSITIVE_REASON_KEY_PATTERN = /\b(password|senha|token|secret|authorization|cookie|payload|accessTokenRef|api[_-]?key|credential|signature|state|code)\b/gi;
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi;
const JWT_PATTERN = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const KEY_VALUE_PATTERN = new RegExp(`${SENSITIVE_REASON_KEY_PATTERN.source}\\s*[:=]\\s*[^\\s,;]+`, "gi");

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
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(JWT_PATTERN, "[REDACTED_TOKEN]")
    .replace(KEY_VALUE_PATTERN, (match) => `${match.split(/\s*[:=]\s*/)[0]}=[REDACTED]`)
    .replace(/\s+/g, " ")
    .trim();

  return sanitized.slice(0, maxLength);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { sanitizeAuditReason };
