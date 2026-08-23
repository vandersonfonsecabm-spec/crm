"use strict";

const { createCanonicalStockService } = require("./canonical");
const { createStockSyncService } = require("./sync");
const { runStockWorkerCycle } = require("./worker");
const contracts = require("./contracts");

function createStockServices({ prisma, env = process.env, adapterRegistry = new Map(), logger = console } = {}) {
  const canonical = createCanonicalStockService({ prisma, env });
  const sync = createStockSyncService({ prisma, canonicalService: canonical, adapterRegistry, env, logger });
  return { canonical, sync, worker: (options = {}) => runStockWorkerCycle({ prisma, env, logger, ...options, owner: options.owner || options.leaseOwner }), contracts };
}

module.exports = { createStockServices, ...contracts };
