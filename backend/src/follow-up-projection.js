const ACTIVE_FOLLOW_UP_STATUSES = Object.freeze(["PENDENTE", "EM_ANDAMENTO"]);
const NO_FOLLOW_UP_PROJECTION = "Sem acompanhamento";
const PROJECTION_RESULTS = Object.freeze({
  UPDATED: "UPDATED",
  NO_CHANGE: "NO_CHANGE",
  CLIENT_NOT_FOUND: "CLIENT_NOT_FOUND",
  REVISION_CONFLICT: "REVISION_CONFLICT",
});
const PROJECTION_CONFLICT_CODE = "NEXT_FOLLOW_UP_REVISION_CONFLICT";
const HTTP_PROJECTION_RETRY_LIMIT = 3;
const { lockActiveClienteRow } = require("./shared/clientLifecycleLock");

async function reconcileNextFollowUpProjection({ tx, empresaId, clienteId }) {
  await lockActiveClienteRow(tx, empresaId, clienteId);
  const client = await tx.cliente.findFirst({
    where: { id: clienteId, empresaId, arquivadoEm: null },
    select: { id: true, proximoFollowUp: true, revisao: true },
  });
  if (!client) return result(PROJECTION_RESULTS.CLIENT_NOT_FOUND, clienteId);

  const next = await tx.acompanhamento.findFirst({
    where: {
      empresaId,
      clienteId,
      status: { in: ACTIVE_FOLLOW_UP_STATUSES },
    },
    orderBy: [{ dataHora: "asc" }, { id: "asc" }],
    select: { dataHora: true },
  });
  const value = next ? next.dataHora.toISOString() : NO_FOLLOW_UP_PROJECTION;
  if (client.proximoFollowUp === value) {
    return result(PROJECTION_RESULTS.NO_CHANGE, clienteId, value);
  }

  const updated = await tx.cliente.updateMany({
    where: { id: clienteId, empresaId, arquivadoEm: null, revisao: client.revisao },
    data: { proximoFollowUp: value, revisao: { increment: 1 } },
  });
  if (updated.count !== 1) {
    return result(PROJECTION_RESULTS.REVISION_CONFLICT, clienteId);
  }
  return result(PROJECTION_RESULTS.UPDATED, clienteId, value);
}

async function reconcileClientProjections({ tx, empresaId, clienteIds }) {
  const results = [];
  const orderedIds = [...new Set(clienteIds.filter(Number.isSafeInteger))].sort((left, right) => left - right);
  for (const clienteId of orderedIds) {
    const projection = await reconcileNextFollowUpProjection({ tx, empresaId, clienteId });
    assertProjectionReconciled(projection);
    results.push(projection);
  }
  return results;
}

async function withProjectionRetry(prisma, operation, maxAttempts = HTTP_PROJECTION_RETRY_LIMIT) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction((tx) => operation(tx));
    } catch (error) {
      if (error?.codigo !== PROJECTION_CONFLICT_CODE || attempt === maxAttempts) throw error;
    }
  }
  throw projectionConflictError();
}

function assertProjectionReconciled(projection) {
  if (projection.status === PROJECTION_RESULTS.REVISION_CONFLICT) throw projectionConflictError();
  if (projection.status === PROJECTION_RESULTS.CLIENT_NOT_FOUND) {
    const error = new Error("Cliente da projecao nao encontrado.");
    error.status = 404;
    error.codigo = "CLIENT_NOT_FOUND";
    error.permanent = true;
    throw error;
  }
  return projection;
}

function projectionConflictError() {
  const error = new Error("A projecao foi alterada concorrentemente. Tente novamente.");
  error.status = 409;
  error.codigo = PROJECTION_CONFLICT_CODE;
  error.retryable = true;
  return error;
}

function result(status, clienteId, value) {
  return {
    status,
    clienteId,
    ...(value === undefined ? {} : { value }),
  };
}

module.exports = {
  ACTIVE_FOLLOW_UP_STATUSES,
  HTTP_PROJECTION_RETRY_LIMIT,
  NO_FOLLOW_UP_PROJECTION,
  PROJECTION_CONFLICT_CODE,
  PROJECTION_RESULTS,
  assertProjectionReconciled,
  reconcileClientProjections,
  reconcileNextFollowUpProjection,
  withProjectionRetry,
};
