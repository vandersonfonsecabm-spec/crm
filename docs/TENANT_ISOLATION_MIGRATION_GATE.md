# Tenant Isolation Migration Gate

## Purpose

Every migration that creates or changes a tenant-scoped relation must pass the
same fail-closed verifier used by the production read-only integrity check.
The gate protects the relation contract before and after DDL; it does not
replace application RBAC, tenant-scoped queries, backups, or release review.

The current contract contains 87 tenant-scoped relations. The following
relations are explicit exceptions and must remain documented:

- `AuditoriaFuncionalidade.usuarioId -> Usuario`: global actor history;
- `PlatformTenantAudit.actorUserId -> Usuario`: platform actor history.

An exception is not a silent exclusion. It must have a scope and a reason in
`backend/scripts/tenant-isolation-gate.cjs`.

## Canonical Commands

Run commands from the repository root with Windows CMD.

Architecture-only validation:

```cmd
node backend\scripts\tenant-isolation-gate.cjs architecture --schema backend\prisma\schema.prisma --migration-dir backend\prisma\migrations --migration-name 20260801123000_enforce_tenant_safe_relations
```

The official manual migration entrypoint is:

```cmd
cd backend
npm run db:migrate:manual
```

It detects the provider, validates the architecture, runs the read-only
`pre-migration` gate, applies the official Prisma migration, and runs the
`post-migration` gate. It does not provide a skip flag.

The retained Nest entrypoint is legacy and intentionally fail-closed:

```cmd
npm run legacy:nest:prisma:migrate
```

It exits nonzero with `LEGACY_NEST_MIGRATION_DISABLED_USE_BACKEND_GATE` and
cannot apply a migration outside the backend runner. This prevents the legacy
schema from becoming an accidental tenant-safety bypass.

The package command below is the reusable entrypoint for scripts and release
checks:

```cmd
cd backend
npm run db:tenant-gate -- architecture
npm run db:tenant-gate -- pre-migration
npm run db:tenant-gate -- post-migration
npm run db:tenant-gate -- production-readonly
```

`check-tenant-relation-integrity.cjs` remains the production read-only
compatibility command and delegates to the same central gate.

## Gate Modes

### `architecture`

Uses the generated Prisma DMMF and the canonical relation inventory. It checks
tenant model relations, composite tenant keys, relation actions, documented
exceptions, the migration registry, and relation-affecting SQL. It also emits
and validates a deterministic SHA-256 over manifest version 1, the ordered 87
relation entries, and the sorted documented exceptions. The current manifest
hash is `1d0a06953fcc75873ab7b6f07b3949e8f7bf17d48386557e3c1c48cb679928f9`.
It fails when the schema, inventory, registry, or migration hashes disagree.

### `pre-migration`

Runs the architecture checks and reads the target database before DDL. It
detects orphaned rows, cross-tenant links, incoherent polymorphic references,
invalid structured `PILOT_SYNTHETIC` metadata, and unsupported
database/provider state. `PILOT_SYNTHETIC` is recognized only when its JSON
object contains the required source identifiers, `synthetic: true`, and the
validated payload shape. An empty database is accepted for an empty migration
flow. During an incremental upgrade, missing tables are accepted only when the
registered and hash-validated migration creates them; all existing relations
remain read-only checked before DDL. Any other incomplete non-empty schema
fails closed.

### `post-migration`

Runs the architecture checks, data checks, and catalog/PRAGMA checks. It
confirms that the expected composite foreign keys, parent unique constraints,
and referential actions are present in SQLite or PostgreSQL.

### `production-readonly`

Runs against PostgreSQL in a `REPEATABLE READ READ ONLY` transaction with a
bounded statement timeout. The transaction is always rolled back. It never
creates, updates, deletes, migrates, or repairs data.

## Migration Registration

Relation-affecting migrations must be registered with their exact SQLite and
PostgreSQL SHA-256 hashes and expected relation count. A future migration that
adds or changes a tenant relation fails with `TENANT_GATE_MIGRATION_UNREGISTERED`
until its contract is reviewed and registered.

The detector is structured: it combines Prisma DMMF inspection with tokenized
SQL statement inspection for foreign keys, references, relation constraints,
and relevant unique changes. A text search alone is not the source of truth.

## Official Flow

The gate is integrated into the official paths:

- PostgreSQL validation/generation and `migrate-empty`;
- isolated SQLite migration and upgrade tests;
- startup migration when `prisma migrate status` reports pending work;
- the manual migration wrapper;
- the production read-only verifier;
- architecture composition checks.

Normal startup with no pending migration does not run the expensive database
checks. A pending migration runs `pre-migration`, Prisma deploy, then
`post-migration`; a failed gate or migration prevents the API from starting.

There is no `SKIP_TENANT_CHECK` or warning-only fallback. Nonzero exit codes
are preserved. Unexpected command output, database errors, timeouts, provider
mismatch, missing registry entries, and cleanup failures are failures.

## Adding a Tenant-Scoped Relation

1. Add the relation and composite parent key in Prisma without changing the
   meaning of existing tenant fields.
2. Decide whether the child must use `RESTRICT` or an already justified
   cascade action. Do not use `SET NULL` when the tenant key is required.
3. Add the relation to the canonical inventory and add no exception unless a
   global or platform-scoped contract is explicit and documented.
4. Generate the official SQLite and PostgreSQL migrations.
5. Register exact migration hashes for both providers.
6. Run architecture, preflight, postflight, SQLite, PostgreSQL, and upgrade
   fixture checks before release review.
7. Publish only through a fast-forward release after the gate is green.

## Failure Handling

The gate fails before migration for missing coverage, orphaned data,
cross-tenant links, invalid pilot JSON, schema drift, unknown relation actions,
registry mismatch, provider mismatch, database errors, or timeout. Prisma
subprocesses are captured before logging; only a sanitized category, Prisma
code when available, stable context, and fixed message are emitted. The gate
does not print SQL, stack traces, local paths, connection URLs, secrets, full
IDs, payloads, or PII.

Do not repair production data, delete rows, rewrite tenant IDs, or bypass the
gate. Freeze the affected migration flow, preserve the evidence, and resolve
the contract or data issue through the normal reviewed change.

## Rollback and Cleanup

The gate itself performs no mutation. PostgreSQL checks use rollback and
SQLite checks enable query-only mode. Temporary test databases and PostgreSQL
clusters must be stopped and removed by their existing test runners.

Migration rollback is logical and operational: stop the release, retain the
additive schema constraints, and roll back the application release if needed.
There is no destructive downgrade or automatic data rewrite.

## Sensitive Data

Connection strings, passwords, tokens, secrets, full tenant identifiers,
external identities, payloads, and personal data must never appear in gate
output, tests, fixtures, commits, or documentation. Use counts, sanitized
codes, relation names, and masked identifiers only.

## Current Evidence

- 87 tenant relations pass the architecture and data checks;
- SQLite isolated migrations and upgrades pass the gate;
- PostgreSQL 16 discardable `migrate-empty` passes pre/post gate checks;
- negative fixtures reject missing relations, undocumented exceptions, action
  drift, unregistered relation migrations, registry hash drift, orphaned data,
  manifest hash drift, malformed pilot JSON, and unsanitized Prisma output;
- startup pending-migration coverage proves the gate runs before and after
  the official deploy command.
