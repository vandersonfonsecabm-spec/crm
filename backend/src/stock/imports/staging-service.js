const crypto = require("node:crypto");
const { STOCK_CSV_SCHEMA_VERSION, createStockCsvAdapter } = require("../csv/stock-csv-v1");
const { stockError } = require("../shared/errors");
const { buildStockEvent } = require("../events");
const { appendStockOutbox } = require("../outbox");

const ACTIVE_IMPORT_STATUSES = new Set(["PREVIEW", "READY", "PROCESSING"]);
const QUOTA_IMPORT_STATUSES = new Set(["PREVIEW", "READY", "PROCESSING"]);
const EDITABLE_IMPORT_STATUSES = new Set(["PREVIEW", "READY"]);
const TERMINAL_IMPORT_STATUSES = new Set(["APPLIED", "PARTIAL", "CANCELLED", "EXPIRED", "FAILED"]);
const DEFAULT_PREVIEW_TTL_MS = 30 * 60 * 1000;
const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ACTIVE_BATCHES_PER_TENANT = 2;
const MAX_ACTIVE_BATCHES_PER_ACTOR = 1;
// Preview enforces this already; confirmation repeats the bound so a malformed
// or legacy staging record can never turn into an unbounded transaction.
const MAX_CONFIRM_LINES = 500;

function createStockImportService({
  prisma,
  adapter = createStockCsvAdapter(),
  featureGate = async () => false,
  applyAcceptedRows = null,
  syncService = null,
  clock = () => new Date(),
  previewTtlMs = DEFAULT_PREVIEW_TTL_MS,
  retentionMs = DEFAULT_RETENTION_MS,
} = {}) {
  if (!prisma) throw new Error("Prisma obrigatorio para importacao de estoque.");
  previewTtlMs = Math.min(24 * 60 * 60 * 1000, Math.max(60 * 1000, Number(previewTtlMs) || DEFAULT_PREVIEW_TTL_MS));
  retentionMs = Math.min(365 * 24 * 60 * 60 * 1000, Math.max(24 * 60 * 60 * 1000, Number(retentionMs) || DEFAULT_RETENTION_MS));

  async function preview({
    empresaId,
    fonteId,
    actorUsuarioId,
    idempotencyKey,
    content,
    delimiter,
    safeFilename,
    correlationId = null,
  } = {}) {
    assertContext({ empresaId, fonteId, actorUsuarioId });
    assertIdempotencyKey(idempotencyKey);
    await assertEnabled({ empresaId, fonteId });

    const source = await loadCsvSource({ empresaId, fonteId });
    const parsed = await adapter.parsePreview({
      input: content,
      delimiter,
      schemaVersion: STOCK_CSV_SCHEMA_VERSION,
    });
    const existing = await prisma.importacaoEstoque.findUnique({
      where: { empresaId_idempotencyKey: { empresaId, idempotencyKey } },
      include: importInclude(),
    });
    if (existing) {
      if (existing.fonteId !== fonteId || existing.fileHash !== parsed.fileHash || existing.schemaVersion !== STOCK_CSV_SCHEMA_VERSION) throw stockError(409, "STOCK_IMPORT_IDEMPOTENCY_CONFLICT", "Chave de idempotencia ja vinculada a outro arquivo.");
      return { replayed: true, importacao: presentImport(existing) };
    }
    const now = clockDate(clock);
    const expiresAt = new Date(now.getTime() + previewTtlMs);
    const retentionUntil = new Date(now.getTime() + retentionMs);
    await assertQuota({ empresaId, actorUsuarioId });

    const activeDuplicate = await prisma.importacaoEstoque.findFirst({
      where: {
        empresaId,
        fonteId,
        fileHash: parsed.fileHash,
        schemaVersion: STOCK_CSV_SCHEMA_VERSION,
        status: { in: [...ACTIVE_IMPORT_STATUSES] },
      },
      include: importInclude(),
    });
    if (activeDuplicate) return { replayed: true, importacao: presentImport(activeDuplicate) };

    try {
      const created = await prisma.$transaction(async (tx) => {
        await lockTenantQuota(tx, empresaId);
        await assertQuota({ empresaId, actorUsuarioId, db: tx });
        const importacao = await tx.importacaoEstoque.create({
          data: {
            empresaId,
            fonteId,
            actorUsuarioId,
            status: "READY",
            schemaVersion: STOCK_CSV_SCHEMA_VERSION,
            fileHash: parsed.fileHash,
            safeFilename: sanitizeFilename(safeFilename),
            byteSize: parsed.byteSize,
            rowCount: parsed.rowCount,
            acceptedCount: parsed.acceptedCount,
            rejectedCount: parsed.rejectedCount,
            idempotencyKey,
            correlationId: sanitizeCorrelationId(correlationId),
            revision: 1,
            expiresAt,
            retentionUntil,
          },
        });
        await tx.linhaImportacaoEstoque.createMany({
          data: parsed.lines.map((line) => ({
            empresaId,
            importacaoId: importacao.id,
            rowNumber: line.rowNumber,
            rowChecksum: line.rowChecksum,
            sourceRecordId: line.sourceRecordId,
            sourceVersion: line.sourceVersion,
            status: line.status,
            normalizedJsonSanitized: line.normalized ? JSON.stringify(line.normalized) : null,
            warningsJson: JSON.stringify(line.warnings),
            errorsJson: JSON.stringify(line.errors),
            retentionUntil,
            revision: 1,
          })),
        });
        if (typeof tx.capacidadeFonteEstoque?.upsert === "function") {
          const capabilityValues = parsed.capabilities?.capabilities || Object.fromEntries(Object.entries(parsed.capabilities || {}).filter(([key, value]) => key !== "schemaVersion" && key !== "semantics" && typeof value === "boolean"));
          for (const [codigo, suportada] of Object.entries(capabilityValues)) {
            await tx.capacidadeFonteEstoque.upsert({
              where: { empresaId_fonteId_codigo_versao: { empresaId, fonteId, codigo, versao: parsed.capabilities.version } },
              update: { suportada: suportada === true, semanticaJson: JSON.stringify(parsed.capabilities.semantics || {}), observadaEm: now },
              create: { empresaId, fonteId, codigo, suportada: suportada === true, versao: parsed.capabilities.version, semanticaJson: JSON.stringify(parsed.capabilities.semantics || {}), observadaEm: now },
            });
          }
        }
        await writeAudit(tx, {
          empresaId,
          actorUsuarioId,
          action: "STOCK_IMPORT_PREVIEW_CREATED",
          correlationId,
          after: { importacaoId: importacao.id, acceptedCount: parsed.acceptedCount, rejectedCount: parsed.rejectedCount },
        });
        return tx.importacaoEstoque.findFirst({ where: { id: importacao.id, empresaId }, include: importInclude() });
      });
      return { replayed: false, importacao: presentImport(created), capabilities: parsed.capabilities, source: presentSource(source) };
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      const replay = await prisma.importacaoEstoque.findUnique({
        where: { empresaId_idempotencyKey: { empresaId, idempotencyKey } },
        include: importInclude(),
      });
      if (replay) return { replayed: true, importacao: presentImport(replay) };
      throw stockError(409, "STOCK_IMPORT_CONFLICT", "Conflito ao criar importacao de estoque.");
    }
  }

  async function status({ empresaId, importacaoId } = {}) {
    assertTenantId(empresaId);
    assertPositiveInt(importacaoId, "importacaoId");
    await assertEnabled({ empresaId });
    const importacao = await prisma.importacaoEstoque.findFirst({
      where: { id: importacaoId, empresaId },
      include: importInclude(),
    });
    if (!importacao) throw stockError(404, "STOCK_IMPORT_NOT_FOUND", "Importacao de estoque nao encontrada.");
    return presentImport(importacao);
  }

  async function cancel({ empresaId, importacaoId, actorUsuarioId, expectedRevision, correlationId = null } = {}) {
    assertActorContext({ empresaId, actorUsuarioId });
    assertPositiveInt(importacaoId, "importacaoId");
    assertRevision(expectedRevision);
    await assertEnabled({ empresaId });
    const now = clockDate(clock);
    const importacao = await requireImport({ empresaId, importacaoId });
    if (isExpired(importacao, now)) {
      await expireIfEditable({ empresaId, importacaoId, now });
      throw stockError(409, "STOCK_IMPORT_EXPIRED", "Importacao de estoque expirada.");
    }
    if (!EDITABLE_IMPORT_STATUSES.has(importacao.status)) {
      if (TERMINAL_IMPORT_STATUSES.has(importacao.status)) return presentImport(importacao);
      throw stockError(409, "STOCK_IMPORT_NOT_CANCELLABLE", "Importacao de estoque nao pode ser cancelada.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.importacaoEstoque.updateMany({
        where: { id: importacaoId, empresaId, revision: expectedRevision, status: { in: [...EDITABLE_IMPORT_STATUSES] } },
        data: { status: "CANCELLED", cancelledAt: now, revision: { increment: 1 } },
      });
      if (changed.count !== 1) throw stockError(409, "STOCK_IMPORT_REVISION_CONFLICT", "Importacao de estoque foi alterada.");
      await writeAudit(tx, {
        empresaId,
        actorUsuarioId,
        action: "STOCK_IMPORT_CANCELLED",
        correlationId,
        after: { importacaoId, status: "CANCELLED" },
      });
      return tx.importacaoEstoque.findFirst({ where: { id: importacaoId, empresaId }, include: importInclude() });
    });
    return presentImport(updated);
  }

  async function confirm({ empresaId, importacaoId, actorUsuarioId, expectedRevision, correlationId = null, allowPartial = false } = {}) {
    assertActorContext({ empresaId, actorUsuarioId });
    assertPositiveInt(importacaoId, "importacaoId");
    assertRevision(expectedRevision);
    await assertEnabled({ empresaId });
    if (typeof applyAcceptedRows !== "function") {
      throw stockError(409, "STOCK_CANONICAL_APPLIER_REQUIRED", "Aplicador canonico de estoque indisponivel.");
    }
    const now = clockDate(clock);
    const importacao = await requireImport({ empresaId, importacaoId, includeLines: false });
    await loadCsvSource({ empresaId, fonteId: importacao.fonteId });
    if (isExpired(importacao, now)) {
      await expireIfEditable({ empresaId, importacaoId, now });
      throw stockError(409, "STOCK_IMPORT_EXPIRED", "Importacao de estoque expirada.");
    }
    if (["APPLIED", "PARTIAL"].includes(importacao.status)) return presentImport(importacao);
    if (importacao.status !== "READY") throw stockError(409, "STOCK_IMPORT_NOT_READY", "Importacao de estoque nao esta pronta para confirmacao.");
    if (importacao.rejectedCount > 0 && allowPartial !== true) throw stockError(409, "STOCK_IMPORT_PARTIAL_CONFIRM_REQUIRED", "Confirmacao parcial explicita obrigatoria.");
    assertConfirmationBounds(importacao);

    const finalized = await prisma.$transaction(async (tx) => {
      const claimed = await tx.importacaoEstoque.updateMany({
        where: { id: importacaoId, empresaId, status: "READY", revision: expectedRevision, expiresAt: { gt: now } },
        data: { status: "PROCESSING", confirmedAt: now, revision: { increment: 1 } },
      });
      if (claimed.count !== 1) throw stockError(409, "STOCK_IMPORT_REVISION_CONFLICT", "Importacao de estoque foi alterada.");
      const working = await tx.importacaoEstoque.findFirst({ where: { id: importacaoId, empresaId } });
      const syncRun = await tx.execucaoSincronizacaoEstoque.create({
        data: {
          empresaId,
          fonteId: working.fonteId,
          modo: "IMPORT",
          estado: "RUNNING",
          startedAt: now,
          correlationId: sanitizeCorrelationId(correlationId),
          retentionUntil: working.retentionUntil,
        },
      });
      await appendStockOutbox({ tx, event: buildStockEvent({ type: "StockSyncStarted.v1", empresaId, syncRunId: syncRun.id, aggregateType: "StockSyncRun", aggregateId: String(syncRun.id), materialVersion: 1, correlationId: working.correlationId, payload: { mode: "IMPORT" } }) });
      const acceptedLines = await tx.linhaImportacaoEstoque.findMany({
        where: { empresaId, importacaoId, status: "ACCEPTED" },
        orderBy: { rowNumber: "asc" },
        take: MAX_CONFIRM_LINES + 1,
      });
      if (acceptedLines.length > MAX_CONFIRM_LINES) {
        throw stockError(409, "STOCK_IMPORT_BOUNDS_EXCEEDED", "Importacao de estoque excede o limite de confirmacao.");
      }
      const result = await applyAcceptedRows({
        tx,
        empresaId,
        fonteId: working.fonteId,
        importacao: working,
        syncRun,
        lines: acceptedLines,
        now,
      }) || {};
      const appliedIds = normalizeAppliedIds(result.appliedLineIds, acceptedLines);
      if (appliedIds.length) {
        await tx.linhaImportacaoEstoque.updateMany({
          where: { empresaId, importacaoId, id: { in: appliedIds }, status: "ACCEPTED" },
          data: { status: "APPLIED", appliedAt: now, revision: { increment: 1 } },
        });
      }
      const appliedCount = appliedIds.length;
      const finalStatus = appliedCount === acceptedLines.length && working.rejectedCount === 0 ? "APPLIED" : "PARTIAL";
      if (finalStatus === "APPLIED" && syncService?.advanceCheckpoint) {
        await syncService.advanceCheckpoint({ tx, empresaId, fonteId: working.fonteId, run: syncRun, cursor: working.fileHash, generation: working.fileHash, mode: "IMPORT" });
      }
      await tx.execucaoSincronizacaoEstoque.update({
        where: { id: syncRun.id },
        data: {
          estado: finalStatus === "APPLIED" ? "SUCCEEDED" : "PARTIAL",
          finishedAt: now,
          lidos: working.rowCount,
          aceitos: appliedCount,
          rejeitados: working.rejectedCount + (acceptedLines.length - appliedCount),
        },
      });
      await appendStockOutbox({ tx, event: buildStockEvent({ type: finalStatus === "APPLIED" ? "StockSyncCompleted.v1" : "StockSyncFailed.v1", empresaId, syncRunId: syncRun.id, aggregateType: "StockSyncRun", aggregateId: String(syncRun.id), materialVersion: 2, correlationId: working.correlationId, payload: { mode: "IMPORT", status: finalStatus, appliedCount } }) });
      const finalizedUpdate = await tx.importacaoEstoque.updateMany({
        where: { id: importacaoId, empresaId, status: "PROCESSING", revision: working.revision },
        data: { status: finalStatus, syncRunId: syncRun.id, acceptedCount: appliedCount, rejectedCount: working.rowCount - appliedCount, revision: { increment: 1 } },
      });
      if (finalizedUpdate.count !== 1) throw stockError(409, "STOCK_IMPORT_REVISION_CONFLICT", "Importacao de estoque foi alterada.");
      await writeAudit(tx, {
        empresaId,
        actorUsuarioId,
        action: "STOCK_IMPORT_CONFIRMED",
        correlationId,
        after: { importacaoId, syncRunId: syncRun.id, status: finalStatus, appliedCount },
      });
      return tx.importacaoEstoque.findFirst({ where: { id: importacaoId, empresaId }, include: importInclude() });
    }, { maxWait: 5000, timeout: 30000 });
    return presentImport(finalized);
  }

  async function assertEnabled(context) {
    const enabled = await featureGate(context);
    if (enabled !== true) throw stockError(404, "STOCK_DISABLED", "Recurso de estoque indisponivel.");
  }

  async function loadCsvSource({ empresaId, fonteId }) {
    const source = await prisma.fonteEstoque.findFirst({
      where: { id: fonteId, empresaId, tipoFonte: "FILE_IMPORT_CSV", statusCiclo: "ACTIVE" },
    });
    if (!source) throw stockError(404, "STOCK_SOURCE_NOT_AVAILABLE", "Fonte CSV de estoque nao encontrada.");
    if (source.schemaVersion !== STOCK_CSV_SCHEMA_VERSION) {
      throw stockError(422, "STOCK_SOURCE_SCHEMA_UNSUPPORTED", "Schema da fonte CSV nao suportado.");
    }
    return source;
  }

  async function assertQuota({ empresaId, actorUsuarioId, db = prisma }) {
    const [tenantActive, actorActive] = await Promise.all([
      db.importacaoEstoque.count({ where: { empresaId, status: { in: [...QUOTA_IMPORT_STATUSES] } } }),
      db.importacaoEstoque.count({ where: { empresaId, actorUsuarioId, status: { in: [...QUOTA_IMPORT_STATUSES] } } }),
    ]);
    if (tenantActive >= MAX_ACTIVE_BATCHES_PER_TENANT || actorActive >= MAX_ACTIVE_BATCHES_PER_ACTOR) {
      throw stockError(429, "STOCK_IMPORT_QUOTA_EXCEEDED", "Limite de importacoes de estoque atingido.");
    }
  }

  async function requireImport({ empresaId, importacaoId, includeLines = true }) {
    const query = { where: { id: importacaoId, empresaId } };
    if (includeLines) query.include = importInclude();
    const importacao = await prisma.importacaoEstoque.findFirst(query);
    if (!importacao) throw stockError(404, "STOCK_IMPORT_NOT_FOUND", "Importacao de estoque nao encontrada.");
    return importacao;
  }

  async function expireIfEditable({ empresaId, importacaoId, now }) {
    await prisma.importacaoEstoque.updateMany({
      where: { id: importacaoId, empresaId, status: { in: [...EDITABLE_IMPORT_STATUSES] }, expiresAt: { lte: now } },
      data: { status: "EXPIRED", revision: { increment: 1 } },
    });
  }

  return { preview, status, cancel, confirm };
}

function importInclude() {
  return {
    linhas: {
      select: { id: true, rowNumber: true, rowChecksum: true, sourceRecordId: true, sourceVersion: true, status: true, normalizedJsonSanitized: true, warningsJson: true, errorsJson: true, appliedAt: true, revision: true },
      orderBy: { rowNumber: "asc" },
    },
  };
}

function presentImport(importacao) {
  if (!importacao) return null;
  return {
    id: importacao.id,
    empresaId: importacao.empresaId,
    fonteId: importacao.fonteId,
    status: importacao.status,
    schemaVersion: importacao.schemaVersion,
    fileHash: importacao.fileHash,
    safeFilename: importacao.safeFilename,
    byteSize: importacao.byteSize,
    rowCount: importacao.rowCount,
    acceptedCount: importacao.acceptedCount,
    rejectedCount: importacao.rejectedCount,
    revision: importacao.revision,
    expiresAt: importacao.expiresAt,
    retentionUntil: importacao.retentionUntil,
    syncRunId: importacao.syncRunId || null,
    confirmedAt: importacao.confirmedAt || null,
    cancelledAt: importacao.cancelledAt || null,
    lines: (importacao.linhas || []).map((line) => ({
      id: line.id,
      rowNumber: line.rowNumber,
      rowChecksum: line.rowChecksum,
      sourceRecordId: line.sourceRecordId,
      sourceVersion: line.sourceVersion,
      status: line.status,
      warnings: safeJson(line.warningsJson),
      errors: safeJson(line.errorsJson),
      appliedAt: line.appliedAt || null,
      revision: line.revision,
    })),
  };
}

function presentSource(source) {
  return { id: source.id, schemaVersion: source.schemaVersion, tipoFonte: source.tipoFonte, statusCiclo: source.statusCiclo };
}

function writeAudit(tx, { empresaId, actorUsuarioId, action, correlationId, after }) {
  return tx.eventoAuditoriaEstoque.create({
    data: {
      empresaId,
      actorType: "USER",
      actorUsuarioId,
      actorSystemKey: null,
      action,
      afterJsonSanitized: JSON.stringify(after),
      correlationId: sanitizeCorrelationId(correlationId),
    },
  });
}

async function lockTenantQuota(tx, empresaId) {
  if (typeof tx?.$executeRawUnsafe !== "function") return;
  const id = Number(empresaId);
  if (!Number.isSafeInteger(id) || id <= 0) throw stockError(422, "STOCK_CONTEXT_INVALID", "empresaId invalido.");
  await tx.$executeRawUnsafe(`UPDATE "Empresa" SET "updatedAt" = "updatedAt" WHERE "id" = ${id}`);
}

function normalizeAppliedIds(value, acceptedLines) {
  if (value === undefined) return acceptedLines.map((line) => line.id);
  if (!Array.isArray(value) || value.some((id) => !Number.isInteger(id))) {
    throw stockError(500, "STOCK_APPLIER_RESULT_INVALID", "Resultado do aplicador de estoque invalido.");
  }
  const accepted = new Set(acceptedLines.map((line) => line.id));
  const unique = [...new Set(value)];
  if (unique.some((id) => !accepted.has(id))) throw stockError(500, "STOCK_APPLIER_RESULT_INVALID", "Resultado do aplicador de estoque invalido.");
  return unique;
}

function assertConfirmationBounds(importacao) {
  const rowCount = Number(importacao?.rowCount);
  const acceptedCount = Number(importacao?.acceptedCount);
  const rejectedCount = Number(importacao?.rejectedCount);
  if (!Number.isSafeInteger(rowCount) || !Number.isSafeInteger(acceptedCount) || !Number.isSafeInteger(rejectedCount)
    || rowCount < 1 || rowCount > MAX_CONFIRM_LINES || acceptedCount < 0 || rejectedCount < 0
    || acceptedCount + rejectedCount !== rowCount) {
    throw stockError(409, "STOCK_IMPORT_BOUNDS_EXCEEDED", "Importacao de estoque excede o limite de confirmacao.");
  }
}

function sanitizeFilename(value) {
  const name = String(value || "arquivo.csv").replace(/[\\/\u0000-\u001F]/g, "_").trim().slice(0, 160);
  return name || "arquivo.csv";
}

function sanitizeCorrelationId(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(text) ? text : null;
}

function assertContext({ empresaId, fonteId, actorUsuarioId }) {
  assertActorContext({ empresaId, actorUsuarioId });
  assertPositiveInt(fonteId, "fonteId");
}

function assertActorContext({ empresaId, actorUsuarioId }) {
  assertTenantId(empresaId);
  assertPositiveInt(actorUsuarioId, "actorUsuarioId");
}

function assertTenantId(value) {
  assertPositiveInt(value, "empresaId");
}

function assertPositiveInt(value, field) {
  if (!Number.isInteger(value) || value < 1) throw stockError(422, "STOCK_CONTEXT_INVALID", `${field} invalido.`);
}

function assertRevision(value) {
  if (!Number.isInteger(value) || value < 1) throw stockError(422, "STOCK_IMPORT_REVISION_REQUIRED", "Revision da importacao obrigatoria.");
}

function assertIdempotencyKey(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(String(value || ""))) {
    throw stockError(422, "STOCK_IMPORT_IDEMPOTENCY_INVALID", "Chave de idempotencia invalida.");
  }
}

function isExpired(importacao, now) {
  return importacao.expiresAt && new Date(importacao.expiresAt).getTime() <= now.getTime();
}

function clockDate(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Clock de importacao invalido.");
  return date;
}

function safeJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = {
  ACTIVE_IMPORT_STATUSES,
  MAX_ACTIVE_BATCHES_PER_ACTOR,
  MAX_ACTIVE_BATCHES_PER_TENANT,
  MAX_CONFIRM_LINES,
  QUOTA_IMPORT_STATUSES,
  createStockImportService,
  presentImport,
};
