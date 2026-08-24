# E5R backup, restore and rehearsal

PRODUCTION_BACKUP=PASS
- Target: official Railway PostgreSQL `Postgres-u_yI`
- Created before any official write on 2026-08-23 BRT (filesystem timestamps 23:08–23:09 local)
- Custom dump: `%TEMP%\stock-e5r-official-20260824\production-pre-stock.dump`
- Size: 353310 bytes
- SHA-256: `d6fe92195748e7cc7d52d54ceb055b6f050740e8147ebce0d88f11e06e72e18a`
- Plain SQL companion: `production-pre-stock.sql`, 312790 bytes, SHA-256 `47633b3d88d0461a172b9e2997622cd46f2262d65f77c03ff20f2f8509f0fdcd`

RESTORE_DRILL=PASS
- Restored into controlled Railway test PostgreSQL database `e5r_restore_20260824`
- 11 applied migrations and 53 public tables verified
- Temporary database was removed after validation

STOCK_MIGRATION_REHEARSAL=PASS_SQL_LEVEL
- Same sanitized official dump restored into `e5r_rehearsal_20260824`
- E2 and E3 PostgreSQL migration SQL applied with `ON_ERROR_STOP`
- Result: 71 public tables and four stock tables present
- Temporary database was removed after validation
- `_prisma_migrations` was not edited; this is SQL-level rehearsal, not a Prisma history PASS

PRISMA_OFFICIAL_RUNNER=KNOWN_TOOLING_BLOCKER_WITH_EQUIVALENT_OPERATIONAL_EVIDENCE
- The isolated Prisma runner was previously reproduced and stops with a generic engine error before migration execution.
- Schema validation, tenant gate, direct SQL rehearsal and runtime-focused tests remain positive.
