# E2R PostgreSQL validation

POSTGRES_REHEARSAL_MODE=NEON_DISPOSABLE_BRANCH
PRODUCTION_DB_UNTOUCHED=PASS

## Empty rehearsal

Final disposable Neon branch `stock-e3r2-final-rehearsal` (`br-ancient-darkness-acoz34p3`) was created and deleted after validation. All 13 PostgreSQL migration directories in the worktree were applied in order through SQL transactions (376 baseline statements plus the later packages). Final assertions returned 70 public tables, 101 stock-related indexes, 45 stock-table foreign keys, all E2/E3 tables, and the composite `AvaliacaoRegraEstoque.empresaId+sourceConnectionId` FK. A synthetic cross-tenant evaluation insert was rejected while the same-tenant insert succeeded; cleanup completed on the disposable branch.

## Representative rehearsal

Branch `stock-mvp-e2r-e5-representative-20260823` (`br-fancy-wave-aciedcxy`) received synthetic tenants, H8 notification and RateLimitBucket before E2. E2 was then applied. Post-check preserved 2 tenants, 1 H8 row and 1 rate-limit row; E2 tables were present. E3 migration later added 3 rule tables, 7 stock notification columns and the source-scoped evaluation FK while preserving those rows.

The Neon branch was disposable and was not an official CRM/Railway database. Prisma migration-history-table parity was not claimed because the available MCP surface executed migration SQL directly. The official isolated Prisma runner was attempted once after the same source state and stopped at the project's generic Prisma engine error before migration execution; it was cleaned up. This remains a release gate before any official migration.

E2R_POSTGRES_SOURCE_GATE=PASS_SQL_LEVEL_ISOLATED
E2R_PRISMA_RUNNER_GATE=BLOCKED_ENGINE_ERROR
E2R_OFFICIAL_DB_GATE=BLOCKED
