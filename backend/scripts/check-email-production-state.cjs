const { Client } = require("pg");

const DATABASE_KEYS = Object.freeze([
  "POSTGRES_DATABASE_URL",
  "DATABASE_URL",
]);

async function checkEmailProductionState(env = process.env) {
  const databaseKey = DATABASE_KEYS.find((key) => /^postgres(ql)?:\/\//i.test(String(env[key] || "")));
  if (!databaseKey) throw new Error("POSTGRES_RUNTIME_UNAVAILABLE");

  const client = new Client({ connectionString: env[databaseKey], statement_timeout: 15_000 });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const result = {
      gates: {
        integration: gateState(env.EMAIL_INTEGRATION_ENABLED),
        inbound: gateState(env.EMAIL_INBOUND_ENABLED),
      },
      migrationApplied: await scalar(client, 'SELECT COUNT(*)::int AS total FROM "_prisma_migrations" WHERE "migration_name" = $1 AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL', ["20260731190000_add_email_inbound_foundation"]),
      tables: await scalar(client, 'SELECT COUNT(*)::int AS total FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ($2, $3)', ["public", "EmailMailboxAddress", "EmailMessageMetadata"]),
      channels: await scalar(client, 'SELECT COUNT(*)::int AS total FROM "CanalIntegracao" WHERE "tipo" = $1', ["EMAIL"]),
      activeOrTimestampedChannels: await scalar(client, 'SELECT COUNT(*)::int AS total FROM "CanalIntegracao" WHERE "tipo" = $1 AND ("ativo" = true OR "connectedAt" IS NOT NULL OR "verifiedAt" IS NOT NULL OR "lastWebhookAt" IS NOT NULL)', ["EMAIL"]),
      capabilities: await scalar(client, 'SELECT COUNT(*)::int AS total FROM "EmpresaFuncionalidade" WHERE "chave" IN ($1, $2)', ["EMAIL_INTEGRATION", "EMAIL_INBOUND"]),
      enabledCapabilities: await scalar(client, 'SELECT COUNT(*)::int AS total FROM "EmpresaFuncionalidade" WHERE "chave" IN ($1, $2) AND "habilitada" = true', ["EMAIL_INTEGRATION", "EMAIL_INBOUND"]),
      mailboxAddresses: await scalar(client, 'SELECT COUNT(*)::int AS total FROM "EmailMailboxAddress"'),
      messageMetadata: await scalar(client, 'SELECT COUNT(*)::int AS total FROM "EmailMessageMetadata"'),
      events: await relatedCount(client, "EventoWebhook"),
      messages: await relatedCount(client, "MensagemCanal"),
      contacts: await relatedCount(client, "ContatoCanal"),
      conversations: await relatedCount(client, "ConversaCanal"),
    };
    await client.query("ROLLBACK");
    return result;
  } finally {
    await client.end();
  }
}

function gateState(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" ? "ON" : normalized ? "OFF" : "MISSING";
}

async function scalar(client, sql, params = []) {
  const result = await client.query(sql, params);
  return Number(result.rows[0]?.total || 0);
}

function relatedCount(client, table) {
  const allowlist = new Set(["EventoWebhook", "MensagemCanal", "ContatoCanal", "ConversaCanal"]);
  if (!allowlist.has(table)) throw new Error("EMAIL_VERIFIER_TABLE_INVALID");
  return scalar(client, `SELECT COUNT(*)::int AS total FROM "${table}" x JOIN "CanalIntegracao" c ON c."id" = x."canalIntegracaoId" WHERE c."tipo" = $1`, ["EMAIL"]);
}

function sanitize(error) {
  return String(error?.code || error?.message || "EMAIL_PRODUCTION_STATE_FAILED")
    .replace(/postgres(ql)?:\/\/[^\s"']+/gi, "[POSTGRES_URL_REDACTED]")
    .slice(0, 160);
}

if (require.main === module) {
  checkEmailProductionState()
    .then((result) => console.log(JSON.stringify({ event: "email_production_state", ...result })))
    .catch((error) => {
      console.error(`[email-production-state] ${sanitize(error)}`);
      process.exitCode = 1;
    });
}

module.exports = { checkEmailProductionState };
