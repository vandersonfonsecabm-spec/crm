# E2R PostgreSQL validation

POSTGRES_REHEARSAL_MODE=NEON_DISPOSABLE_BRANCH
PRODUCTION_DB_UNTOUCHED=PASS

## Empty rehearsal

Branch disposable `stock-mvp-e2r-e5-rehearsal-20260823` was created and deleted after validation. All 12 baseline/E2 migrations plus E2 were applied in order through Neon SQL transactions/statement fallback. Verified: 67 tables, 15 E2 tables, 180 baseline+E2 foreign keys, 22 E2 indexes, composite tenant FK rejection, partial unique constraints, outbox dedupe and active import dedupe.

## Representative rehearsal

Branch `stock-mvp-e2r-e5-representative-20260823` (`br-fancy-wave-aciedcxy`) received synthetic tenants, H8 notification and RateLimitBucket before E2. E2 was then applied. Post-check preserved 2 tenants, 1 H8 row and 1 rate-limit row; E2 tables were present. E3 migration later added 3 rule tables and 7 stock notification columns while preserving those rows.

The Neon branch is disposable and is not an official CRM/Railway database. Prisma migration-history-table parity was not claimed because the available MCP surface executed migration SQL directly; this remains a release gate before any official migration.

E2R_POSTGRES_SOURCE_GATE=PASS_ISOLATED
E2R_OFFICIAL_DB_GATE=BLOCKED
