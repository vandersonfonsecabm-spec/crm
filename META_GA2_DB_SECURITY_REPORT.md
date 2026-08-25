# GA2 database and security report

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=a45eba71aede67546cf1459b0955e80e6586bff9
FINAL_SOURCE_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
FINAL_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6 (no schema delta)
DOCUMENT_STATUS=POST_GA2_MAINTENANCE_PASS_WITH_OFFICIAL_PG_CLUSTER_LIMITATION

## Maintenance 2 overlay

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
FINAL_SOURCE_SHA=271d7c5
FINAL_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
DOCUMENT_STATUS=MAINTENANCE_2_SECURITY_AND_DB_SOURCE_PASS_WITH_EXTERNAL_PG_GATE

The query telemetry layer never logs SQL, parameters, credentials, raw error
messages or tenant identifiers. `pg_stat_statements` support is read-only and
rejects official URLs. Meta retry state uses existing tenant/canal/provider
CAS fields only; no schema or migration was added. The historical 202.98s
checkpoint remains a monitored non-actionable outlier with no recurrence in the
observed window. A real disposable PostgreSQL rehearsal is still required to
turn the external gate into PASS.

No GA2 migration or schema change occurred. Existing PostgreSQL E6A migration
history, tenant/FK gate, backup and restore evidence remain valid because no
related schema files changed. Official Postgres-u_yI remained healthy.

Security review found no auth bypass, cross-tenant read/write, recipient leak,
generic dangerous tool, provider network call or outbound path. The raw catalog
detail response was corrected to use the customer-safe serializer. Hidden
availability responses no longer expose the internal stock product ID.

The official generic Prisma runner remains
`BLOCKED_GENERIC_ENGINE_ERROR_BEFORE_MIGRATION_EXECUTION` for the disposable
PostgreSQL command path. This does not block the verified SQLite rehearsal:
the canonical isolated runner completed its full non-PostgreSQL node-suite
with exit 0, preserving the protected databases. PostgreSQL-only tests remain
separately scoped and were not coerced into SQLite. The SQLite result used the
approved temporary fixture copy under `%TEMP%`; the protected repository
`dev.db` remained immutable.
The confirmation log SHA is
`40a81acee6c0a7828287d984fb265a47932cde82f42d182d4baeeae08ccb30dc`.
It was not relabeled PASS. The two moderate ExcelJS/uuid advisories were
reviewed against the actual admin-only bounded import path and accepted as
non-actionable for this release; no blind `audit fix --force` was run.

Historical failed PostgreSQL password attempts were correlated to removed old
Railway API deployments and private service traffic; no public ingress was
observed in the current window. Current API/worker connections succeed.

Maintenance fixed the shared-client runner race and proved the isolated
PostgreSQL harness 22/22. A real PostgreSQL cluster was still unavailable
locally, so no production or disposable PostgreSQL migration was attempted.
The dependency graph now fixes uuid 11.1.1 under ExcelJS 4.4.0 and the
production audit reports zero vulnerabilities. The historical 202.98s
checkpoint remains a monitored infrastructure outlier; current health/ready
and worker cycles are normal.
