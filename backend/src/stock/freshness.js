"use strict";

function classifyFreshness({ observedAt, lastSuccessfulSyncAt, slaMs, partial = false, syncFailed = false, now = new Date() } = {}) {
  if (syncFailed) return "SYNC_FAILED";
  if (partial) return "PARTIAL";
  if (!Number.isFinite(slaMs) || slaMs <= 0) return "UNKNOWN";
  const reference = lastSuccessfulSyncAt || observedAt;
  if (!reference) return "UNKNOWN";
  const referenceDate = reference instanceof Date ? reference : new Date(reference);
  if (!Number.isFinite(referenceDate.getTime())) return "UNKNOWN";
  const rawAge = now.getTime() - referenceDate.getTime();
  if (rawAge < -5 * 60 * 1000) return "UNKNOWN";
  const age = Math.max(0, rawAge);
  if (age <= slaMs * 0.6) return "FRESH";
  if (age <= slaMs) return "AGING";
  return "STALE";
}

function confidenceFor({ quality = "UNKNOWN", mapping = "MATCHED", freshness = "UNKNOWN", capability = true } = {}) {
  if (!capability || mapping === "AMBIGUOUS" || mapping === "UNMATCHED") return "UNKNOWN";
  if (freshness === "STALE" || freshness === "SYNC_FAILED" || freshness === "PARTIAL") return "LOW";
  if (quality === "HIGH" && freshness === "FRESH") return "HIGH";
  if (quality === "LOW" || quality === "UNKNOWN") return "LOW";
  return "MEDIUM";
}

module.exports = { classifyFreshness, confidenceFor };
