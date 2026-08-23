"use strict";

const { ruleEvaluationContract, RULE_CONTRACT_VERSION } = require("./contracts");

const RULE_TYPES = Object.freeze(["STOCK_LOT_EXPIRING", "STOCK_LOT_EXPIRED", "STOCK_DATA_STALE", "STOCK_SYNC_FAILED"]);

function evaluateStockRuleContract(input = {}) {
  const required = Array.isArray(input.requiredCapabilities) ? input.requiredCapabilities : [];
  const provided = input.capabilities?.capabilities || input.capabilities || {};
  const missing = required.filter((name) => !provided[name]);
  if (missing.length) return ruleEvaluationContract({ schemaVersion: RULE_CONTRACT_VERSION, decision: "BLOCKED_CAPABILITY", ruleType: input.ruleType, requiredCapabilities: required, reason: "CAPABILITY_MISSING", candidateResolution: { missing } });
  const freshness = String(input.freshness || input.state?.freshnessEstado || "UNKNOWN");
  if (input.freshnessRequirement === "FRESH" && !["FRESH", "AGING"].includes(freshness)) return ruleEvaluationContract({ schemaVersion: RULE_CONTRACT_VERSION, decision: "BLOCKED_FRESHNESS", ruleType: input.ruleType, requiredCapabilities: required, reason: "FRESHNESS_UNAVAILABLE", candidateResolution: { freshness } });
  if (!RULE_TYPES.includes(String(input.ruleType || ""))) return ruleEvaluationContract({ schemaVersion: RULE_CONTRACT_VERSION, decision: "INVALID_STATE", reason: "RULE_NOT_ACTIVE_IN_E2" });
  return ruleEvaluationContract({ schemaVersion: RULE_CONTRACT_VERSION, decision: "NO_MATCH", ruleType: input.ruleType, requiredCapabilities: required, reason: "RULE_ENGINE_RUNTIME_INACTIVE", materialVersion: input.materialVersion, confidence: input.confidence });
}

module.exports = { RULE_TYPES, evaluateStockRuleContract, RULE_CONTRACT_VERSION };
