const { createFileCsvAdapter } = require("../adapters/fileCsv");
const { createStockImportService: createStagingService } = require("./staging-service");
const { stockEnabledForTenant } = require("../flags");

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
  return async ({ empresaId }) => stockEnabledForTenant(empresaId, env, { source: true });
}

module.exports = {
  createStockFeatureGate,
  createStockImportService,
};
