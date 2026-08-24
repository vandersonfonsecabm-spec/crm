# E3 rules and H8 report

Implemented:

- versioned pure evaluator with canonical-only inputs;
- capability and freshness fail-closed checks;
- stable occurrence keys and material-version changes;
- durable `ConfiguracaoRegraEstoque`, `OverrideEstoque`, `AvaliacaoRegraEstoque`;
- additive structured stock target/snapshot fields on existing `Notificacao`;
- `StockRuleMatched.v1`, `StockRuleResolved.v1`, `StockProjectionRequested.v1` reserved-event path;
- recipient and target tenant validation in `upsertStockProjection`;
- source-scoped evaluation FK, active-source filtering, rotating rule cursor and bounded transient outbox retries;
- persisted CSV capability observations and declared quantity relevance;
- source-scope stale evaluation when no balance exists, caller-capability forgery rejection, atomic sync-failure transition/outbox append, and bounded terminal retention cleanup;
- no second Central and no outbound channel.

Evidence: E3 unit/service/projection/worker/retention tests pass; E3 migration applied on the disposable PostgreSQL branch with composite source FK assertions. Live H8 canary and recipient resolution against official runtime remain pending.

E3_STOCK_RULES_H8_SOURCE_READY=PASS
E3_RUNTIME_CANARY=BLOCKED
