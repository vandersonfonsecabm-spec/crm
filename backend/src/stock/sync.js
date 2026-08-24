"use strict";

const { StockError } = require("./errors");
const { buildStockEvent } = require("./events");
const { appendStockOutbox } = require("./outbox");
const { stockEnabledForTenant } = require("./flags");

const TRANSITIONS = Object.freeze({
  PENDING: ["RUNNING", "CANCELLED", "QUARANTINED"],
  RUNNING: ["SUCCEEDED", "PARTIAL", "RETRY_WAIT", "FAILED", "CANCELLED", "QUARANTINED"],
  RETRY_WAIT: ["RUNNING", "FAILED", "CANCELLED", "QUARANTINED"],
  SUCCEEDED: [], PARTIAL: ["RETRY_WAIT"], FAILED: ["RETRY_WAIT"], CANCELLED: [], QUARANTINED: [], SUPERSEDED: [],
});

function createStockSyncService({ prisma, canonicalService, adapterRegistry = new Map(), clock = () => new Date(), env = process.env, logger = console } = {}) {
  if (!prisma || !canonicalService) throw new Error("prisma e canonicalService obrigatorios");
  function assertSyncEnabled(empresaId) {
    if (!stockEnabledForTenant(empresaId, env, { source: true })) throw new StockError("STOCK_DISABLED", "Sincronizacao de estoque indisponivel.");
  }

  async function requireActiveSource({ db = prisma, empresaId, fonteId }) {
    const source = await db.fonteEstoque.findFirst({ where: { id: fonteId, empresaId } });
    if (!source) throw new StockError("STOCK_NOT_FOUND", "Fonte nao encontrada.");
    if (source.statusCiclo !== "ACTIVE") throw new StockError("STOCK_SOURCE_DISABLED", "Fonte nao esta ativa.");
    return source;
  }

  function leaseOwner(owner) {
    const value = String(owner || "").trim();
    if (!value) throw new StockError("STOCK_INVALID", "Identificador do worker obrigatorio.");
    return value.slice(0, 128);
  }

  function leaseLostError(message = "Lease da sincronizacao expirou.") {
    const error = new StockError("STOCK_CONFLICT", message);
    error.syncLeaseLost = true;
    return error;
  }

  function ownsLiveLease(run, owner, now = clock()) {
    const expiresAt = run?.leaseExpiresAt ? new Date(run.leaseExpiresAt) : null;
    return run?.estado === "RUNNING"
      && run.leaseOwner === owner
      && expiresAt
      && !Number.isNaN(expiresAt.getTime())
      && expiresAt.getTime() > now.getTime();
  }

  async function createRun({ empresaId, fonteId, modo = "IMPORT", actorUsuarioId, correlationId, snapshotGeneration = null, importacaoId = null }) {
    assertSyncEnabled(empresaId);
    const write = async (tx) => {
      await requireActiveSource({ db: tx, empresaId, fonteId });
      const run = await tx.execucaoSincronizacaoEstoque.create({ data: { empresaId, fonteId, modo, estado: "PENDING", snapshotGeneration, correlationId, retentionUntil: new Date(clock().getTime() + 90 * 86400000) } });
      if (importacaoId) {
        const linked = await tx.importacaoEstoque.updateMany({ where: { id: importacaoId, empresaId, revision: { gt: 0 } }, data: { syncRunId: run.id, updatedAt: clock() } });
        if (linked.count !== 1) throw new StockError("STOCK_CONFLICT", "Importacao nao vinculada a sincronizacao.");
      }
      return run;
    };
    return prisma.$transaction ? prisma.$transaction(write) : write(prisma);
  }

  async function transitionRun({ empresaId, runId, from, to, patch = {} }) {
    assertSyncEnabled(empresaId);
    if (!TRANSITIONS[from]?.includes(to)) throw new StockError("STOCK_CONFLICT", "Transicao de sincronizacao invalida.");
    const current = await prisma.execucaoSincronizacaoEstoque.findFirst({ where: { id: runId, empresaId, estado: from } });
    if (!current) throw new StockError("STOCK_CONFLICT", "Execucao ja foi alterada ou nao existe.");
    // A disabled source may still be moved into a terminal/retry state to
    // release work, but it must never be advanced into a successful state.
    if (!["FAILED", "CANCELLED", "QUARANTINED", "RETRY_WAIT"].includes(to)) {
      await requireActiveSource({ empresaId, fonteId: current.fonteId });
    }
    const result = await prisma.execucaoSincronizacaoEstoque.updateMany({ where: { id: runId, empresaId, estado: from, revision: current.revision }, data: { ...patch, estado: to, revision: { increment: 1 }, updatedAt: clock() } });
    if (result.count !== 1) throw new StockError("STOCK_CONFLICT", "Execucao ja foi alterada ou nao existe.");
    return prisma.execucaoSincronizacaoEstoque.findFirst({ where: { id: runId, empresaId } });
  }

  async function acquireLease({ empresaId, runId, owner, leaseMs = 30000 }) {
    assertSyncEnabled(empresaId);
    const boundedOwner = leaseOwner(owner);
    const current = await prisma.execucaoSincronizacaoEstoque.findFirst({ where: { id: runId, empresaId } });
    if (!current) return null;
    await requireActiveSource({ empresaId, fonteId: current.fonteId });
    const now = clock();
    const expires = new Date(now.getTime() + Math.max(5000, Math.min(10 * 60 * 1000, Number(leaseMs) || 30000)));
    const result = await prisma.execucaoSincronizacaoEstoque.updateMany({
      where: {
        id: runId,
        empresaId,
        revision: current.revision,
        OR: [{ estado: "PENDING" }, { estado: "RETRY_WAIT" }, { estado: "RUNNING", OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] }],
      },
      data: { estado: "RUNNING", leaseOwner: boundedOwner, leaseExpiresAt: expires, revision: { increment: 1 }, updatedAt: now },
    });
    if (result.count !== 1) return null;
    return prisma.execucaoSincronizacaoEstoque.findFirst({ where: { id: runId, empresaId } });
  }

  async function advanceCheckpoint({ tx = prisma, empresaId, fonteId, run, cursor, generation, mode, owner = null }) {
    assertSyncEnabled(empresaId);
    await requireActiveSource({ db: tx, empresaId, fonteId });
    const now = clock();
    const boundedOwner = owner ? leaseOwner(owner) : null;
    const expectedLeaseExpiresAt = boundedOwner && run?.leaseExpiresAt ? new Date(run.leaseExpiresAt) : null;
    if (boundedOwner && (!expectedLeaseExpiresAt || Number.isNaN(expectedLeaseExpiresAt.getTime()) || expectedLeaseExpiresAt.getTime() <= now.getTime())) {
      throw leaseLostError();
    }
    const live = await tx.execucaoSincronizacaoEstoque.findFirst({
      where: {
        id: run.id,
        empresaId,
        fonteId,
        estado: "RUNNING",
        ...(boundedOwner ? { leaseOwner: boundedOwner, AND: [{ leaseExpiresAt: expectedLeaseExpiresAt }, { leaseExpiresAt: { gt: now } }] } : {}),
      },
    });
    if (!live) throw leaseLostError();
    const current = await tx.checkpointSincronizacaoEstoque.findFirst({ where: { empresaId, fonteId } });
    const data = { cursor: cursor ?? current?.cursor ?? null, sourceGeneration: generation ?? current?.sourceGeneration ?? null, revision: { increment: 1 }, updatedAt: clock() };
    if (mode === "FULL") data.lastFullSnapshotAt = clock();
    else if (["DELTA", "WEBHOOK"].includes(mode)) data.lastIncrementalSyncAt = clock();
    data.lastSuccessfulSyncAt = clock();
    if (!current) return tx.checkpointSincronizacaoEstoque.create({ data: { empresaId, fonteId, cursor: data.cursor, sourceGeneration: data.sourceGeneration, lastSuccessfulSyncAt: data.lastSuccessfulSyncAt, lastFullSnapshotAt: data.lastFullSnapshotAt || null, lastIncrementalSyncAt: data.lastIncrementalSyncAt || null, revision: 1 } });
    const result = await tx.checkpointSincronizacaoEstoque.updateMany({ where: { id: current.id, empresaId, revision: current.revision }, data });
    if (result.count !== 1) throw new StockError("STOCK_CONFLICT", "Checkpoint concorrente.");
    return tx.checkpointSincronizacaoEstoque.findFirst({ where: { id: current.id, empresaId } });
  }

  async function processRecords({ empresaId, fonteId, runId, records, mode = "IMPORT", cursor = null, generation = null, owner = "stock-worker", slaMs = null }) {
    assertSyncEnabled(empresaId);
    if (!Array.isArray(records)) throw new StockError("STOCK_INVALID", "Lote de registros invalido.");
    const boundedOwner = leaseOwner(owner);
    const run = await prisma.execucaoSincronizacaoEstoque.findFirst({ where: { id: runId, empresaId, fonteId } });
    if (!run) throw new StockError("STOCK_NOT_FOUND", "Execucao nao encontrada.");
    if (!["RUNNING", "PENDING", "RETRY_WAIT"].includes(run.estado)) throw new StockError("STOCK_CONFLICT", "Execucao nao esta processavel.");
    try {
      await requireActiveSource({ empresaId, fonteId });
    } catch (error) {
      if (run.estado === "RUNNING" && run.leaseOwner === boundedOwner) {
        await failOwnedRun({ empresaId, runId, owner: boundedOwner, run, error });
      }
      throw error;
    }
    const acquired = run.estado === "RUNNING" ? run : await acquireLease({ empresaId, runId, owner: boundedOwner });
    if (!acquired) throw new StockError("STOCK_CONFLICT", "Lease indisponivel.");
    if (!ownsLiveLease(acquired, boundedOwner)) throw leaseLostError("Lease da sincronizacao nao pertence ao worker.");
    let accepted = 0; let duplicate = 0;
    try {
      await prisma.$transaction(async (tx) => {
        for (const record of records) {
          const result = await canonicalService.applyNormalizedRecord({ empresaId, fonteId, syncRunId: runId, envelope: record, slaMs, tx });
          if (result.duplicate) duplicate += 1; else accepted += 1;
        }
        await advanceCheckpoint({ tx, empresaId, fonteId, run: acquired, cursor, generation, mode, owner: boundedOwner });
        const completedAt = clock();
        const changed = await tx.execucaoSincronizacaoEstoque.updateMany({ where: { id: runId, empresaId, estado: "RUNNING", leaseOwner: boundedOwner, AND: [{ leaseExpiresAt: acquired.leaseExpiresAt }, { leaseExpiresAt: { gt: completedAt } }] }, data: { lidos: { increment: records.length }, aceitos: { increment: accepted }, rejeitados: 0, estado: "SUCCEEDED", finishedAt: completedAt, cursorDepois: cursor, snapshotGeneration: generation, leaseOwner: null, leaseExpiresAt: null, revision: { increment: 1 }, updatedAt: completedAt } });
        if (changed.count !== 1) throw leaseLostError("Lease perdida antes do commit.");
        const event = buildStockEvent({ type: "StockSyncCompleted.v1", empresaId, syncRunId: runId, aggregateType: "StockSyncRun", aggregateId: String(runId), materialVersion: (acquired.revision || 1) + 1, correlationId: acquired.correlationId, payload: { accepted, rejected: 0, duplicate, mode } });
        await appendStockOutbox({ tx, event });
      });
      return { runId, accepted, rejected: 0, duplicate, partial: false, errorCode: null };
    } catch (error) {
      await failOwnedRun({ empresaId, runId, owner: boundedOwner, run: acquired, error });
      if (error?.syncLeaseLost !== true) logger.warn?.("stock_sync_failed", { runId, code: error?.code || "STOCK_SYNC_FAILED" });
      throw error;
    }
  }

  async function startRun({ empresaId, fonteId, runId, adapterType, context, owner, mode = "IMPORT", records }) {
    assertSyncEnabled(empresaId);
    const adapter = adapterRegistry.get(adapterType);
    if (!adapter) throw new StockError("STOCK_INVALID", "Adapter nao registrado.");
    const boundedOwner = leaseOwner(owner);
    const acquired = await acquireLease({ empresaId, runId, owner: boundedOwner });
    if (!acquired) throw new StockError("STOCK_CONFLICT", "Lease indisponivel.");
    if (Number(acquired.fonteId) !== Number(fonteId)) {
      await failOwnedRun({ empresaId, runId, owner: boundedOwner, run: acquired, error: new StockError("STOCK_FORBIDDEN", "Fonte da execucao nao corresponde ao contexto.") });
      throw new StockError("STOCK_FORBIDDEN", "Fonte da execucao nao corresponde ao contexto.");
    }
    const event = buildStockEvent({ type: "StockSyncStarted.v1", empresaId, syncRunId: runId, aggregateType: "StockSyncRun", aggregateId: String(runId), materialVersion: acquired.revision, correlationId: acquired.correlationId, payload: { adapterType, mode } });
    try {
      await prisma.$transaction((tx) => appendStockOutbox({ tx, event }));
      let sourceRecords = records;
      if (!sourceRecords) sourceRecords = mode === "IMPORT" ? await adapter.pullFullSnapshot(context) : await adapter.pullChanges(context, context?.cursor);
      return await processRecords({ empresaId, fonteId, runId, records: sourceRecords, mode, owner: boundedOwner, cursor: context?.cursor, generation: context?.generation });
    } catch (error) {
      await failOwnedRun({ empresaId, runId, owner: boundedOwner, run: acquired, error });
      throw error;
    }
  }

  async function failOwnedRun({ empresaId, runId, owner, run, error }) {
    if (error?.syncLeaseLost === true) return false;
    const failedAt = clock();
    const expectedLeaseExpiresAt = run?.leaseExpiresAt ? new Date(run.leaseExpiresAt) : null;
    if (!expectedLeaseExpiresAt || Number.isNaN(expectedLeaseExpiresAt.getTime()) || expectedLeaseExpiresAt.getTime() <= failedAt.getTime()) return false;
    try {
      const transition = async (tx) => {
        const changed = await tx.execucaoSincronizacaoEstoque.updateMany({
          where: {
            id: runId,
            empresaId,
            estado: "RUNNING",
            leaseOwner: owner,
            AND: [{ leaseExpiresAt: expectedLeaseExpiresAt }, { leaseExpiresAt: { gt: failedAt } }],
          },
        data: { estado: Number(run?.retryCount || 0) + 1 >= 3 ? "FAILED" : "RETRY_WAIT", retryCount: { increment: 1 }, errorClass: String(error?.code || "STOCK_SYNC_FAILED").slice(0, 120), leaseOwner: null, leaseExpiresAt: null, revision: { increment: 1 }, updatedAt: failedAt },
        });
        if (changed.count !== 1) return false;
        await emitFailureEvent({ tx, empresaId, run, runId, error });
        return true;
      };
      return prisma.$transaction ? await prisma.$transaction(transition) : await transition(prisma);
    } catch {
      return false;
    }
  }

  async function emitFailureEvent({ tx = prisma, empresaId, run, runId, error }) {
    const event = buildStockEvent({ type: "StockSyncFailed.v1", empresaId, syncRunId: runId, aggregateType: "StockSyncRun", aggregateId: String(runId), materialVersion: Number(run?.revision || 1) + 1, correlationId: run?.correlationId, payload: { errorClass: String(error?.code || "STOCK_SYNC_FAILED").slice(0, 120) } });
    return appendStockOutbox({ tx, event });
  }

  return { createRun, transitionRun, acquireLease, advanceCheckpoint, processRecords, startRun, transitions: TRANSITIONS };
}

module.exports = { createStockSyncService, TRANSITIONS };
