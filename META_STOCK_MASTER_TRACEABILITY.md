# Master traceability — integrated stock mission

BASELINE_SHA=`a5a280c3ebc54741ced02a77d4da5ec51834d583`
E1_DOCS_COMMIT=`3c6cbab39cb3c75023a856e9ede7d91df0be955e`
E2_SOURCE_COMMIT=`5c286e74004ada98274cc5b9496dfb5129e0ccc3`
INTEGRATION_BRANCH=`feature/stock-mvp-e2r-e5`
E2R_VALIDATED_COMMIT=`2ed75b2fb0a59433cf1053a8d966b5fd78640545`
RUNTIME_SHA=`NOT_DEPLOYED`
DOCUMENT_STATUS=`SOURCE_CHECKPOINT_WITH_OPERATIONAL_GATES_BLOCKED`

| Requisito | Source document/section | Implementação | Teste/gate | Status |
|---|---|---|---|---|
| Modelo canônico tenant-safe | E1 canonical data model | `backend/prisma/schema.prisma`, E2/E3 migrations | stock schema test, tenant gate (117 relações) | PASS |
| FILE_IMPORT_CSV | E1 adapter/sync contract | `backend/src/stock/csv`, `adapters/fileCsv.js` | `stock-csv-staging.test.js` | PASS |
| Preview/confirm/cancel | E1 API/UI security | `stock/imports/staging-service.js`, routes | CSV staging + MIME tests | PASS |
| Sync/checkpoint/lease | E1 reliability ADRs | `stock/sync.js`, `stock/outbox.js` | `stock-sync-e2r-safety`, worker tests | PASS |
| Versioned events/outbox | E1 event contract | `stock/events.js`, `stock/outbox.js` | contract/worker/rule-service tests | PASS |
| Four MVP rules | E3 product decisions | `stock/rules.js`, `rule-service.js` | `stock-rules-e3`, `stock-rule-service-e3` | PASS (source) |
| H8 existing-center adapter | E1 H8 contract | `notifications/service.js`, `stock/projection.js`, additive H8 migration | projection test; no canary | PASS (source), runtime pending |
| Stock UI states | E4 UI contract | `StockControlPanel.tsx`, navigation, `crmApi.ts` | frontend 190 tests, lint, build | PASS (source) |
| PostgreSQL empty/representative rehearsal | E5 DB plan | disposable Neon branches, raw migration SQL | schema/FK/idempotency queries | PASS (isolated rehearsal; no official history table) |
| Official production migration/deploy | E5 release protocol | not executed | production confirmation/backup absent | BLOCKED |

No production database, Railway, Vercel, push or external notification was changed.
