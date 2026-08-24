# Post-stock production baseline

CURRENT_STATE_AS_OF=2026-08-24
POST_STOCK_RUNTIME_BASE_SHA=a1232a195795912d0a900d51edfcc5f12d4b8955
POST_STOCK_RUNTIME_TAG=stock-mvp-production-ship-2026-08-24
POST_STOCK_RELEASE_DOCS_SHA=5127d5387dc1a6b8fb90cfa78b6156dcb66db4da
POST_STOCK_RECONCILIATION_SHA=812413ffd18139b08e66d01ec99e7883ec4da63f
POST_STOCK_LATEST_TEXT_DOCS_SHA=c201c0b8419003fc8a8fdf87cf71f701113f6fb7
POST_STOCK_RUNTIME_TREE_PARITY=PASS

The runtime baseline is a1232a1. The later SHAs are documentation/reconciliation
only and must not be used as a code base by E6A.

PRODUCTION
- Official PostgreSQL: 14 migrations, latest `20260824120000_fix_stock_postgres_enum_types`.
- Railway API and worker healthy; Vercel production healthy.
- Tenant 1 is the only stock tenant allowlisted; stock/H7/H8 remain the source of truth.
- FILE_IMPORT_CSV / stock-csv.v1 is the only stock source in scope.
- Bling remains TEST_ONLY; no stock outbound exists.

BASELINE_LIMITATIONS
- Railway/Vercel source parity is manual source-manifest evidence, not provider-attested Git SHA metadata.
- Prisma official migration runner remains a known generic engine blocker; it is not treated as PASS.

ROLLBACK
- Stock rollback remains logical, flag-based and additive; no down migration is allowed.
