# GA2 backend and workers report

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=a45eba71aede67546cf1459b0955e80e6586bff9
FINAL_SOURCE_SHA=eda455912c5ddecb8ae42766f56e2397dce0085c
FINAL_RUNTIME_SHA=eda455912c5ddecb8ae42766f56e2397dce0085c (API/worker automatic redeploy; backend lineage b9)
DOCUMENT_STATUS=GLOBAL_PASS

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
