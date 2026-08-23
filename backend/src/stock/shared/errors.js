class StockDomainError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "StockDomainError";
    this.status = status;
    this.code = code;
  }
}

function stockError(status, code, message) {
  return new StockDomainError(status, code, message);
}

module.exports = { StockDomainError, stockError };
