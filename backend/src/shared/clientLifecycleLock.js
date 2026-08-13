const CANONICAL_CLIENT_STATUSES = new Set(["Lead", "Novo", "Contato", "Proposta", "Fechado", "Perdido"]);

function isPostgresRuntime() {
  const url = process.env.CRM_TEST_DATABASE_URL || process.env.DATABASE_URL || "";
  return /^postgres(?:ql)?:/i.test(url);
}

/**
 * Locks a tenant-scoped Cliente row for the duration of the caller's
 * transaction.  Every operational writer must call this helper before its
 * first child write.  The helper deliberately performs no network I/O and
 * returns a small authoritative lifecycle snapshot for revalidation.
 */
async function lockClienteRow(tx, empresaId, clienteId) {
  if (!Number.isSafeInteger(Number(empresaId)) || !Number.isSafeInteger(Number(clienteId))) return null;
  if (isPostgresRuntime()) {
    const rows = await tx.$queryRaw`
      SELECT id, "arquivadoEm", "revisao", "status", "statusAntesDeArquivar"
      FROM "Cliente"
      WHERE "empresaId" = ${Number(empresaId)} AND id = ${Number(clienteId)}
      FOR UPDATE
    `;
    return rows[0] || null;
  }
  return tx.cliente.findFirst({
    where: { empresaId: Number(empresaId), id: Number(clienteId) },
    select: { id: true, arquivadoEm: true, revisao: true, status: true, statusAntesDeArquivar: true },
  });
}

async function lockActiveClienteRow(tx, empresaId, clienteId) {
  const row = await lockClienteRow(tx, empresaId, clienteId);
  if (!row) return null;
  if (row.arquivadoEm || !CANONICAL_CLIENT_STATUSES.has(row.status)) {
    const error = new Error("Cliente indisponível para operação.");
    error.status = 409;
    error.codigo = "CLIENT_ARCHIVED_READ_ONLY";
    throw error;
  }
  return row;
}

async function lockActiveClienteRows(tx, empresaId, clienteIds) {
  const ids = [...new Set((clienteIds || []).map(Number).filter(Number.isSafeInteger))].sort((a, b) => a - b);
  const rows = [];
  for (const id of ids) rows.push(await lockActiveClienteRow(tx, empresaId, id));
  return rows;
}

module.exports = { CANONICAL_CLIENT_STATUSES, isPostgresRuntime, lockClienteRow, lockActiveClienteRow, lockActiveClienteRows };
