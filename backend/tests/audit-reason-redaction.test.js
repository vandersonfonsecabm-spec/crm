const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { sanitizeAuditReason } = require("../src/security/auditReason");
const { sanitizeReason } = require("../src/integrations/emailFoundation");

test("audit reasons redact userinfo and sensitive URI query values for every scheme", () => {
  const reason = "probe postgresql://alice:synthetic-secret@db.internal:5432/crm?access_token=query-secret redis://:redis-secret@cache.internal/0 amqps://worker:queue-secret@mq.internal/vhost";
  const sanitized = sanitizeAuditReason(reason);
  assert.doesNotMatch(sanitized, /synthetic-secret|query-secret|redis-secret|queue-secret|postgresql:|redis:|amqps:/i);
  assert.match(sanitized, /\[REDACTED_URL\]/g);
});

test("audit reasons redact opaque URI schemes and provider wrappers share the boundary", () => {
  const reason = "mailto:opaque-marker@example.invalid urn:opaque-marker data:text/plain,opaque-marker custom+scheme:opaque-marker";
  const sanitized = sanitizeAuditReason(reason);
  assert.doesNotMatch(sanitized, /opaque-marker|mailto:|urn:|data:|custom\+scheme:/i);
  assert.equal((sanitized.match(/\[REDACTED_URL\]/g) || []).length, 4);

  const providerFiles = [
    ["platform", "whatsappInboundProvisioning.js"],
    ["platform", "instagramInboundProvisioning.js"],
    ["platform", "messengerInboundProvisioning.js"],
    ["integrations", "whatsappInboundLifecycle.js"],
    ["integrations", "instagramInboundLifecycle.js"],
    ["integrations", "messengerInboundLifecycle.js"],
  ];
  for (const [folder, file] of providerFiles) {
    const source = fs.readFileSync(path.join(__dirname, "..", "src", folder, file), "utf8");
    assert.match(source, /security[\\/]auditReason/);
    assert.doesNotMatch(source, /SENSITIVE_REASON_KEYS|redactSensitiveReasonPairs/);
  }
});

test("audit reasons redact OAuth fields and email lifecycle keeps the same boundary", () => {
  const reason = "callback state=STATE123 signature=SIG123 code=CODE123";
  const sanitized = sanitizeAuditReason(reason);
  assert.equal(sanitized, "callback state=[REDACTED] signature=[REDACTED] code=[REDACTED]");
  assert.equal(sanitizeReason("postgresql://alice:secret@db.internal/crm", []), "[REDACTED_URL]");
  assert.equal(sanitizeAuditReason("callback //provider.test/private/tenant-42?opaque=marker#fragment"), "callback [REDACTED_URL]");
  assert.equal(sanitizeAuditReason("callback //123:synthetic-secret@example.test"), "callback [REDACTED_URL]");
  const quoted = sanitizeAuditReason('cookie="synthetic-secret-part-one synthetic-secret-part-two"');
  assert.equal(quoted.includes("synthetic-secret"), false);
  assert.equal(quoted, "cookie=[REDACTED]");
  for (const key of ["access_token", "accessToken", "refresh_token"]) {
    const sanitizedToken = sanitizeAuditReason(`${key}=synthetic-secret-token`);
    assert.equal(sanitizedToken.includes("synthetic-secret-token"), false, key);
    assert.equal(sanitizedToken, `${key}=[REDACTED]`);
  }
  for (const key of ["password", "access_token", "accessToken", "refresh_token", "state", "code", "signature", "clientKey", "appKey", "private key", "access key", "authorization", "passwd", "pass"]) {
    const quotedJson = `{\"${key}\":\"quoted-${key}-secret\"}`;
    const quotedSanitized = sanitizeAuditReason(quotedJson);
    const escaped = key + '="prefix\\\"SECRET-' + key + '\\\" tail"';
    const escapedSanitized = sanitizeAuditReason(escaped);
    assert.equal(escapedSanitized.includes("SECRET-" + key), false, key);
    assert.equal(escapedSanitized.includes("tail"), false, key);
    assert.equal(quotedSanitized.includes(`quoted-${key}-secret`), false, key);
  }
});
