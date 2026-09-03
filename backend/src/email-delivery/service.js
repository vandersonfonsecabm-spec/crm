"use strict";

const crypto = require("node:crypto");
const { openDeliveryToken, sealDeliveryToken } = require("./crypto");
const { buildSecurityActionUrl } = require("./links");
const { classifyDeliveryError, createUnconfiguredEmailDeliveryPort, sanitizeErrorCode } = require("./port");

const ACTIVE_STATUSES = ["PENDING", "RETRY_WAIT", "PROCESSING"];
const TERMINAL_STATUSES = new Set(["DELIVERED", "FAILED", "BOUNCED", "EXPIRED", "CANCELLED"]);
const SOURCE_MODELS = Object.freeze({
  USER_INVITE: "conviteUsuario",
  PASSWORD_RESET: "tokenRecuperacaoSenha",
});

function createEmailDeliveryService({ prisma, port = createUnconfiguredEmailDeliveryPort(), env = process.env, logger = console } = {}) {
  if (!prisma?.emailDeliveryOutbox || !prisma?.emailDeliveryEvent) throw deliveryError("EMAIL_DELIVERY_SCHEMA_UNAVAILABLE");

  async function enqueue(input) {
    if (!input?.tx) return prisma.$transaction((tx) => enqueue({ ...input, tx }));
    const { tx, empresaId, kind, sourceId, expectedRevision = 0, recipient, token, expiresAt, correlationId = null } = input;
    const context = validateEnqueueInput({ empresaId, kind, sourceId, expectedRevision, recipient, token, expiresAt });
    const modelName = SOURCE_MODELS[context.kind];
    const model = tx[modelName];
    if (!model) throw deliveryError("EMAIL_DELIVERY_SOURCE_UNAVAILABLE");
    const targetVersion = context.expectedRevision + 1;
    const deliveryId = crypto.randomUUID();
    const sourceWhere = {
      id: context.sourceId,
      empresaId: context.empresaId,
      deliveryRevision: context.expectedRevision,
      ...(context.kind === "USER_INVITE" ? { aceitoEm: null, revogadoEm: null } : { usadoEm: null, revogadoEm: null }),
    };
    const sourceData = {
      deliveryRevision: { increment: 1 },
      ...(context.kind === "USER_INVITE" ? { deliveryStatus: "PENDING" } : {}),
    };
    const sourceChanged = await model.updateMany({ where: sourceWhere, data: sourceData });
    if (sourceChanged.count !== 1) throw deliveryError("EMAIL_DELIVERY_SOURCE_CONFLICT", 409);

    await cancelPriorDeliveries({
      tx,
      empresaId: context.empresaId,
      sourceType: context.kind,
      sourceId: context.sourceId,
      beforeVersion: targetVersion,
      status: "CANCELLED",
      now: new Date(),
    });

    const tokenContext = {
      empresaId: context.empresaId,
      deliveryId,
      kind: context.kind,
      targetId: context.sourceId,
      targetVersion,
    };
    const row = await tx.emailDeliveryOutbox.create({
      data: {
        id: deliveryId,
        empresaId: context.empresaId,
        kind: context.kind,
        sourceType: context.kind,
        sourceId: context.sourceId,
        targetVersion,
        idempotencyKey: idempotencyKey(context.empresaId, context.kind, context.sourceId, targetVersion),
        recipientNormalized: context.recipient,
        payloadCiphertext: sealDeliveryToken(context.token, tokenContext, { env }),
        status: "PENDING",
        attempts: 0,
        availableAt: new Date(),
        expiresAt: context.expiresAt,
        correlationId: sanitizeCorrelationId(correlationId),
      },
    });
    await appendEvent(tx, row, { type: "QUEUED", status: "PENDING", attempt: 0 });
    return publicDelivery(row);
  }

  async function cancelSources({ tx = prisma, empresaId, sourceType, sourceIds, status = "CANCELLED", now = new Date() }) {
    const safeEmpresaId = positiveInteger(empresaId);
    const safeSourceType = normalizedKind(sourceType);
    const ids = [...new Set((sourceIds || []).map((value) => String(value || "").trim()).filter(Boolean))];
    if (!safeEmpresaId || !safeSourceType || !ids.length) return { count: 0 };
    const rows = await tx.emailDeliveryOutbox.findMany({
      where: { empresaId: safeEmpresaId, sourceType: safeSourceType, sourceId: { in: ids }, status: { in: ACTIVE_STATUSES } },
      select: { id: true, empresaId: true, attempts: true },
    });
    let count = 0;
    for (const row of rows) {
      const changed = await tx.emailDeliveryOutbox.updateMany({
        where: { id: row.id, empresaId: row.empresaId, status: { in: ACTIVE_STATUSES } },
        data: terminalUpdate(status, now, "EMAIL_DELIVERY_SOURCE_CANCELLED"),
      });
      if (changed.count === 1) {
        count += 1;
        await appendEvent(tx, row, { type: status, status, attempt: row.attempts, errorCode: status === "EXPIRED" ? "EMAIL_DELIVERY_EXPIRED" : null });
      }
    }
    return { count };
  }

  async function claimDue({ now = new Date(), limit = 20, leaseOwner, leaseMs = 30_000, signal = null }) {
    if (isAbortRequested(signal)) return [];
    const owner = String(leaseOwner || "email-delivery-worker").slice(0, 128);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const leaseDuration = Math.min(10 * 60_000, Math.max(5_000, Number(leaseMs) || 30_000));
    const candidates = await prisma.emailDeliveryOutbox.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        availableAt: { lte: now },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
      },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: safeLimit * 4,
    });
    const claimed = [];
    for (const row of candidates) {
      if (isAbortRequested(signal)) break;
      if (claimed.length >= safeLimit) break;
      const leaseToken = crypto.randomUUID();
      const leaseExpiresAt = new Date(now.getTime() + leaseDuration);
      const attempt = Number(row.attempts || 0) + 1;
      const result = await prisma.$transaction(async (tx) => {
        const changed = await tx.emailDeliveryOutbox.updateMany({
          where: {
            id: row.id,
            empresaId: row.empresaId,
            status: { in: ACTIVE_STATUSES },
            availableAt: { lte: now },
            OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
          },
          data: { status: "PROCESSING", leaseOwner: owner, leaseToken, leaseExpiresAt, attempts: { increment: 1 } },
        });
        if (changed.count !== 1) return null;
        await appendEvent(tx, row, { type: "CLAIMED", status: "PROCESSING", attempt });
        return { ...row, status: "PROCESSING", leaseOwner: owner, leaseToken, leaseExpiresAt, attempts: attempt };
      });
      if (result) {
        if (isAbortRequested(signal)) {
          await releaseClaim(result, { now });
          break;
        }
        claimed.push(result);
      }
    }
    return claimed;
  }

  async function processDue({ now = new Date(), limit = 20, leaseOwner, leaseMs = 30_000, timeoutMs = 15_000, maxAttempts = 5, signal = null } = {}) {
    if (isAbortRequested(signal)) return { disabled: false, claimed: 0, delivered: 0, retried: 0, failed: 0, expired: 0, cancelled: 0, stopped: true };
    if (port?.configured !== true || typeof port.send !== "function") return { disabled: true, claimed: 0, delivered: 0, retried: 0, failed: 0, expired: 0, cancelled: 0 };
    const rows = await claimDue({ now, limit, leaseOwner, leaseMs, signal });
    const result = { disabled: false, claimed: rows.length, delivered: 0, retried: 0, failed: 0, expired: 0, cancelled: 0, stopped: false };
    for (const row of rows) {
      if (isAbortRequested(signal)) {
        await releaseClaim(row, { now });
        result.cancelled += 1;
        result.stopped = true;
        continue;
      }
      const outcome = await processClaimed(row, { now, timeoutMs, maxAttempts, signal });
      result[outcome] += 1;
      if (isAbortRequested(signal)) result.stopped = true;
    }
    return result;
  }

  async function recordProviderEvent({ empresaId, deliveryId, providerEventId, providerOccurredAt, status, providerMessageId = null, errorCode = null, metadata = null }) {
    const safeEmpresaId = positiveInteger(empresaId);
    const safeDeliveryId = String(deliveryId || "").trim();
    const safeEventId = String(providerEventId || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 200);
    const occurredAt = providerOccurredAt instanceof Date ? providerOccurredAt : new Date(providerOccurredAt);
    const nextStatus = normalizedProviderStatus(status);
    if (!safeEmpresaId || !safeDeliveryId || !safeEventId || Number.isNaN(occurredAt.getTime()) || !nextStatus) {
      throw deliveryError("EMAIL_DELIVERY_PROVIDER_EVENT_INVALID", 400);
    }
    try {
      return await prisma.$transaction(async (tx) => {
        const duplicate = await tx.emailDeliveryEvent.findFirst({ where: { empresaId: safeEmpresaId, providerEventId: safeEventId } });
        if (duplicate) return { duplicate: true, applied: false, status: duplicate.status };
        const delivery = await tx.emailDeliveryOutbox.findFirst({ where: { id: safeDeliveryId, empresaId: safeEmpresaId } });
        if (!delivery) throw deliveryError("EMAIL_DELIVERY_NOT_FOUND", 404);
        if (delivery.providerMessageId && providerMessageId && delivery.providerMessageId !== sanitizeProviderMessageId(providerMessageId)) {
          throw deliveryError("EMAIL_DELIVERY_PROVIDER_MESSAGE_MISMATCH", 409);
        }
        const latest = await tx.emailDeliveryEvent.findFirst({
          where: { empresaId: safeEmpresaId, deliveryId: safeDeliveryId, providerEventId: { not: null }, providerOccurredAt: { not: null } },
          orderBy: [{ providerOccurredAt: "desc" }, { id: "desc" }],
        });
        const stale = latest?.providerOccurredAt instanceof Date && latest.providerOccurredAt >= occurredAt;
        const allowed = !stale && providerTransitionAllowed(delivery.status, nextStatus);
        const eventStatus = allowed ? nextStatus : delivery.status;
        await tx.emailDeliveryEvent.create({
          data: {
            empresaId: safeEmpresaId,
            deliveryId: safeDeliveryId,
            type: allowed ? `PROVIDER_${nextStatus}` : "PROVIDER_EVENT_IGNORED",
            status: eventStatus,
            attempt: Number(delivery.attempts || 0),
            providerMessageId: sanitizeProviderMessageId(providerMessageId || delivery.providerMessageId),
            providerEventId: safeEventId,
            providerOccurredAt: occurredAt,
            errorCode: errorCode ? sanitizeErrorCode(errorCode) : null,
            metadataSanitizedJson: sanitizedProviderMetadata(metadata),
          },
        });
        if (!allowed) return { duplicate: false, applied: false, stale, status: delivery.status };
        const changed = await tx.emailDeliveryOutbox.updateMany({
          where: { id: safeDeliveryId, empresaId: safeEmpresaId, status: delivery.status, updatedAt: delivery.updatedAt },
          data: {
            status: nextStatus,
            providerMessageId: sanitizeProviderMessageId(providerMessageId || delivery.providerMessageId),
            lastErrorCode: errorCode ? sanitizeErrorCode(errorCode) : delivery.lastErrorCode,
            ...(nextStatus === "DELIVERED" ? { deliveredAt: occurredAt } : { failedAt: occurredAt }),
          },
        });
        if (changed.count !== 1) throw deliveryError("EMAIL_DELIVERY_PROVIDER_EVENT_CONFLICT", 409);
        await projectInviteStatus(tx, delivery, nextStatus);
        return { duplicate: false, applied: true, stale: false, status: nextStatus };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      const duplicate = await prisma.emailDeliveryEvent.findFirst({ where: { empresaId: safeEmpresaId, providerEventId: safeEventId } });
      if (duplicate) return { duplicate: true, applied: false, status: duplicate.status };
      throw error;
    }
  }

  async function processClaimed(row, { now, timeoutMs, maxAttempts, signal = null }) {
    try {
      throwIfAbortRequested(signal);
      const source = await readEligibleSource(row, now);
      if (!source || row.expiresAt <= now) {
        await completeClaim(row, "EXPIRED", { now, errorCode: "EMAIL_DELIVERY_EXPIRED" });
        return "expired";
      }
      const context = deliveryContext(row);
      const token = openDeliveryToken(row.payloadCiphertext, context, { env });
      const actionUrl = buildSecurityActionUrl({ kind: row.kind, token, env });
      const providerResult = await withTimeout(
        (deliverySignal) => port.send({
          deliveryId: row.id,
          idempotencyKey: row.idempotencyKey,
          kind: row.kind,
          to: row.recipientNormalized,
          actionUrl,
          expiresAt: row.expiresAt,
          signal: deliverySignal,
        }),
        timeoutMs,
        { signal },
      );
      await completeClaim(row, "DELIVERED", { now: new Date(), providerMessageId: providerResult?.providerMessageId });
      return "delivered";
    } catch (error) {
      if (isWorkerStopBeforeDelivery(error)) {
        await releaseClaim(row, { now });
        return "cancelled";
      }
      if (isAmbiguousDeliveryOutcome(error)) {
        await completeClaim(row, "FAILED", { now: new Date(), errorCode: "EMAIL_DELIVERY_TIMEOUT_AMBIGUOUS" });
        logger.warn?.("security_email_delivery_ambiguous", { deliveryId: row.id, code: "EMAIL_DELIVERY_TIMEOUT_AMBIGUOUS", attempt: row.attempts });
        return "failed";
      }
      const classified = classifyDeliveryError(error);
      if (classified.transient && Number(row.attempts || 0) < Math.max(1, Number(maxAttempts) || 5)) {
        const availableAt = new Date(now.getTime() + retryDelayMs(row.attempts));
        await retryClaim(row, { availableAt, errorCode: classified.code });
        logger.warn?.("security_email_delivery_retry", { deliveryId: row.id, code: classified.code, attempt: row.attempts });
        return "retried";
      }
      await completeClaim(row, "FAILED", { now: new Date(), errorCode: classified.code });
      logger.warn?.("security_email_delivery_failed", { deliveryId: row.id, code: classified.code, attempt: row.attempts });
      return "failed";
    }
  }

  async function readEligibleSource(row, now) {
    const modelName = SOURCE_MODELS[row.sourceType];
    const model = prisma[modelName];
    if (!model) return null;
    return model.findFirst({
      where: {
        id: row.sourceId,
        empresaId: row.empresaId,
        deliveryRevision: row.targetVersion,
        ...(row.sourceType === "USER_INVITE"
          ? { aceitoEm: null, revogadoEm: null, expiraEm: { gt: now } }
          : { usadoEm: null, revogadoEm: null, expiraEm: { gt: now } }),
      },
      select: { id: true },
    });
  }

  async function retryClaim(row, { availableAt, errorCode }) {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.emailDeliveryOutbox.updateMany({
        where: claimWhere(row),
        data: {
          status: "RETRY_WAIT",
          availableAt,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          lastErrorCode: sanitizeErrorCode(errorCode),
        },
      });
      if (changed.count !== 1) throw Object.assign(deliveryError("EMAIL_DELIVERY_LEASE_LOST", 409), { transient: true });
      await projectInviteStatus(tx, row, "RETRY_WAIT");
      await appendEvent(tx, row, { type: "RETRY_SCHEDULED", status: "RETRY_WAIT", attempt: row.attempts, errorCode });
    });
  }

  async function releaseClaim(row, { now }) {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.emailDeliveryOutbox.updateMany({
        where: claimWhere(row),
        data: {
          status: "PENDING",
          attempts: { decrement: 1 },
          availableAt: now,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
      if (changed.count !== 1) return;
      await projectInviteStatus(tx, row, "PENDING");
      await appendEvent(tx, row, { type: "RELEASED_FOR_SHUTDOWN", status: "PENDING", attempt: Math.max(0, Number(row.attempts || 0) - 1) });
    });
  }

  async function completeClaim(row, status, { now, providerMessageId = null, errorCode = null }) {
    if (!TERMINAL_STATUSES.has(status)) throw deliveryError("EMAIL_DELIVERY_STATUS_INVALID");
    await prisma.$transaction(async (tx) => {
      const changed = await tx.emailDeliveryOutbox.updateMany({
        where: claimWhere(row),
        data: {
          ...terminalUpdate(status, now, errorCode),
          providerMessageId: sanitizeProviderMessageId(providerMessageId),
        },
      });
      if (changed.count !== 1) throw Object.assign(deliveryError("EMAIL_DELIVERY_LEASE_LOST", 409), { transient: true });
      await projectInviteStatus(tx, row, status);
      await appendEvent(tx, row, { type: status, status, attempt: row.attempts, providerMessageId, errorCode });
    });
  }

  return { cancelSources, claimDue, enqueue, processDue, recordProviderEvent };
}

async function cancelPriorDeliveries({ tx, empresaId, sourceType, sourceId, beforeVersion, status, now }) {
  const rows = await tx.emailDeliveryOutbox.findMany({
    where: { empresaId, sourceType, sourceId, targetVersion: { lt: beforeVersion }, status: { in: ACTIVE_STATUSES } },
  });
  for (const row of rows) {
    const changed = await tx.emailDeliveryOutbox.updateMany({
      where: { id: row.id, empresaId, status: { in: ACTIVE_STATUSES } },
      data: terminalUpdate(status, now, "EMAIL_DELIVERY_SUPERSEDED"),
    });
    if (changed.count === 1) await appendEvent(tx, row, { type: "SUPERSEDED", status, attempt: row.attempts, errorCode: "EMAIL_DELIVERY_SUPERSEDED" });
  }
}

async function projectInviteStatus(tx, row, status) {
  if (row.sourceType !== "USER_INVITE" || !tx.conviteUsuario) return;
  await tx.conviteUsuario.updateMany({
    where: { id: row.sourceId, empresaId: row.empresaId, deliveryRevision: row.targetVersion },
    data: { deliveryStatus: status },
  });
}

async function appendEvent(tx, row, { type, status, attempt, providerMessageId = null, errorCode = null, metadataSanitizedJson = null }) {
  return tx.emailDeliveryEvent.create({
    data: {
      empresaId: row.empresaId,
      deliveryId: row.id,
      type: String(type || status).slice(0, 80),
      status,
      attempt: Math.max(0, Number(attempt) || 0),
      providerMessageId: sanitizeProviderMessageId(providerMessageId),
      errorCode: errorCode ? sanitizeErrorCode(errorCode) : null,
      metadataSanitizedJson: metadataSanitizedJson ? String(metadataSanitizedJson).slice(0, 1000) : null,
    },
  });
}

function validateEnqueueInput(input) {
  const empresaId = positiveInteger(input.empresaId);
  const kind = normalizedKind(input.kind);
  const sourceId = String(input.sourceId || "").trim();
  const expectedRevision = Number(input.expectedRevision);
  const recipient = String(input.recipient || "").trim().toLowerCase();
  const token = String(input.token || "");
  const expiresAt = input.expiresAt instanceof Date ? input.expiresAt : new Date(input.expiresAt);
  if (!empresaId || !kind || !sourceId || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || !token || Number.isNaN(expiresAt.getTime())) {
    throw deliveryError("EMAIL_DELIVERY_INPUT_INVALID", 400);
  }
  return { empresaId, kind, sourceId, expectedRevision, recipient, token, expiresAt };
}

function deliveryContext(row) {
  return { empresaId: row.empresaId, deliveryId: row.id, kind: row.kind, targetId: row.sourceId, targetVersion: row.targetVersion };
}

function claimWhere(row) {
  return { id: row.id, empresaId: row.empresaId, status: "PROCESSING", leaseOwner: row.leaseOwner, leaseToken: row.leaseToken, leaseExpiresAt: row.leaseExpiresAt };
}

function terminalUpdate(status, now, errorCode) {
  return {
    status,
    payloadCiphertext: null,
    leaseOwner: null,
    leaseToken: null,
    leaseExpiresAt: null,
    lastErrorCode: errorCode ? sanitizeErrorCode(errorCode) : null,
    ...(status === "DELIVERED" ? { deliveredAt: now } : {}),
    ...(["FAILED", "BOUNCED", "EXPIRED", "CANCELLED"].includes(status) ? { failedAt: now } : {}),
  };
}

function retryDelayMs(attempt) {
  return Math.min(15 * 60_000, Math.max(1_000, 2 ** Math.max(0, Number(attempt) || 1) * 1_000));
}

function withTimeout(operation, timeoutMs, { signal = null } = {}) {
  const duration = Math.min(120_000, Math.max(1_000, Number(timeoutMs) || 15_000));
  let timer;
  const controller = new AbortController();
  throwIfAbortRequested(signal);
  let removeAbortListener = null;
  const abort = new Promise((_resolve, reject) => {
    const onAbort = () => {
      const error = Object.assign(new Error("EMAIL_DELIVERY_ABORTED_AMBIGUOUS"), {
        code: "EMAIL_DELIVERY_ABORTED_AMBIGUOUS",
        ambiguous: true,
      });
      reject(error);
      controller.abort(error);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => signal?.removeEventListener("abort", onAbort);
  });
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(new Error("EMAIL_DELIVERY_TIMEOUT"), {
        code: "EMAIL_DELIVERY_TIMEOUT",
        ambiguous: true,
      });
      reject(error);
      controller.abort(error);
    }, duration);
  });
  const delivery = Promise.resolve().then(() => operation(controller.signal));
  return Promise.race([delivery, timeout, abort]).finally(() => {
    if (timer) clearTimeout(timer);
    removeAbortListener?.();
  });
}

function isAbortRequested(signal) {
  return signal?.aborted === true;
}

function throwIfAbortRequested(signal) {
  if (!isAbortRequested(signal)) return;
  throw Object.assign(new Error("WORKER_STOPPED"), { code: "WORKER_STOPPED" });
}

function isWorkerStopBeforeDelivery(error) {
  return error?.code === "WORKER_STOPPED";
}

function isAmbiguousDeliveryOutcome(error) {
  return error?.ambiguous === true || ["EMAIL_DELIVERY_TIMEOUT", "EMAIL_DELIVERY_ABORTED_AMBIGUOUS"].includes(error?.code);
}

function publicDelivery(row) {
  return { id: row.id, status: row.status, kind: row.kind, expiresAt: row.expiresAt, targetVersion: row.targetVersion };
}

function normalizedKind(value) {
  const kind = String(value || "").trim().toUpperCase();
  return SOURCE_MODELS[kind] ? kind : null;
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function idempotencyKey(empresaId, kind, sourceId, version) {
  return ["security-email", empresaId, kind, sourceId, version].join(":").slice(0, 200);
}

function sanitizeCorrelationId(value) {
  const text = String(value || "").trim();
  return /^[a-zA-Z0-9._:-]{1,100}$/.test(text) ? text : null;
}

function sanitizeProviderMessageId(value) {
  const text = String(value || "").replace(/[\r\n\t]+/g, " ").trim();
  return text ? text.slice(0, 200) : null;
}

function normalizedProviderStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  return ["DELIVERED", "BOUNCED", "FAILED"].includes(status) ? status : null;
}

function providerTransitionAllowed(current, next) {
  if (current === "BOUNCED" || current === "CANCELLED" || current === "EXPIRED") return false;
  if (current === "FAILED") return false;
  if (next === "BOUNCED") return ["DELIVERED", "PROCESSING", "PENDING", "RETRY_WAIT"].includes(current);
  if (next === "DELIVERED") return ["PROCESSING", "PENDING", "RETRY_WAIT", "DELIVERED"].includes(current);
  if (next === "FAILED") return ["PROCESSING", "PENDING", "RETRY_WAIT"].includes(current);
  return false;
}

function sanitizedProviderMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sanitized = {};
  for (const key of ["reasonCode", "category"]) {
    const text = String(value[key] || "").replace(/[\r\n\t]+/g, " ").trim();
    if (text) sanitized[key] = text.slice(0, 120);
  }
  return Object.keys(sanitized).length ? JSON.stringify(sanitized) : null;
}

function deliveryError(code, status = 500) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

module.exports = { createEmailDeliveryService, retryDelayMs };
