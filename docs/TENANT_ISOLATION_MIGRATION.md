# Tenant Isolation Migration

## Objective

This migration makes tenant ownership part of every mapped foreign key between tenant-scoped records. A child row can reference a tenant-scoped parent only when both rows have the same tenant identifier.

The canonical relation inventory is exported by `backend/scripts/check-tenant-relation-integrity.cjs`. It currently contains 83 tenant-owned relations across commercial data, integrations, channels, automations, and functional governance.

## Data Contract

- Referenced tenant models expose a composite unique key on `(empresaId, id)`.
- `PlatformTenantAudit` uses `(tenantId, adminUserId)` against `Usuario(empresaId, id)`.
- Actor relations remain intentionally global where a platform operator can act on another tenant: `PlatformTenantAudit.actorUserId` and `AuditoriaFuncionalidade.usuarioId` keep simple user FKs.
- Tenant children reference both the tenant key and the related record ID.
- Global product and category models remain intentionally global.
- Child-only models that inherit tenancy exclusively from a constrained parent remain unchanged.
- Existing identifiers, columns, and tenant values are not rewritten.

The application still scopes every lookup by tenant. Database constraints are the final boundary, not a replacement for RBAC or tenant-aware queries.

The mandatory migration gate and its architecture, pre-migration,
post-migration, and production-readonly modes are documented in
`docs/TENANT_ISOLATION_MIGRATION_GATE.md`. Official migration runners must use
the gate; there is no warning-only or skip path.

## Delete Policy

Composite relations with a required tenant key cannot portably use `SET NULL`, because that action would also null the required tenant key. Those relations use `RESTRICT`.

This means referenced users, clients, leads, conversations, and other tenant records must be archived or deactivated through their supported application lifecycle. Direct physical deletion is rejected while history still references the record. Existing `CASCADE` behavior is retained only where the original relation already represented owned child data.

## Preflight

Run the read-only verifier before applying the migration:

```cmd
node backend\scripts\check-tenant-relation-integrity.cjs
```

Required result:

- `checkedRelations=83`;
- zero orphaned relations;
- zero crossed relations;
- zero incoherent real automation references.

Synthetic automation executions are counted separately and accepted only when they match the exact `PILOT_SYNTHETIC` contract.

The migration repeats equivalent checks internally. Any violation makes the migration fail before constraints are replaced. Do not delete, rewrite, backfill, or automatically reassign incompatible production data. Handle any nonzero result in a separate audited remediation.

## SQLite

SQLite cannot add or replace foreign keys in place. The canonical migration therefore rebuilds affected tables inside the Prisma migration transaction. Before foreign keys are disabled or any table is rebuilt, the preflight inserts every relation count into a temporary table constrained to zero.

The validated upgrade path proves:

- a valid legacy fixture retains the same data fingerprint;
- an invalid cross-tenant fixture stops before rebuild;
- a rejected migration leaves data and schema fingerprints unchanged;
- no temporary replacement table remains after rejection.

This is a physical table rebuild required by SQLite, not a logical data deletion or backfill.

## PostgreSQL

The frozen PostgreSQL baseline remains unchanged. Migration `20260801123000_enforce_tenant_safe_relations` is incremental:

1. run the read-only preflight inside the migration;
2. add composite unique constraints to referenced parents;
3. replace simple tenant relation FKs with composite FKs;
4. preserve all rows, columns, IDs, and existing channel schemas.

The validated PostgreSQL 16 path includes migrate-empty, a valid incremental upgrade with preserved rows, a crossed legacy fixture rejected with SQLSTATE `23514` before schema change, 84 catalog-verified composite FKs, and an empty Prisma drift result.

## Import Safety

The SQLite-to-PostgreSQL import is fail-closed:

- destination conflicts are not silently ignored;
- inserted counts must equal source counts;
- count validation runs before commit;
- any mismatch rolls back the full import transaction;
- secrets and connection URLs remain redacted in diagnostics.

The import should target the prepared empty PostgreSQL database produced by the official migration flow.

## Production Rollout

Use the repository's official release and PostgreSQL migration mechanisms only.

1. Confirm a clean, linear Git state and the intended migration SHA.
2. Put the API in the documented maintenance/freeze state and stop the internal automation worker from claiming new jobs.
3. Take and verify the provider-managed PostgreSQL backup.
4. Run the read-only relation verifier against the same production database.
5. Stop immediately if any real orphan, crossed relation, or incoherent automation reference is reported.
6. Deploy the approved SHA by fast-forward only.
7. Apply the PostgreSQL migration through the official pipeline with its explicit confirmation gate.
8. Run the relation verifier again, then verify database-backed health and focused read-only tenant queries.
9. Observe API and worker logs before removing maintenance/freeze and re-enabling the worker.

Do not run ad hoc production SQL to work around a failed migration.

## Rollback

- Preflight failure: no schema change is expected; keep writes frozen and investigate the reported category.
- Migration failure: rely on the official PostgreSQL transaction rollback or the SQLite migration transaction; verify schema state before retrying.
- Application regression after successful migration: roll back the application release while retaining the additive constraints, keep writes frozen, and investigate. The previous application schema fields remain present.
- Data recovery: use the verified provider backup only after an explicit incident decision. There is no automated destructive downgrade.

## Evidence Recorded

- Production read-only preflight before classification refinement: 84 candidate relations, zero orphaned, zero crossed, three allowed synthetic automation executions. The final canonical map contains 83 tenant-owned relations plus the intentionally global functional-audit actor relation.
- SQLite: valid upgrade preserved; invalid upgrade failed before rebuild; relation enforcement and service scoping tests passed.
- PostgreSQL 16.14: migrate-empty, catalog constraints, `P2003`, transaction rollback, two-client concurrency, incremental upgrades, preflight failure, and drift check passed. The final 83-relation count must be rechecked after the actor classification change.
- Protected SQLite development database SHA-256 remained unchanged during validation.

## Residual Risk

Adding many constraints increases migration lock time relative to a metadata-only deploy. The rollout therefore requires a write freeze, worker stop, backup, and objective log observation. Real provider traffic, Meta channels, and outbound behavior are outside this migration and are unchanged.
