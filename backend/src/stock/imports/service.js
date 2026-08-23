const { createFileCsvAdapter } = require("../adapters/fileCsv");
const { createStockImportService: createStagingService } = require("./staging-service");

function createStockImportService({
  prisma,
  canonicalService = null,
  syncService = null,
  env = process.env,
  clock,
  adapter = createFileCsvAdapter(),
  applyAcceptedRows = null,
} = {}) {
  const applier = applyAcceptedRows || createCanonicalApplier({ canonicalService, syncService });
  return createStagingService({
    prisma,
    adapter,
    clock,
    applyAcceptedRows: applier,
    featureGate: createStockFeatureGate(env),
  });
}

function createCanonicalApplier({ canonicalService, syncService }) {
  if (!canonicalService || typeof canonicalService.applyImportRows !== "function") return null;
  return (context) => canonicalService.applyImportRows({ ...context, syncService });
}

function createStockFeatureGate(env = process.env) {
  const globalEnabled = boolean(env.STOCK_DOMAIN_ENABLED) && boolean(env.STOCK_SOURCE_ENABLED);
  const allowlist = new Set(
    String(env.STOCK_TENANT_ALLOWLIST || "")
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((id) => Number.isInteger(id) && id > 0),
  );
  return async ({ empresaId }) => globalEnabled && allowlist.has(empresaId);
}

function boolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

module.exports = {
  createStockFeatureGate,
  createStockImportService,
};
