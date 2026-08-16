#!/usr/bin/env node

const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const {
  decryptCredentialsDetailed,
  decryptCredentialsWithContextDetailed,
  encryptCredentials,
  encryptCredentialsWithContext,
} = require("../src/integrations/crypto");

const ACTION = "ROTACAO_CREDENCIAIS_CRIPTOGRAFADAS";
const OFFICIAL_API_SERVICE_ID = "16de1b91-7dcb-46b4-9231-1c3e2c3e5a92";

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw safeFailure("INVALID_ARGUMENTS");
    if (token === "--apply") {
      args.set("apply", true);
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw safeFailure("INVALID_ARGUMENTS");
    args.set(key, value);
    index += 1;
  }
  return args;
}

function positiveCount(value, name) {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw safeFailure(`INVALID_${name.toUpperCase()}`);
  return parsed;
}

function validateApplyArgs(args) {
  if (!args.get("apply")) return;
  const target = String(args.get("target") || "").trim();
  const confirmation = String(args.get("confirm-target") || "").trim();
  const expectedDatabase = String(args.get("database") || "").trim();
  const expectedServiceId = String(args.get("service-id") || "").trim();
  const expectedSystemId = String(args.get("system-id") || "").trim();
  const allowedTargets = new Set(["official-postgres"]);
  if (!allowedTargets.has(target) || target !== confirmation || !expectedDatabase || expectedDatabase.length > 120 || !/^[A-Za-z0-9._-]+$/.test(expectedDatabase) || expectedServiceId !== OFFICIAL_API_SERVICE_ID || !/^\d+$/.test(expectedSystemId)) {
    throw safeFailure("TARGET_CONFIRMATION_REQUIRED");
  }
  if (positiveCount(args.get("expected-integrations"), "expected-integrations") === null || positiveCount(args.get("expected-meta"), "expected-meta") === null) {
    throw safeFailure("EXPECTED_COUNTS_REQUIRED");
  }
}

async function runRotation({ prisma, apply = false, target = null, expectedDatabase = null, expectedServiceId = null, expectedSystemId = null, expectedIntegrations = null, expectedMeta = null, requireRailwayService = true, databaseUrl = null } = {}) {
  if (!prisma) throw safeFailure("PRISMA_REQUIRED");
  if (apply && (!target || !expectedDatabase || expectedIntegrations === null || expectedMeta === null)) throw safeFailure("APPLY_CONFIRMATION_REQUIRED");
  if (apply && target !== "official-postgres" && requireRailwayService) throw safeFailure("TARGET_NOT_ALLOWED");

  const operation = async (db) => {
    if (apply && target === "official-postgres" && requireRailwayService) {
      const actualServiceId = String(process.env.RAILWAY_SERVICE_ID || "");
      if (!actualServiceId || actualServiceId !== expectedServiceId) throw safeFailure("DATABASE_SERVICE_TARGET_MISMATCH");
      if (typeof db.$queryRawUnsafe !== "function") throw safeFailure("DATABASE_IDENTITY_UNAVAILABLE");
    }
    const [integrations, metaCredentials] = await Promise.all([
      db.integracao.findMany({
        where: { credenciaisCriptografadas: { not: null } },
        select: { id: true, empresaId: true, credenciaisCriptografadas: true, updatedAt: true },
        orderBy: { id: "asc" },
      }),
      db.metaCredential.findMany({
        where: {},
        select: { id: true, empresaId: true, canalIntegracaoId: true, provider: true, reference: true, ciphertext: true, revision: true, updatedAt: true },
        orderBy: { id: "asc" },
      }),
    ]);

    if (expectedIntegrations !== null && integrations.length !== expectedIntegrations) throw safeFailure("INTEGRATION_COUNT_MISMATCH");
    if (expectedMeta !== null && metaCredentials.length !== expectedMeta) throw safeFailure("META_COUNT_MISMATCH");
    if (apply && target === "official-postgres") {
      if (typeof db.$queryRawUnsafe !== "function") throw safeFailure("DATABASE_IDENTITY_UNAVAILABLE");
      const rows = await db.$queryRawUnsafe("SELECT current_database() AS database_name, system_identifier FROM pg_control_system()");
      const observedDatabase = String(rows?.[0]?.database_name || "");
      const observedSystemId = String(rows?.[0]?.system_identifier || "");
      if (!observedDatabase || observedDatabase !== expectedDatabase || !observedSystemId || observedSystemId !== String(expectedSystemId || "")) throw safeFailure("DATABASE_TARGET_MISMATCH");
    }

    const integrationUpdates = [];
    const metaUpdates = [];
    const touchedTenants = new Set();
    let integrationsUsingPrevious = 0;
    let metaUsingPrevious = 0;

    for (const row of integrations) {
      const decrypted = decryptCredentialsDetailed(row.credenciaisCriptografadas);
      if (decrypted.keySource !== "previous") continue;
      const ciphertext = encryptCredentials(decrypted.credentials);
      if (!ciphertext) throw safeFailure("INTEGRATION_REENCRYPTION_FAILED");
      integrationsUsingPrevious += 1;
      touchedTenants.add(row.empresaId);
      integrationUpdates.push({ row, ciphertext });
    }

    for (const row of metaCredentials) {
      const context = {
        empresaId: row.empresaId,
        canalIntegracaoId: row.canalIntegracaoId,
        provider: row.provider,
        reference: row.reference,
        revision: row.revision,
      };
      const decrypted = decryptCredentialsWithContextDetailed(row.ciphertext, context);
      if (decrypted.keySource !== "previous") continue;
      const ciphertext = encryptCredentialsWithContext(decrypted.credentials, context);
      if (!ciphertext) throw safeFailure("META_REENCRYPTION_FAILED");
      metaUsingPrevious += 1;
      touchedTenants.add(row.empresaId);
      metaUpdates.push({ row, ciphertext });
    }

    if (!apply) {
      return summary({
        mode: "DRY_RUN",
        target: null,
        integrations,
        metaCredentials,
        integrationUpdates,
        metaUpdates,
        integrationsUsingPrevious,
        metaUsingPrevious,
        currentOnlyVerified: integrationsUsingPrevious === 0 && metaUsingPrevious === 0,
        auditRows: 0,
      });
    }

    for (const update of integrationUpdates) {
      const result = await db.integracao.updateMany({
        where: {
          id: update.row.id,
          empresaId: update.row.empresaId,
          credenciaisCriptografadas: update.row.credenciaisCriptografadas,
          updatedAt: update.row.updatedAt,
        },
        data: { credenciaisCriptografadas: update.ciphertext },
      });
      if (result.count !== 1) throw safeFailure("INTEGRATION_CAS_CONFLICT");
    }

    for (const update of metaUpdates) {
      const row = update.row;
      const result = await db.metaCredential.updateMany({
        where: {
          id: row.id,
          empresaId: row.empresaId,
          canalIntegracaoId: row.canalIntegracaoId,
          provider: row.provider,
          reference: row.reference,
          revision: row.revision,
          ciphertext: row.ciphertext,
          updatedAt: row.updatedAt,
        },
        data: { ciphertext: update.ciphertext },
      });
      if (result.count !== 1) throw safeFailure("META_CAS_CONFLICT");
    }

    for (const empresaId of touchedTenants) {
      await db.auditoriaSeguranca.create({
        data: {
          empresaId,
          actorUsuarioId: null,
          targetUsuarioId: null,
          acao: ACTION,
          resultado: "APLICADA",
          correlationId: crypto.randomUUID(),
          motivo: "Rotacao dual-key de credenciais armazenadas.",
        },
      });
    }

    const [afterIntegrations, afterMetaCredentials] = await Promise.all([
      db.integracao.findMany({
        where: { credenciaisCriptografadas: { not: null } },
        select: { id: true, credenciaisCriptografadas: true },
      }),
      db.metaCredential.findMany({
        where: {},
        select: { id: true, empresaId: true, canalIntegracaoId: true, provider: true, reference: true, ciphertext: true, revision: true },
      }),
    ]);

    if (afterIntegrations.length !== integrations.length || afterMetaCredentials.length !== metaCredentials.length) {
      throw safeFailure("ROW_COUNT_CHANGED");
    }
    for (const row of afterIntegrations) {
      const verified = decryptCredentialsDetailed(row.credenciaisCriptografadas, { allowPrevious: false });
      if (verified.keySource !== "current") throw safeFailure("CURRENT_ONLY_VERIFY_FAILED");
    }
    for (const row of afterMetaCredentials) {
      const verified = decryptCredentialsWithContextDetailed(row.ciphertext, {
        empresaId: row.empresaId,
        canalIntegracaoId: row.canalIntegracaoId,
        provider: row.provider,
        reference: row.reference,
        revision: row.revision,
      }, { allowPrevious: false });
      if (verified.keySource !== "current") throw safeFailure("CURRENT_ONLY_VERIFY_FAILED");
    }

    return summary({
      mode: "APPLY",
      target,
      integrations,
      metaCredentials,
      integrationUpdates,
      metaUpdates,
      integrationsUsingPrevious,
      metaUsingPrevious,
      currentOnlyVerified: true,
      auditRows: touchedTenants.size,
    });
  };

  const selectedDatabaseUrl = String(databaseUrl || process.env.CRM_TEST_DATABASE_URL || process.env.POSTGRES_DATABASE_URL || process.env.DATABASE_URL || "");
  const postgres = /^postgres(?:ql)?:/i.test(selectedDatabaseUrl);
  if (!apply) return operation(prisma);
  return prisma.$transaction(operation, postgres ? { isolationLevel: "Serializable", maxWait: 5000, timeout: 30000 } : undefined);
}

function summary({ mode, target, integrations, metaCredentials, integrationUpdates, metaUpdates, integrationsUsingPrevious, metaUsingPrevious, currentOnlyVerified, auditRows }) {
  return {
    mode,
    target,
    integrationRows: integrations.length,
    metaRows: metaCredentials.length,
    integrationsUsingPrevious,
    metaUsingPrevious,
    integrationRowsUpdated: integrationUpdates.length,
    metaRowsUpdated: metaUpdates.length,
    auditRows,
    currentOnlyVerified,
  };
}

function safeFailure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateApplyArgs(args);
  const apply = args.get("apply") === true;
  const databaseUrl = String(process.env.CRM_TEST_DATABASE_URL || process.env.POSTGRES_DATABASE_URL || process.env.DATABASE_URL || "");
  let prisma;
  try {
    if (!databaseUrl) throw safeFailure("DATABASE_URL_REQUIRED");
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    if (/^postgres(?:ql)?:/i.test(databaseUrl) && String(prisma?._engineConfig?.activeProvider || "") !== "postgresql") {
      throw safeFailure("POSTGRES_PRISMA_CLIENT_REQUIRED");
    }
    const result = await runRotation({
      prisma,
      apply,
      target: apply ? String(args.get("target")) : null,
      expectedDatabase: apply ? String(args.get("database")) : null,
      expectedServiceId: apply ? String(args.get("service-id")) : null,
      expectedSystemId: apply ? String(args.get("system-id")) : null,
      databaseUrl,
      expectedIntegrations: positiveCount(args.get("expected-integrations"), "expected-integrations"),
      expectedMeta: positiveCount(args.get("expected-meta"), "expected-meta"),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: String(error?.code || "ROTATION_FAILED") })}\n`);
    process.exitCode = 1;
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

if (require.main === module) main();

module.exports = { runRotation, parseArgs, validateApplyArgs };
