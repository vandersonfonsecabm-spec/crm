"use strict";

const { stockEnabledForTenant, stockFlags, parseBoolean, assertStockFlagsOffForProduction } = require("./flags");
const { processStockOutboxBatch } = require("./outbox");
const { runStockRetention } = require("./retention");

async function runStockWorkerCycle({ prisma, env = process.env, owner = null, leaseOwner = null, leaseMs = 30000, logger = console, now = new Date(), limit = 20 } = {}) {
  const flags = stockFlags(env);
  assertStockFlagsOffForProduction(env);
  if (!flags.domainEnabled || !flags.syncWorkerEnabled || !flags.h8ProjectionEnabled || flags.tenantAllowlist.size === 0) return { enabled: false, claimed: 0, processed: 0, quarantined: 0 };
  const results = { enabled: true, claimed: 0, processed: 0, quarantined: 0, tenants: 0 };
  for (const empresaId of flags.tenantAllowlist) {
    if (!stockEnabledForTenant(empresaId, env, { worker: true })) continue;
    results.tenants += 1;
    const effectiveOwner = String(owner || leaseOwner || `stock-worker-${process.pid}`);
    const result = await processStockOutboxBatch({ prisma, empresaId, owner: `${effectiveOwner}-${empresaId}`, limit, leaseMs, now, logger, h8ProjectionEnabled: flags.h8ProjectionEnabled });
    results.claimed += result.claimed; results.processed += result.processed; results.quarantined += result.quarantined;
    if (parseBoolean(env.STOCK_RETENTION_ENABLED) && parseBoolean(env.STOCK_RETENTION_WORKER_ENABLED)) await runStockRetention({ prisma, empresaId, now, dryRun: false, env, logger });
  }
  return results;
}

module.exports = { runStockWorkerCycle };
