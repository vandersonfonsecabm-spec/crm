const {
  STOCK_CSV_SCHEMA_VERSION,
  createStockCsvAdapter,
  parseStockCsv,
} = require("../csv/stock-csv-v1");

function createFileCsvAdapter(options = {}) {
  return createStockCsvAdapter(options);
}

module.exports = {
  STOCK_CSV_SCHEMA_VERSION,
  createFileCsvAdapter,
  parseStockCsv,
};
