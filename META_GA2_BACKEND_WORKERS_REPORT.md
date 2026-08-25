# GA2 backend and workers report

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=a45eba71aede67546cf1459b0955e80e6586bff9
FINAL_SOURCE_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
FINAL_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6 (API/worker maintenance)
DOCUMENT_STATUS=POST_GA2_MAINTENANCE_PASS_WITH_PG_ENV_LIMITATION

## Maintenance 2 overlay

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
FINAL_SOURCE_SHA=c81328d
FINAL_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
DOCUMENT_STATUS=MAINTENANCE_2_BACKEND_SOURCE_COMPLETE_RUNTIME_UNCHANGED

Prisma query/error observability is opt-in, sanitized and bounded; it does not
change the worker default. Meta webhook retry is now bounded/CAS/lease-aware in
all three processors/orchestrators, with provider-specific integration evidence:
WhatsApp 12/12, Instagram 8/8, Messenger 9/9 and direct processor 11/11. No
worker, outbound path, route, flag, schema or migration changed. The real
PostgreSQL cluster gate remains blocked only by unavailable Docker/URL.

Backend E6A/catalog focused suite: 25/25 PASS before the final UI-only ca
commit; latest backend-focused orchestrator suite: 21/21 PASS. Node syntax
checks passed for changed modules. The canonical isolated SQLite node-suite
then completed with exit 0 across every non-PostgreSQL test file after the
runner migration-count fix, dynamic H11 migration fixture, and capability/
webhook test-contract updates. PostgreSQL-only files remain intentionally
excluded from SQLite and retain the separate official runner limitation.

The confirmation run was saved as
`%TEMP%\\crm-ga2-final-suite-20260824\\backend\\full-suite-ga2.log` with SHA-256
`40a81acee6c0a7828287d984fb265a47932cde82f42d182d4baeeae08ccb30dc`;
H11 scenario 2 passed and every reported file ended with `fail 0`.

The suite used the approved temporary sandbox fixture: read-only copies of
the protected test databases were placed under
`%TEMP%\\crm-ga2-final-suite-20260824` and removed by the runner. The repository
`dev.db` and official PostgreSQL were not writable test targets.

The main causal fix claims a draft before any side-effect tool, uses persisted
CAS where Prisma is present, blocks sequential in-memory replays, and exposes a
granular audited reject route. Catalog list/search filters now honor manager
visibility and availability semantics. API/worker final eda deployments were
SUCCESS; no second worker was active.

Worker logs showed normal H7/H8/stock cycles after one historical timeout. No
storm, duplicate notification, cross-tenant processing or unexpected outbound
was observed.

The test-harness fixes were causal rather than product expansion: the runner
now expects the current 39-migration tree and emits bounded per-file starts /
timeouts; H11 follows the latest migration instead of a historical name; and
legacy capability/webhook assertions accept the current E6A contract. The
protected dev.db and official Postgres were not modified.

Maintenance delta `0c058e5` added isolated PostgreSQL test-client workspaces,
bounded stock retry/lease handling for P2028/P2034, stock cycle telemetry and
automation lease-exhaustion events. Focused tests passed: PG harness 22/22,
stock sync 14/14, stock worker 9/9, automation observability 14/14. The global
SQLite suite passed with log SHA
`b16cec52c1602d71d6fd666215aa905571d5e49741f63b0fe98d42c037335fed`.
