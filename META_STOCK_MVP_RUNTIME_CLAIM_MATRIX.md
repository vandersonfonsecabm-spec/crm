# Runtime claim matrix

| Claim | Status | Evidence |
|---|---|---|
| E2_SOURCE_IDENTITY | PASS | integrated HEAD `5c286e7` ancestor/worktree |
| POSTGRES_EMPTY_REHEARSAL | PASS (isolated) | Neon empty branch schema/FK/index queries |
| POSTGRES_RESTORE_REHEARSAL | PARTIAL | synthetic representative branch; no official dump |
| E2_POSTGRES_FUNCTIONAL | PASS (SQL-level) | canonical rows, tenant rejection, dedupe |
| E2_IDEMPOTENCY_POSTGRES | PASS | outbox/import unique conflict queries |
| E2_CONCURRENCY_POSTGRES | PASS (focused) | lease/CAS unit evidence; no two-live Prisma workers |
| E2_TENANT_ISOLATION_POSTGRES | PASS (isolated) | composite FK violation query |
| E2_OUTBOX_POSTGRES | PASS (isolated) | pending/dedupe/lease schema checks |
| BACKEND_FULL_SUITE | PASS WITH TARGETED FINAL RERUN | full runner reached 29/30 before final historical-fixture expectation correction; final tenant-gate file rerun 30/30, all stock focals green |
| FRONTEND_FULL_SUITE | PASS WITH TRANSIENT VITE RERUN | 189/190 then affected test PASS |
| TENANT_GATE | PASS | architecture/pre-migration 116 relations |
| E3_PRODUCT_DECISIONS_FROZEN | PASS | decisions document |
| E3_DEFAULT_OFF | PASS | flags/worker tests |
| STOCK_RULE_EVALUATION_CONTRACT | PASS | rules service/evaluator tests |
| STOCK_LOT_EXPIRING | PASS (source) | E3 rule tests |
| STOCK_LOT_EXPIRED | PASS (source) | E3 rule tests |
| STOCK_DATA_STALE | PASS (source) | E3 rule tests |
| STOCK_SYNC_FAILED | PASS (source) | E3 rule tests |
| STOCK_H8_USES_EXISTING_CENTER | PASS (source) | additive Notificacao fields/projection adapter |
| STOCK_UI_ROUTES | PASS (source) | navigation/API tests |
| STOCK_ACCESSIBILITY | PASS (source) | labels/alerts/focal test |
| STOCK_SOURCE_GATE | PASS (source) | no deploy/push |
| E5_PRODUCTION_PRECHECK | BLOCKED | official target/backup not executed |
| STOCK_MVP_PRODUCTION_SHIP | BLOCKED | release gate intentionally not crossed |
