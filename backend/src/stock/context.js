"use strict";

const crypto = require("node:crypto");

const { positiveId } = require("./flags");
const { StockError } = require("./errors");

function resolveStockContext(input = {}) {
  const req = input.req;
  const auth = req?.auth || input.auth || {};
  const empresaId = positiveId(auth.empresaId ?? input.empresaId);
  const usuarioId = positiveId(auth.usuarioId ?? input.actorUsuarioId);
  if (!empresaId || !usuarioId) {
    throw new StockError("STOCK_TENANT_CONTEXT_INVALID", "Contexto autenticado invalido.", undefined, 401);
  }
  const suppliedEmpresaId = req?.body?.empresaId ?? req?.query?.empresaId ?? input.suppliedEmpresaId;
  if (suppliedEmpresaId !== undefined && suppliedEmpresaId !== null && positiveId(suppliedEmpresaId) !== empresaId) {
    throw new StockError("STOCK_FORBIDDEN", "Empresa nao autorizada.", undefined, 403);
  }
  return Object.freeze({
    empresaId,
    usuarioId,
    papel: auth.papel || input.papel || null,
    correlationId: typeof input.correlationId === "string" && input.correlationId.length <= 128
      ? input.correlationId
      : cryptoCorrelationId(),
  });
}

function cryptoCorrelationId() {
  return `stock-${crypto.randomUUID()}`;
}

module.exports = { resolveStockContext };
