"use strict";

const {
  QA_STAGING_TARGET,
  acquireQaDatabaseLease,
  assertTarget,
  inspectQaState,
  providerIsolationSafe,
  providerIsolationState,
  releaseQaDatabaseLease,
} = require("./qa-provisioning.cjs");
const { normalizeEmail, parsePlatformAdminEmails } = require("../auth");

const QA_PLATFORM_OPERATOR_TENANT = Object.freeze({
  slug: "qa-platform-operator-staging",
  name: "[QA PLATFORM] Staging Operations",
});
const QA_PLATFORM_OPERATOR = Object.freeze({
  name: "QA Staging Platform Operator",
  email: "qa-platform-operator-staging@example.invalid",
  role: "ADMIN",
});
const QA_PLATFORM_OPERATOR_APPLY_CONFIRMATION = "QA-PLATFORM-STAGING-OPERATOR-APPLY";
const QA_PLATFORM_OPERATOR_REVOKE_CONFIRMATION = "QA-PLATFORM-STAGING-OPERATOR-REVOKE";
const QA_PLATFORM_OPERATOR_RUN_ID = /^qa-platform-[a-z0-9][a-z0-9-]{7,119}$/;

class QaPlatformOperatorError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "QaPlatformOperatorError";
    this.code = code;
    this.details = details;
  }
}

function operatorRunId(value) {
  const runId = String(value || "").trim().toLowerCase();
  if (!QA_PLATFORM_OPERATOR_RUN_ID.test(runId)) throw new QaPlatformOperatorError("QA_PLATFORM_OPERATOR_RUN_ID_REQUIRED", "Run ID do operador de staging invalido.");
  return runId;
}

function assertOperatorTarget({ env = process.env, expectedReleaseHead, runId, attestation, requireAttestation = true } = {}) {
  const resolvedRunId = operatorRunId(runId);
  const targetInfo = assertTarget(env, {
    expectedReleaseHead,
    target: QA_STAGING_TARGET,
    runId: resolvedRunId,
    requireExplicitTarget: true,
    requireOperationalAttestation: requireAttestation,
    requireHarnessParity: requireAttestation,
    attestation,
  });
  if (targetInfo.target !== QA_STAGING_TARGET) throw new QaPlatformOperatorError("QA_PLATFORM_OPERATOR_STAGING_ONLY", "Operador de plataforma QA so pode ser criado no staging.");
  return { ...targetInfo, runId: resolvedRunId };
}

function assertOperatorEmailNotReserved(env = process.env) {
  const allowlist = parsePlatformAdminEmails(env.PLATFORM_ADMIN_EMAILS);
  const operatorEmail = normalizeEmail(QA_PLATFORM_OPERATOR.email);
  if (allowlist.size > 0 && (allowlist.size !== 1 || !allowlist.has(operatorEmail))) {
    throw new QaPlatformOperatorError("QA_PLATFORM_OPERATOR_ALLOWLIST_UNEXPECTED", "A allowlist de plataforma do staging contém identidades inesperadas.");
  }
}

async function withOperatorLease(prisma, runId, operation) {
  const lease = await acquireQaDatabaseLease(prisma, { runId });
  let operationError = null;
  try {
    return await operation();
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      const released = await releaseQaDatabaseLease(prisma, { runId, ownerToken: lease.ownerToken });
      if (!released) throw new QaPlatformOperatorError("QA_PLATFORM_OPERATOR_LEASE_RELEASE_FAILED", "Lease do operador de staging não foi liberado com segurança.");
    } catch (cleanupError) {
      if (!operationError) throw cleanupError;
    }
  }
}

async function strictBusinessInventory(client, empresaId) {
  const models = [
    ["cliente", { empresaId }],
    ["negocio", { empresaId }],
    ["propostaComercial", { empresaId }],
    ["negocioContratoVenda", { empresaId }],
    ["vendaCanonica", { empresaId }],
    ["itemVendaCanonica", { empresaId }],
    ["historicoVendaCanonica", { empresaId }],
  ];
  const counts = {};
  for (const [modelName, where] of models) {
    if (typeof client[modelName]?.count !== "function") throw new QaPlatformOperatorError("QA_PLATFORM_OPERATOR_SCHEMA_MODEL_MISSING", "Modelo de inventario do operador não está disponível.", { model: modelName });
    counts[modelName] = await client[modelName].count({ where });
  }
  return counts;
}

function businessInventorySafe(counts) {
  return Object.values(counts).every((value) => value === 0);
}

async function operatorSessionState(client, empresaId, operatorId) {
  if (typeof client.sessaoUsuario?.findMany !== "function" || typeof client.sessaoRefreshToken?.count !== "function") {
    throw new QaPlatformOperatorError("QA_PLATFORM_OPERATOR_SCHEMA_MODEL_MISSING", "Modelos de sessão do operador não estão disponíveis.");
  }
  const sessions = await client.sessaoUsuario.findMany({ where: { empresaId, usuarioId: operatorId }, select: { id: true, revogadoEm: true } });
  const sessionIds = sessions.map((session) => session.id);
  const activeRefreshTokens = sessionIds.length
    ? await client.sessaoRefreshToken.count({ where: { empresaId, sessaoId: { in: sessionIds }, revogadoEm: null } })
    : 0;
  return {
    totalSessions: sessions.length,
    activeSessions: sessions.filter((session) => session.revogadoEm === null).length,
    activeRefreshTokens,
  };
}

async function inspectStagingPlatformOperator({ prisma, env = process.env, expectedReleaseHead, runId, attestation, requireAttestation = true } = {}) {
  const targetInfo = assertOperatorTarget({ env, expectedReleaseHead, runId, attestation, requireAttestation });
  assertOperatorEmailNotReserved(env);
  const tenant = await prisma.empresa.findUnique({ where: { slug: QA_PLATFORM_OPERATOR_TENANT.slug }, select: { id: true, nome: true, slug: true, ativo: true } });
  if (!tenant) return { status: "ABSENT_SAFE", target: targetInfo.target, tenant: null, operator: null, providerIsolation: null, businessInventory: null, allowlist: { exact: false, containsOperator: false, size: 0 }, credentialsInOutput: 0 };
  const users = await prisma.usuario.findMany({ where: { empresaId: tenant.id }, select: { id: true, empresaId: true, nome: true, email: true, papel: true, ativo: true }, orderBy: { id: "asc" } });
  const operatorEmail = normalizeEmail(QA_PLATFORM_OPERATOR.email);
  const operator = users.find((user) => normalizeEmail(user.email) === operatorEmail) || null;
  const globalEmailCount = await prisma.usuario.count({ where: { email: operatorEmail } });
  const providerIsolation = await providerIsolationState(prisma, tenant.id);
  const businessInventory = await strictBusinessInventory(prisma, tenant.id);
  const sessions = operator ? await operatorSessionState(prisma, tenant.id, operator.id) : null;
  const allowlist = parsePlatformAdminEmails(env.PLATFORM_ADMIN_EMAILS);
  const exactUserSet = users.length === 1 && operator && operator.nome === QA_PLATFORM_OPERATOR.name && operator.papel === QA_PLATFORM_OPERATOR.role;
  const allowlistExact = allowlist.size === 1 && allowlist.has(operatorEmail);
  const ready = tenant.ativo === true && exactUserSet && operator.ativo === true && globalEmailCount === 1 && allowlistExact && providerIsolationSafe(providerIsolation) && businessInventorySafe(businessInventory);
  const revoked = tenant.ativo === false && exactUserSet && operator.ativo === false && providerIsolationSafe(providerIsolation) && businessInventorySafe(businessInventory) && sessions?.activeSessions === 0 && sessions?.activeRefreshTokens === 0;
  const status = ready ? "READY" : revoked ? "REVOKED" : "INVALID";
  return {
    status,
    target: targetInfo.target,
    tenant,
    operator: operator ? { id: operator.id, empresaId: operator.empresaId, nome: operator.nome, email: operator.email, papel: operator.papel, ativo: operator.ativo, globalEmailCount } : null,
    unexpectedUsers: users.filter((user) => !operator || user.id !== operator.id).length,
    providerIsolation,
    businessInventory,
    sessions,
    allowlist: { exact: allowlistExact, containsOperator: allowlist.has(operatorEmail), size: allowlist.size },
    credentialsInOutput: 0,
  };
}

function assertOperatorConfirmation(value, action) {
  const expected = action === "revoke" ? QA_PLATFORM_OPERATOR_REVOKE_CONFIRMATION : QA_PLATFORM_OPERATOR_APPLY_CONFIRMATION;
  if (String(value || "") !== expected) throw new QaPlatformOperatorError("QA_PLATFORM_OPERATOR_CONFIRMATION_REQUIRED", "Confirmação explícita do operador de plataforma ausente.");
}

async function provisionStagingPlatformOperator({ prisma, env = process.env, passwordHash, confirmation, expectedReleaseHead, runId, attestation, allowTestAttestation = false } = {}) {
  const targetInfo = assertOperatorTarget({ env, expectedReleaseHead, runId, attestation, requireAttestation: !allowTestAttestation });
  assertOperatorConfirmation(confirmation, "apply");
  if (!/^\$2[aby]\$\d{2}\$[.\/A-Za-z0-9]{53}$/.test(String(passwordHash || ""))) throw new QaPlatformOperatorError("QA_PLATFORM_OPERATOR_PASSWORD_HASH_INVALID", "Hash de senha do operador invalido.");
  const before = await inspectStagingPlatformOperator({ prisma, env, expectedReleaseHead, runId: targetInfo.runId, attestation, requireAttestation: !allowTestAttestation });
  if (before.status === "READY") return { ...before, mode: "noop", runId: targetInfo.runId, credentialsInOutput: 0 };
  if (before.status === "INVALID") throw new QaPlatformOperatorError("QA_PLATFORM_OPERATOR_STATE_INVALID", "Estado do tenant do operador de staging não permite reutilização segura.");
  const result = await withOperatorLease(prisma, targetInfo.runId, () => prisma.$transaction(async (tx) => {
    const existingTenant = await tx.empresa.findUnique({ where: { slug: QA_PLATFORM_OPERATOR_TENANT.slug }, select: { id: true, nome: true, slug: true, ativo: true } });
    const emailMatches = await tx.usuario.findMany({ where: { email: normalizeEmail(QA_PLATFORM_OPERATOR.email) }, select: { id: true, empresaId: true } });
    if (emailMatches.some((user) => !existingTenant || user.empresaId !== existingTenant.id)) throw new QaPlatformOperatorError("QA_PLATFORM_OPERATOR_EMAIL_COLLISION", "E-mail reservado do operador pertence a outro tenant.");
    const tenant = existingTenant || await tx.empresa.create({ data: { nome: QA_PLATFORM_OPERATOR_TENANT.name, slug: QA_PLATFORM_OPERATOR_TENANT.slug, ativo: true }, select: { id: true, nome: true, slug: true, ativo: true } });
    if (tenant.nome !== QA_PLATFORM_OPERATOR_TENANT.name) throw new QaPlatformOperatorError("QA_PLATFORM_OPERATOR_TENANT_IDENTITY_MISMATCH", "Tenant reservado do operador possui nome divergente.");
    if (!tenant.ativo) await tx.empresa.update({ where: { id: tenant.id }, data: { ativo: true } });
    const existing = await tx.usuario.findFirst({ where: { empresaId: tenant.id, email: normalizeEmail(QA_PLATFORM_OPERATOR.email) }, select: { id: true, empresaId: true, nome: true, email: true, papel: true, ativo: true } });
    const currentUsers = await tx.usuario.findMany({ where: { empresaId: tenant.id }, select: { id: true, email: true } });
    if (currentUsers.some((user) => !existing || user.id !== existing.id)) throw new QaPlatformOperatorError("QA_PLATFORM_OPERATOR_UNEXPECTED_USER", "Tenant reservado do operador possui usuário inesperado.");
    if (existing) {
      const sessions = await tx.sessaoUsuario.findMany({ where: { empresaId: tenant.id, usuarioId: existing.id }, select: { id: true } });
      const sessionIds = sessions.map((session) => session.id);
      if (sessionIds.length) {
        await tx.sessaoRefreshToken.updateMany({ where: { empresaId: tenant.id, sessaoId: { in: sessionIds }, revogadoEm: null }, data: { revogadoEm: new Date() } });
        await tx.sessaoUsuario.updateMany({ where: { empresaId: tenant.id, usuarioId: existing.id, revogadoEm: null }, data: { revogadoEm: new Date(), motivoRevogacao: "QA_PLATFORM_OPERATOR_REACTIVATE" } });
      }
    }
    const operator = existing
      ? await tx.usuario.update({ where: { id: existing.id }, data: { nome: QA_PLATFORM_OPERATOR.name, papel: QA_PLATFORM_OPERATOR.role, ativo: true, senhaHash: passwordHash }, select: { id: true, empresaId: true, nome: true, email: true, papel: true, ativo: true } })
      : await tx.usuario.create({ data: { empresaId: tenant.id, nome: QA_PLATFORM_OPERATOR.name, email: QA_PLATFORM_OPERATOR.email, papel: QA_PLATFORM_OPERATOR.role, senhaHash: passwordHash, ativo: true }, select: { id: true, empresaId: true, nome: true, email: true, papel: true, ativo: true } });
    if (typeof tx.platformTenantAudit?.create !== "function" || typeof tx.auditoriaSeguranca?.create !== "function") throw new QaPlatformOperatorError("QA_PLATFORM_OPERATOR_AUDIT_UNAVAILABLE", "Auditoria obrigatória do operador não está disponível.");
    await tx.platformTenantAudit.create({ data: { actorUserId: operator.id, tenantId: tenant.id, action: existing ? "QA_PLATFORM_OPERATOR_REACTIVATED" : "QA_PLATFORM_OPERATOR_PROVISIONED", tenantName: tenant.nome, tenantSlug: tenant.slug, adminUserId: operator.id } });
    await tx.auditoriaSeguranca.create({ data: { empresaId: tenant.id, actorUsuarioId: operator.id, targetUsuarioId: operator.id, acao: existing ? "QA_PLATFORM_OPERATOR_REACTIVATED" : "QA_PLATFORM_OPERATOR_PROVISIONED", resultado: "SUCCESS", correlationId: targetInfo.runId, motivo: "Operador exclusivo do staging QA." } });
    return { tenant: { id: tenant.id, nome: tenant.nome, slug: tenant.slug, ativo: true }, operator: { id: operator.id, empresaId: operator.empresaId, nome: operator.nome, email: operator.email, papel: operator.papel, ativo: true }, mode: existing ? "reactivate" : "apply" };
  }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 }));
  const after = await inspectStagingPlatformOperator({ prisma, env, expectedReleaseHead, runId: targetInfo.runId, attestation, requireAttestation: !allowTestAttestation });
  return { ...after, ...result, runId: targetInfo.runId, credentialsInOutput: 0 };
}

async function revokeStagingPlatformOperator({ prisma, env = process.env, confirmation, expectedReleaseHead, runId, attestation, allowTestAttestation = false } = {}) {
  const targetInfo = assertOperatorTarget({ env, expectedReleaseHead, runId, attestation, requireAttestation: !allowTestAttestation });
  assertOperatorConfirmation(confirmation, "revoke");
  const before = await inspectStagingPlatformOperator({ prisma, env, expectedReleaseHead, runId: targetInfo.runId, attestation, requireAttestation: !allowTestAttestation });
  if (before.status === "ABSENT_SAFE" || before.status === "REVOKED") return { ...before, mode: "noop", runId: targetInfo.runId, credentialsInOutput: 0 };
  if (before.status !== "READY") throw new QaPlatformOperatorError("QA_PLATFORM_OPERATOR_STATE_INVALID", "Estado do operador não permite revoke seguro.");
  await withOperatorLease(prisma, targetInfo.runId, () => prisma.$transaction(async (tx) => {
    const tenant = await tx.empresa.findUnique({ where: { slug: QA_PLATFORM_OPERATOR_TENANT.slug }, select: { id: true, nome: true, slug: true } });
    const operator = await tx.usuario.findFirst({ where: { empresaId: tenant.id, email: normalizeEmail(QA_PLATFORM_OPERATOR.email) }, select: { id: true, empresaId: true, papel: true } });
    if (!tenant || !operator) throw new QaPlatformOperatorError("QA_PLATFORM_OPERATOR_STATE_INVALID", "Operador reservado ausente durante revoke.");
    const sessions = await tx.sessaoUsuario.findMany({ where: { empresaId: tenant.id, usuarioId: operator.id }, select: { id: true } });
    const sessionIds = sessions.map((session) => session.id);
    if (sessionIds.length) {
      await tx.sessaoRefreshToken.updateMany({ where: { empresaId: tenant.id, sessaoId: { in: sessionIds }, revogadoEm: null }, data: { revogadoEm: new Date() } });
      await tx.sessaoUsuario.updateMany({ where: { empresaId: tenant.id, usuarioId: operator.id, revogadoEm: null }, data: { revogadoEm: new Date(), motivoRevogacao: "QA_PLATFORM_OPERATOR_REVOKE" } });
    }
    await tx.platformTenantAudit.create({ data: { actorUserId: operator.id, tenantId: tenant.id, action: "QA_PLATFORM_OPERATOR_REVOKED", tenantName: tenant.nome, tenantSlug: tenant.slug, adminUserId: operator.id } });
    await tx.auditoriaSeguranca.create({ data: { empresaId: tenant.id, actorUsuarioId: operator.id, targetUsuarioId: operator.id, acao: "QA_PLATFORM_OPERATOR_REVOKED", resultado: "SUCCESS", correlationId: targetInfo.runId, motivo: "Revogação do operador exclusivo do staging QA." } });
    await tx.usuario.update({ where: { id: operator.id }, data: { ativo: false } });
    await tx.empresa.update({ where: { id: tenant.id }, data: { ativo: false } });
  }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 }));
  return { ...(await inspectStagingPlatformOperator({ prisma, env, expectedReleaseHead, runId: targetInfo.runId, attestation, requireAttestation: !allowTestAttestation })), mode: "revoke", runId: targetInfo.runId, credentialsInOutput: 0 };
}

module.exports = {
  QA_PLATFORM_OPERATOR,
  QA_PLATFORM_OPERATOR_APPLY_CONFIRMATION,
  QA_PLATFORM_OPERATOR_REVOKE_CONFIRMATION,
  QA_PLATFORM_OPERATOR_RUN_ID,
  QA_PLATFORM_OPERATOR_TENANT,
  QaPlatformOperatorError,
  inspectStagingPlatformOperator,
  provisionStagingPlatformOperator,
  revokeStagingPlatformOperator,
};
