"use strict";

const STATUS_BY_CODE = Object.freeze({
  STOCK_DISABLED: 404,
  STOCK_SOURCE_DISABLED: 409,
  STOCK_NOT_FOUND: 404,
  STOCK_FORBIDDEN: 403,
  STOCK_INVALID: 422,
  STOCK_CONFLICT: 409,
  STOCK_FILE_TOO_LARGE: 413,
  STOCK_QUOTA_EXCEEDED: 429,
  STOCK_SOURCE_DEGRADED: 503,
  STOCK_UNAVAILABLE: 503,
  STOCK_SCHEMA_UNSUPPORTED: 422,
  STOCK_CAPABILITY_MISSING: 422,
  STOCK_TENANT_CONTEXT_INVALID: 401,
});

class StockError extends Error {
  constructor(code, message, details = undefined, status = STATUS_BY_CODE[code] || 400) {
    super(message);
    this.name = "StockError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function stockErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : STATUS_BY_CODE[error?.code] || 500;
  const code = typeof error?.code === "string" ? error.code : "STOCK_INTERNAL_ERROR";
  const body = { error: { code, message: status >= 500 ? "Operacao de estoque indisponivel." : String(error?.message || "Requisicao invalida.") } };
  if (error?.details && status < 500) body.error.details = error.details;
  return { status, body };
}

function sendStockError(res, error) {
  const response = stockErrorResponse(error);
  return res.status(response.status).json(response.body);
}

module.exports = { STATUS_BY_CODE, StockError, stockErrorResponse, sendStockError };
