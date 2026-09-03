"use strict";

const CANONICAL_CLIENT_STATUSES = Object.freeze(["Novo", "Contato", "Proposta", "Fechado", "Perdido"]);

function canonicalClientStatus(value) {
  return String(value || "").trim() === "Lead" ? "Novo" : String(value || "").trim();
}

function clientStatusFilter(value) {
  const status = String(value || "").trim();
  return status === "Lead" || status === "Novo" ? { in: ["Lead", "Novo"] } : status;
}

function mergeClientStatusRows(rows = []) {
  const merged = new Map();
  for (const row of rows) {
    const status = canonicalClientStatus(row?.status);
    if (!status) continue;
    const current = merged.get(status) || { status, total: 0, informed: 0, sum: 0 };
    current.total += Number(row?._count?._all || 0);
    current.informed += Number(row?._count?.valor ?? row?._count?._all ?? 0);
    if (row?._sum?.valor !== null && row?._sum?.valor !== undefined) current.sum += Number(row._sum.valor || 0);
    merged.set(status, current);
  }
  return [...merged.values()];
}

module.exports = { CANONICAL_CLIENT_STATUSES, canonicalClientStatus, clientStatusFilter, mergeClientStatusRows };
