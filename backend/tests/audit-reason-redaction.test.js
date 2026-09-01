const { test } = require("node:test");
const assert = require("node:assert/strict");

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
});

test("audit reasons redact OAuth fields and email lifecycle keeps the same boundary", () => {
  const reason = "callback state=STATE123 signature=SIG123 code=CODE123";
  const sanitized = sanitizeAuditReason(reason);
  assert.equal(sanitized, "callback state=[REDACTED] signature=[REDACTED] code=[REDACTED]");
  assert.equal(sanitizeReason("postgresql://alice:secret@db.internal/crm", []), "[REDACTED_URL]");
});
