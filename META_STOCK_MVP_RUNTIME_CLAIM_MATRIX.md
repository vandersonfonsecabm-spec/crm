# Runtime claim matrix

| Claim | Status | Evidence |
|---|---|---|
| E2_SOURCE_IDENTITY | PASS | integrated HEAD `5c286e7` ancestor/worktree |
| E2_STOCK_CORE_VALIDATED | PASS (source/isolated SQL) | final code checkpoint `efcfc5f`; 39 stock-focused backend tests; Neon disposable SQL rehearsal |
| POSTGRES_EMPTY_REHEARSAL | PASS (SQL-level isolated) | Disposable Neon branch: 13 migration packages, 70 tables, 101 stock indexes, 45 stock FKs; branch deleted |
| POSTGRES_RESTORE_REHEARSAL | PARTIAL | prior synthetic representative branch evidence; no official dump/restore |
| E2_POSTGRES_FUNCTIONAL | PASS (SQL-level) | disposable PostgreSQL schema assertions and same-tenant insert |
| E2_IDEMPOTENCY_POSTGRES | PASS (schema-level) | unique/dedupe constraints inspected; no Prisma runtime replay |
| E2_CONCURRENCY_POSTGRES | PARTIAL | lease/CAS focused tests; two-live Prisma workers not run |
| E2_TENANT_ISOLATION_POSTGRES | PASS (isolated) | cross-tenant composite FK insert rejected |
| E2_OUTBOX_POSTGRES | PASS (schema/focused) | outbox indexes, dedupe, lease and retry tests |
| BACKEND_FULL_SUITE | BLOCKED | official isolated Prisma runner stopped at generic engine error; 39 stock-focused tests pass |
| FRONTEND_FULL_SUITE | PASS | 190/190; lint/build pass |
| TENANT_GATE | PASS | architecture/pre-migration 117 relations |
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
