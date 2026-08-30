"use strict";

const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { SOURCE_MANIFEST_VERSION, sourceManifestSha256 } = require("../src/runtime-fingerprint");
const { createDistributedOperationLease } = require("../src/shared/distributedOperationLease");

const {
  TARGET_CONFIRMATION,
  createRoleAuthLifecycle,
  resolveConfig,
  runStore1StagingSoak,
  sanitizeLedger,
  verifyRuntimeFingerprint,
} = require("./run-store1-staging-soak.cjs");

const EXPECTED = Object.freeze({
  projectId: "ddfbf66c-e274-47b1-9493-286232d2f426",
  environmentId: "d6b6f137-cffd-4647-a102-3619fc54133a",
  apiServiceId: "8af12b8e-4f4d-498c-9ceb-3182417905f8",
  databaseServiceId: "f3a2862b-2371-4ab3-b4db-1e91680ee3b7",
  databaseHost: "postgres--e25.railway.internal",
});
const ROLES = Object.freeze(["ADMIN", "GERENTE", "VENDEDOR"]);

class SoakJobError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SoakJobError";
    this.code = code;
  }
}

function assertSoakJobTarget(env = process.env) {
  const runnerServiceId = String(env.RAILWAY_SERVICE_ID || "").trim();
  const expectedRunnerServiceId = String(env.STORE1_SOAK_RUNNER_SERVICE_ID || "").trim();
  if (env.STORE1_SOAK_TARGET_CONFIRM !== TARGET_CONFIRMATION
    || env.RAILWAY_PROJECT_ID !== EXPECTED.projectId
    || env.RAILWAY_ENVIRONMENT_ID !== EXPECTED.environmentId
    || String(env.STORE1_SOAK_API_SERVICE_ID || "") !== EXPECTED.apiServiceId
    || String(env.STORE1_SOAK_DATABASE_SERVICE_ID || "") !== EXPECTED.databaseServiceId) {
    throw new SoakJobError("SOAK_JOB_TARGET_MISMATCH", "IDs do staging nao correspondem ao alvo aprovado.");
  }
  if (!runnerServiceId || runnerServiceId === EXPECTED.apiServiceId || expectedRunnerServiceId !== runnerServiceId) {
    throw new SoakJobError("SOAK_JOB_SEPARATION_REQUIRED", "Soak deve executar em servico temporario separado da API.");
  }
  const postgresDatabaseUrl = String(env.POSTGRES_DATABASE_URL || "").trim();
  const databaseUrl = String(env.DATABASE_URL || "").trim();
  if (!postgresDatabaseUrl || !databaseUrl || postgresDatabaseUrl !== databaseUrl) {
    throw new SoakJobError("SOAK_JOB_DATABASE_DIVERGENCE", "URLs do PostgreSQL de staging divergentes.");
  }
  let database;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new SoakJobError("SOAK_JOB_DATABASE_MISMATCH", "Banco de staging invalido.");
  }
  if (!database.protocol.startsWith("postgres") || database.hostname.toLowerCase() !== EXPECTED.databaseHost) {
    throw new SoakJobError("SOAK_JOB_DATABASE_MISMATCH", "Banco nao corresponde ao PostgreSQL do staging.");
  }
  const tenantId = Number(env.STORE1_SOAK_TENANT_ID);
  const tenantSlug = String(env.STORE1_SOAK_TENANT_SLUG || "").trim().toLowerCase();
  if (!Number.isSafeInteger(tenantId) || tenantId < 1 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug)) {
    throw new SoakJobError("SOAK_JOB_TENANT_REQUIRED", "Tenant STORE-1 exato obrigatorio.");
  }
  return { runnerServiceId, tenantId, tenantSlug, databaseUrl };
}

async function verifyExpectedTenant(prisma, { tenantId, tenantSlug }) {
  const tenant = await prisma.empresa.findFirst({ where: { id: tenantId, slug: tenantSlug, ativo: true }, select: { id: true, slug: true, ativo: true } });
  if (!tenant) throw new SoakJobError("SOAK_JOB_TENANT_MISMATCH", "Tenant STORE-1 nao corresponde ao alvo aprovado.");
  return tenant;
}

async function provisionSyntheticUsers({ prisma, bcrypt, tenant, runId, randomBytes = crypto.randomBytes }) {
  const marker = crypto.createHash("sha256").update(String(runId)).digest("hex").slice(0, 16);
  const inputs = await Promise.all(ROLES.map(async (role) => {
    const password = randomBytes(32).toString("base64url");
    return {
      role,
      email: `store1-soak-${marker}-${role.toLowerCase()}@example.test`,
      password,
      passwordHash: await bcrypt.hash(password, 12),
    };
  }));
  return prisma.$transaction(async (tx) => {
    const identities = [];
    for (const input of inputs) {
      const user = await tx.usuario.create({
        data: {
          empresaId: tenant.id,
          nome: `STORE-1 Soak ${input.role}`,
          email: input.email,
          senhaHash: input.passwordHash,
          papel: input.role,
          ativo: true,
        },
        select: { id: true, empresaId: true, email: true, papel: true },
      });
      await tx.auditoriaSeguranca.create({
        data: {
          empresaId: tenant.id,
          targetUsuarioId: user.id,
          acao: "STORE1_SOAK_USER_CREATED",
          resultado: "SUCCESS",
          motivo: "Identidade sintetica temporaria para soak de staging.",
          correlationId: `store1-soak:${marker}`,
        },
      });
      identities.push({ userId: user.id, empresaId: user.empresaId, role: user.papel, email: input.email, password: input.password });
    }
    return identities;
  });
}

async function cleanupSyntheticUsers({ prisma, tenantId, identities, now = new Date() }) {
  const safe = Array.isArray(identities) ? identities.filter((item) => Number.isSafeInteger(item?.userId) && item.empresaId === tenantId && String(item.email || "").endsWith("@example.test")) : [];
  if (safe.length !== ROLES.length || safe.length !== identities.length || new Set(safe.map((item) => item.userId)).size !== ROLES.length) {
    throw new SoakJobError("SOAK_JOB_CLEANUP_SCOPE_INVALID", "Escopo de cleanup sintetico invalido.");
  }
  const userIds = safe.map((item) => item.userId);
  const result = await prisma.$transaction(async (tx) => {
    const persisted = await tx.usuario.findMany({ where: { empresaId: tenantId, id: { in: userIds } }, select: { id: true, email: true } });
    if (persisted.length !== userIds.length || persisted.some((user) => !safe.some((item) => item.userId === user.id && item.email === user.email))) {
      throw new SoakJobError("SOAK_JOB_CLEANUP_SCOPE_INVALID", "Usuarios temporarios nao correspondem ao ledger em memoria.");
    }
    const activeBefore = persisted.filter((user) => safe.some((item) => item.userId === user.id)).length;
    const activeUsersBefore = await tx.usuario.count({ where: { empresaId: tenantId, id: { in: userIds }, ativo: true } });
    const sessions = await tx.sessaoUsuario.findMany({ where: { empresaId: tenantId, usuarioId: { in: userIds }, revogadoEm: null }, select: { id: true } });
    const sessionIds = sessions.map((session) => session.id);
    const activeRefreshTokens = sessionIds.length
      ? await tx.sessaoRefreshToken.findMany({ where: { empresaId: tenantId, sessaoId: { in: sessionIds }, revogadoEm: null }, select: { id: true } })
      : [];
    const refreshTokens = sessionIds.length
      ? await tx.sessaoRefreshToken.updateMany({ where: { empresaId: tenantId, sessaoId: { in: sessionIds }, revogadoEm: null }, data: { revogadoEm: now } })
      : { count: 0 };
    const revokedSessions = sessionIds.length
      ? await tx.sessaoUsuario.updateMany({ where: { empresaId: tenantId, id: { in: sessionIds }, revogadoEm: null }, data: { revogadoEm: now, motivoRevogacao: "STORE1_SOAK_CLEANUP" } })
      : { count: 0 };
    const deactivated = await tx.usuario.updateMany({ where: { empresaId: tenantId, id: { in: userIds }, ativo: true }, data: { ativo: false } });
    if (activeBefore !== ROLES.length || deactivated.count !== activeUsersBefore || revokedSessions.count !== sessionIds.length || refreshTokens.count !== activeRefreshTokens.length) {
      throw new SoakJobError("SOAK_JOB_CLEANUP_INCOMPLETE", "Cleanup das identidades sinteticas ficou incompleto.");
    }
    for (const userId of userIds) {
      await tx.auditoriaSeguranca.create({
        data: {
          empresaId: tenantId,
          targetUsuarioId: userId,
          acao: "STORE1_SOAK_USER_DEACTIVATED",
          resultado: "SUCCESS",
          motivo: "Identidade sintetica desativada apos soak.",
        },
      });
    }
    const [remainingUsers, remainingSessions, remainingTokens] = await Promise.all([
      tx.usuario.count({ where: { empresaId: tenantId, id: { in: userIds }, ativo: true } }),
      tx.sessaoUsuario.count({ where: { empresaId: tenantId, usuarioId: { in: userIds }, revogadoEm: null } }),
      tx.sessaoRefreshToken.count({ where: { empresaId: tenantId, sessaoId: { in: sessionIds }, revogadoEm: null } }),
    ]);
    if (remainingUsers || remainingSessions || remainingTokens) throw new SoakJobError("SOAK_JOB_CLEANUP_INCOMPLETE", "Estado final do cleanup nao foi comprovado.");
    return {
      usersDeactivated: deactivated.count,
      sessionsRevoked: revokedSessions.count,
      refreshTokensRevoked: refreshTokens.count,
      finalStateVerified: true,
      idempotent: activeUsersBefore === 0 && sessionIds.length === 0 && activeRefreshTokens.length === 0,
    };
  });
  if (!result.idempotent && result.usersDeactivated !== ROLES.length) {
    throw new SoakJobError("SOAK_JOB_CLEANUP_RECOVERED_PARTIAL", "Cleanup parcial foi recuperado, mas a execucao permanece bloqueada.");
  }
  return result;
}

async function recoverAbandonedSyntheticUsers({ prisma, tenantId }) {
  const rows = await prisma.usuario.findMany({
    where: { empresaId: tenantId, email: { startsWith: "store1-soak-", endsWith: "@example.test" } },
    select: { id: true, empresaId: true, email: true, nome: true, papel: true, ativo: true },
    take: 100,
  });
  const groups = new Map();
  for (const row of rows) {
    const match = String(row.email || "").match(/^store1-soak-([a-f0-9]{16})-(admin|gerente|vendedor)@example\.test$/i);
    if (!match || row.nome !== `STORE-1 Soak ${String(row.papel)}` || !ROLES.includes(String(row.papel))) {
      throw new SoakJobError("SOAK_ABANDONED_USER_SCOPE_INVALID", "Usuario com prefixo reservado nao corresponde ao harness.");
    }
    if (!groups.has(match[1])) groups.set(match[1], []);
    groups.get(match[1]).push(row);
  }
  const totals = { groupsRecovered: 0, usersDeactivated: 0, sessionsRevoked: 0, refreshTokensRevoked: 0 };
  for (const group of groups.values()) {
    if (!group.some((row) => row.ativo)) continue;
    if (group.length !== ROLES.length || new Set(group.map((row) => row.papel)).size !== ROLES.length) {
      throw new SoakJobError("SOAK_ABANDONED_USER_SCOPE_INVALID", "Grupo abandonado incompleto; limpeza automatica recusada.");
    }
    const result = await cleanupSyntheticUsers({
      prisma,
      tenantId,
      identities: group.map((row) => ({ userId: row.id, empresaId: row.empresaId, email: row.email, role: row.papel })),
    });
    totals.groupsRecovered += 1;
    totals.usersDeactivated += result.usersDeactivated;
    totals.sessionsRevoked += result.sessionsRevoked;
    totals.refreshTokensRevoked += result.refreshTokensRevoked;
  }
  return totals;
}

async function finalizeHarness({ prisma, ownsPrisma, tenant, identities, cleanupDone, authLifecycle }) {
  let finalError = null;
  try {
    if (identities.length && !cleanupDone) await cleanupSyntheticUsers({ prisma, tenantId: tenant.id, identities });
  } catch (error) {
    finalError = error;
  } finally {
    try { authLifecycle?.destroy?.(); }
    finally {
      destroyIdentitySecrets(identities);
      if (ownsPrisma) {
        try { await prisma.$disconnect(); }
        catch (error) { finalError ||= error; }
      }
    }
  }
  if (finalError) throw finalError;
}

async function executeMissionUnderLease({ prisma, tenant, bcrypt, runId, config, env, fetchImpl, options, restartHook }) {
  const leaseManager = options.leaseManager || createDistributedOperationLease({ prisma });
  return leaseManager.withLease({ empresaId: tenant.id, namespace: "STORE1_SOAK", resourceKey: "MISSION" }, async (leaseContext) => {
    leaseContext.assertOwned();
    const recovery = await recoverAbandonedSyntheticUsers({ prisma, tenantId: tenant.id });
    leaseContext.assertOwned();
    let identities = [];
    let authLifecycle = null;
    let cleanupDone = false;
    try {
      identities = await provisionSyntheticUsers({ prisma, bcrypt, tenant, runId, randomBytes: options.randomBytes });
      leaseContext.assertOwned();
      authLifecycle = createRoleAuthLifecycle({ target: config.target, identities, fetchImpl, now: options.now, timeoutMs: config.timeoutMs });
      const runSoak = options.runSoak || runStore1StagingSoak;
      const jobMetricsProvider = options.jobMetricsProvider || createTenantJobMetricsProvider({ prisma, tenantId: tenant.id, now: () => new Date((options.now || Date.now)()) });
      const ledger = await runSoak({
        env,
        fetchImpl,
        authLifecycle,
        leaseContext,
        jobMetricsProvider,
        pendingRunningJustification: options.pendingRunningJustification,
        now: options.now,
        sleep: options.sleep,
        randomUUID: options.randomUUID,
        testOverrides: options.testOverrides,
        allowTestOverrides: options.allowTestOverrides,
        testAllowedHosts: options.testAllowedHosts,
        writeLedger: options.writeLedger,
        outputRoot: options.outputRoot,
        restartHook,
        cleanupHook: async () => {
          const result = await cleanupSyntheticUsers({ prisma, tenantId: tenant.id, identities });
          cleanupDone = true;
          return result;
        },
      });
      leaseContext.assertOwned();
      return sanitizeLedger({ ...ledger, qaIdentities: { provisioned: identities.length, roles: ROLES, cleanupDone, recovery } });
    } finally {
      await finalizeHarness({ prisma, ownsPrisma: false, tenant, identities, cleanupDone, authLifecycle });
    }
  });
}

function createTenantJobMetricsProvider({ prisma, tenantId, now = () => new Date() } = {}) {
  if (!prisma?.automacaoAcaoJob || !Number.isSafeInteger(Number(tenantId)) || Number(tenantId) < 1) throw new SoakJobError("SOAK_JOB_METRICS_CONFIG_INVALID", "Provider de metricas de jobs invalido.");
  return async function tenantJobMetrics() {
    const rows = await prisma.automacaoAcaoJob.findMany({
      where: { empresaId: Number(tenantId) },
      select: { status: true, tentativas: true, actionKey: true, leaseExpiresAt: true },
    });
    const snapshot = { total: rows.length, pending: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0, stuck: 0, retries: 0, duplicates: 0 };
    const actionKeys = new Map();
    const current = now();
    for (const row of rows) {
      const attempts = row.tentativas;
      if (typeof attempts !== "number" || !Number.isSafeInteger(attempts) || attempts < 0 || !String(row.actionKey || "")) throw new SoakJobError("SOAK_JOB_METRICS_ROW_INVALID", "Job operacional invalido.");
      if (row.status === "PENDENTE") snapshot.pending += 1;
      else if (row.status === "PROCESSANDO") snapshot.running += 1;
      else if (row.status === "CONCLUIDO") snapshot.succeeded += 1;
      else if (["FALHOU", "FALHA_DEFINITIVA"].includes(row.status)) snapshot.failed += 1;
      else if (row.status === "CANCELADO") snapshot.cancelled += 1;
      else throw new SoakJobError("SOAK_JOB_METRICS_STATUS_INVALID", "Status operacional de job invalido.");
      if (row.status === "PROCESSANDO" && row.leaseExpiresAt && new Date(row.leaseExpiresAt) <= current) snapshot.stuck += 1;
      snapshot.retries += Math.max(attempts - 1, 0);
      actionKeys.set(row.actionKey, (actionKeys.get(row.actionKey) || 0) + 1);
    }
    snapshot.duplicates = [...actionKeys.values()].reduce((sum, count) => sum + Math.max(count - 1, 0), 0);
    return snapshot;
  };
}

function assertLocalLauncherTarget(env = process.env) {
  if (env.STORE1_SOAK_EXECUTION_MODE !== "local-launcher" || env.STORE1_SOAK_TARGET_CONFIRM !== TARGET_CONFIRMATION) {
    throw new SoakJobError("SOAK_LOCAL_CONFIRMATION_REQUIRED", "Launcher local exige confirmacao explicita.");
  }
  if (env.RAILWAY_SERVICE_ID || env.RAILWAY_DEPLOYMENT_ID || env.POSTGRES_DATABASE_URL || env.DATABASE_URL) {
    throw new SoakJobError("SOAK_LOCAL_CONTEXT_INVALID", "Launcher local nao pode fingir contexto de servico Railway.");
  }
  if (String(env.STORE1_SOAK_PROJECT_ID || "") !== EXPECTED.projectId
    || String(env.STORE1_SOAK_ENVIRONMENT_ID || "") !== EXPECTED.environmentId
    || String(env.STORE1_SOAK_API_SERVICE_ID || "") !== EXPECTED.apiServiceId
    || String(env.STORE1_SOAK_DATABASE_SERVICE_ID || "") !== EXPECTED.databaseServiceId) {
    throw new SoakJobError("SOAK_LOCAL_TARGET_MISMATCH", "IDs do staging local nao correspondem ao alvo aprovado.");
  }
  const tenantId = Number(env.STORE1_SOAK_TENANT_ID);
  const tenantSlug = String(env.STORE1_SOAK_TENANT_SLUG || "").trim().toLowerCase();
  if (!Number.isSafeInteger(tenantId) || tenantId < 1 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug)) {
    throw new SoakJobError("SOAK_JOB_TENANT_REQUIRED", "Tenant STORE-1 exato obrigatorio.");
  }
  return { tenantId, tenantSlug };
}

function resolveRailwayCliScript({ env = process.env, fsImpl = fs } = {}) {
  const candidates = [
    env.APPDATA && path.join(env.APPDATA, "npm", "node_modules", "@railway", "cli", "bin", "railway.js"),
    env.USERPROFILE && path.join(env.USERPROFILE, "AppData", "Roaming", "npm", "node_modules", "@railway", "cli", "bin", "railway.js"),
  ].filter(Boolean);
  const resolved = candidates.find((candidate) => fsImpl.existsSync(candidate) && fsImpl.statSync(candidate).isFile());
  if (!resolved || !resolved.replace(/\\/g, "/").endsWith("/node_modules/@railway/cli/bin/railway.js")) {
    throw new SoakJobError("SOAK_RAILWAY_CLI_NOT_FOUND", "Railway CLI oficial nao encontrado.");
  }
  return resolved;
}

function defaultRailwayCommand(args) {
  const cliScript = resolveRailwayCliScript();
  const result = spawnSync(process.execPath, [cliScript, ...args], { encoding: "utf8", windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"], timeout: 120000 });
  if (result.error || result.status !== 0) throw new SoakJobError("SOAK_RAILWAY_COMMAND_FAILED", "Comando Railway staging falhou.");
  try { return JSON.parse(String(result.stdout || "")); }
  catch { throw new SoakJobError("SOAK_RAILWAY_RESPONSE_INVALID", "Resposta Railway invalida."); }
}

function railwayArgs(command, serviceId) {
  return [
    ...command,
    "--project", EXPECTED.projectId,
    "--environment", EXPECTED.environmentId,
    "--service", serviceId,
    "--json",
  ];
}

function loadPublicStagingDatabaseUrl({ runRailway = defaultRailwayCommand } = {}) {
  const payload = runRailway(railwayArgs(["variable", "list"], EXPECTED.databaseServiceId));
  const variables = payload?.variables && typeof payload.variables === "object" ? payload.variables : payload;
  if (!variables || typeof variables !== "object"
    || variables.RAILWAY_PROJECT_ID !== EXPECTED.projectId
    || variables.RAILWAY_ENVIRONMENT_ID !== EXPECTED.environmentId
    || variables.RAILWAY_SERVICE_ID !== EXPECTED.databaseServiceId) {
    throw new SoakJobError("SOAK_DATABASE_IDENTITY_MISMATCH", "Variaveis nao pertencem ao PostgreSQL de staging.");
  }
  const internalValue = String(variables.DATABASE_URL || "").trim();
  const proxyDomain = String(variables.RAILWAY_TCP_PROXY_DOMAIN || "").trim().toLowerCase();
  const proxyPort = Number(variables.RAILWAY_TCP_PROXY_PORT);
  const applicationPort = Number(variables.RAILWAY_TCP_APPLICATION_PORT);
  let parsed;
  try { parsed = new URL(internalValue); }
  catch { throw new SoakJobError("SOAK_DATABASE_INTERNAL_URL_REQUIRED", "URL interna do PostgreSQL de staging ausente."); }
  const proxyAllowed = ["proxy.rlwy.net", "railway.app"].some((suffix) => proxyDomain === suffix || proxyDomain.endsWith(`.${suffix}`));
  if (!parsed.protocol.startsWith("postgres") || parsed.hostname.toLowerCase() !== EXPECTED.databaseHost
    || applicationPort !== 5432 || !proxyAllowed || !/^[a-z0-9.-]+$/.test(proxyDomain)
    || !Number.isSafeInteger(proxyPort) || proxyPort < 1 || proxyPort > 65535) {
    throw new SoakJobError("SOAK_DATABASE_PUBLIC_URL_INVALID", "Metadata do proxy PostgreSQL de staging invalida.");
  }
  parsed.hostname = proxyDomain;
  parsed.port = String(proxyPort);
  return parsed.toString();
}

function loadApiStagingMetadata({ runRailway = defaultRailwayCommand } = {}) {
  const payload = runRailway(railwayArgs(["variable", "list"], EXPECTED.apiServiceId));
  const variables = payload?.variables && typeof payload.variables === "object" ? payload.variables : payload;
  const probeToken = String(variables?.STORE1_SOAK_PROBE_TOKEN || "");
  if (!variables || typeof variables !== "object"
    || variables.RAILWAY_PROJECT_ID !== EXPECTED.projectId
    || variables.RAILWAY_ENVIRONMENT_ID !== EXPECTED.environmentId
    || variables.RAILWAY_SERVICE_ID !== EXPECTED.apiServiceId
    || probeToken.length < 32) {
    throw new SoakJobError("SOAK_API_METADATA_MISMATCH", "Metadata segura da API staging indisponivel.");
  }
  return { probeToken };
}

function deploymentRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.deployments)) return payload.deployments;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function deploymentId(row) { return String(row?.id || row?.deploymentId || row?.deployment?.id || ""); }
function deploymentStatus(row) { return String(row?.status || row?.deploymentStatus || row?.state || "").toUpperCase(); }

function createLocalRailwayRestartHook({ config, fetchImpl = globalThis.fetch, runRailway = defaultRailwayCommand, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), maxPolls = 120 } = {}) {
  if (!config?.target || typeof fetchImpl !== "function") throw new SoakJobError("SOAK_RESTART_CONFIG_INVALID", "Restart hook invalido.");
  return async function restartStagingApi() {
    const before = deploymentRows(runRailway(railwayArgs(["deployment", "list", "--limit", "5"], EXPECTED.apiServiceId)));
    const priorId = deploymentId(before[0]);
    const started = runRailway([
      "redeploy",
      "--project", EXPECTED.projectId,
      "--environment", EXPECTED.environmentId,
      "--service", EXPECTED.apiServiceId,
      "--yes",
      "--json",
    ]);
    let expectedId = deploymentId(started);
    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      const rows = deploymentRows(runRailway(railwayArgs(["deployment", "list", "--limit", "5"], EXPECTED.apiServiceId)));
      const candidate = expectedId ? rows.find((row) => deploymentId(row) === expectedId) : rows.find((row) => deploymentId(row) && deploymentId(row) !== priorId);
      if (candidate) {
        expectedId ||= deploymentId(candidate);
        const status = deploymentStatus(candidate);
        if (["FAILED", "CRASHED", "REMOVED"].includes(status)) throw new SoakJobError("SOAK_RESTART_DEPLOY_FAILED", "Redeploy da API staging falhou.");
        if (status === "SUCCESS") {
          for (const requestPath of [config.healthPath, config.readyPath]) {
            const response = await fetchImpl(new URL(requestPath, config.target), { method: "GET", redirect: "manual", signal: AbortSignal.timeout(config.timeoutMs) });
            if (Number(response.status) !== 200) throw new SoakJobError("SOAK_RESTART_HEALTH_FAILED", "API staging nao voltou saudavel.");
          }
          await verifyRuntimeFingerprint({ config, fetchImpl });
          return { deploymentIdHash: crypto.createHash("sha256").update(expectedId).digest("hex").slice(0, 20), status: "SUCCESS" };
        }
      }
      await sleep(5000);
    }
    throw new SoakJobError("SOAK_RESTART_TIMEOUT", "Redeploy da API staging excedeu o prazo.");
  };
}

function destroyIdentitySecrets(identities) {
  for (const identity of identities || []) {
    identity.email = "";
    identity.password = "";
  }
}

async function runStagingSoakJob(options = {}) {
  const env = options.env || process.env;
  const target = assertSoakJobTarget(env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const config = resolveConfig({ env, requireCredentials: false });
  const verifyFingerprint = options.verifyFingerprint || verifyRuntimeFingerprint;
  await verifyFingerprint({ config, fetchImpl });

  const PrismaClient = options.PrismaClient || require("@prisma/client").PrismaClient;
  const bcrypt = options.bcrypt || require("bcryptjs");
  const prisma = options.prisma || new PrismaClient({ datasourceUrl: target.databaseUrl });
  const ownsPrisma = !options.prisma;
  const runId = (options.randomUUID || crypto.randomUUID)();
  try {
    const tenant = await verifyExpectedTenant(prisma, target);
    return await executeMissionUnderLease({ prisma, tenant, bcrypt, runId, config, env, fetchImpl, options, restartHook: options.restartHook });
  } finally {
    if (ownsPrisma) await prisma.$disconnect();
  }
}

async function runLocalStagingSoakLauncher(options = {}) {
  const env = options.env || process.env;
  const target = assertLocalLauncherTarget(env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const apiMetadata = options.apiMetadata || loadApiStagingMetadata({ runRailway: options.runRailway });
  const privateEnv = { ...env, STORE1_SOAK_PROBE_TOKEN: apiMetadata.probeToken, STORE1_SOAK_SOURCE_MANIFEST_VERSION: SOURCE_MANIFEST_VERSION, STORE1_SOAK_SOURCE_MANIFEST_SHA256: sourceManifestSha256() };
  const config = resolveConfig({ env: privateEnv, requireCredentials: false });
  const verifyFingerprint = options.verifyFingerprint || verifyRuntimeFingerprint;
  await verifyFingerprint({ config, fetchImpl });
  const databaseUrl = options.databaseUrl || loadPublicStagingDatabaseUrl({ runRailway: options.runRailway });
  const PrismaClient = options.PrismaClient || require("@prisma/client").PrismaClient;
  const bcrypt = options.bcrypt || require("bcryptjs");
  const prisma = options.prisma || new PrismaClient({ datasourceUrl: databaseUrl });
  const ownsPrisma = !options.prisma;
  const runId = (options.randomUUID || crypto.randomUUID)();
  try {
    const restartHook = options.restartHook || createLocalRailwayRestartHook({
      config,
      fetchImpl,
      runRailway: options.runRailway,
      sleep: options.restartSleep,
      maxPolls: options.restartMaxPolls,
    });
    if (typeof restartHook !== "function") throw new SoakJobError("SOAK_RESTART_HOOK_REQUIRED", "Restart hook do staging obrigatorio.");
    const tenant = await verifyExpectedTenant(prisma, target);
    return await executeMissionUnderLease({ prisma, tenant, bcrypt, runId, config, env: privateEnv, fetchImpl, options, restartHook });
  } finally {
    if (ownsPrisma) await prisma.$disconnect();
  }
}

async function main() {
  return runLocalStagingSoakLauncher();
}

if (require.main === module) {
  main()
    .then((result) => {
      console.log(JSON.stringify({
        event: "store1_staging_soak_job",
        status: result.status,
        sourceSha: result.sourceSha,
        targetHost: result.targetHost,
        qaIdentities: result.qaIdentities,
        metrics: result.metrics,
        blockers: result.blockers,
        ledgerPath: result.ledgerPath,
      }, null, 2));
      if (result.status !== "PASS") process.exitCode = 1;
    })
    .catch((error) => {
      console.error(JSON.stringify({ event: "store1_staging_soak_job", safe: false, error: { code: String(error?.code || "SOAK_JOB_FAILED").slice(0, 80) } }));
      process.exitCode = 1;
    });
}

module.exports = {
  EXPECTED,
  SoakJobError,
  assertLocalLauncherTarget,
  assertSoakJobTarget,
  cleanupSyntheticUsers,
  createLocalRailwayRestartHook,
  createTenantJobMetricsProvider,
  destroyIdentitySecrets,
  provisionSyntheticUsers,
  recoverAbandonedSyntheticUsers,
  loadApiStagingMetadata,
  loadPublicStagingDatabaseUrl,
  resolveRailwayCliScript,
  runLocalStagingSoakLauncher,
  runStagingSoakJob,
  verifyExpectedTenant,
};
