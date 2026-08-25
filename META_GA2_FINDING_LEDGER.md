# GA2 finding ledger

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=a45eba71aede67546cf1459b0955e80e6586bff9
FINAL_SOURCE_SHA=eda455912c5ddecb8ae42766f56e2397dce0085c
FINAL_RUNTIME_SHA=e18121ec91ab0278c72856048fea5411db407cbb (Vercel docs-only; source/API/worker baseline eda)
DOCUMENT_STATUS=GA2_FINDINGS_RECONCILED

| ID | Severity | Finding | Status | Fix/evidence |
|---|---|---|---|---|
| GA2-001 | HIGH | concurrent HITL effects ran before CAS | RESOLVED | b9a1e54; 21/21 focused tests incl. concurrent effect count |
| GA2-002 | MEDIUM | raw catalogContext crossed future connection port | RESOLVED | 52e687f; redaction test |
| GA2-003 | MEDIUM | partial settings update erased policies | RESOLVED | 52e687f; merge-preserving implementation |
| GA2-004 | MEDIUM | catalog visibility/availability filters ignored | RESOLVED | 52e687f; list/search route filters |
| GA2-005 | MEDIUM | published product detail leaked raw Prisma/internal fields | RESOLVED | b9a1e54; public serializer at route boundary |
| GA2-006 | MEDIUM | product routes were blank/unknown and AI UI ignored OFF | RESOLVED | 52e687f; route parser, explicit OFF surfaces, capability propagation |
| GA2-007 | MEDIUM | E6A docs on master said canary/QA were pending | RESOLVED | 52e687f; corrected E6A docs and GA2 package |
| GA2-008 | LOW | stale price type could render as a normal currency | RESOLVED | ca9744b; price status alignment |
| GA2-009 | ADVISORY | Prisma generic runner fails before execution | ACCEPTED_NON_ACTIONABLE | documented tooling blocker; SQL/restore/runtime evidence retained |
| GA2-010 | ADVISORY | ExcelJS→uuid moderate advisory | ACCEPTED_NON_ACTIONABLE | import is admin/bounded and uses uuid.v4 only; no force upgrade |
| GA2-011 | ADVISORY | one historical P2028 and DB checkpoint outliers | ACCEPTED_NON_ACTIONABLE | no recurrence in subsequent cycles; keep observation |
| GA2-012 | MEDIUM | authenticated browser login failed on a deployment alias | RESOLVED | canonical production domain session passed six-viewport SPA smoke |
| GA2-013 | MEDIUM | isolated runner expected an obsolete 37-migration tree | RESOLVED | eda4559; current 39-migration expectation and bounded per-file timeout |
| GA2-014 | LOW | H11 fixture hard-coded a historical pending migration name | RESOLVED | eda4559; fixture derives latest migration from the tree |
| GA2-015 | LOW | legacy capability fixtures omitted the E6A `aiCommerce=false` field | RESOLVED | eda4559; E1A/WhatsApp contract expectations updated |
| GA2-016 | LOW | webhook tests matched obsolete zero-argument `express.json()` syntax | RESOLVED | eda4559; assertion now verifies configured parser ordering |

CRITICAL_ACTIONABLE_OPEN=0
HIGH_ACTIONABLE_OPEN=0
MEDIUM_ACTIONABLE_OPEN=0
LOW_ACTIONABLE_OPEN=0
FINDINGS_BLOCKED=0
FINDINGS_TOTAL=16
FINDINGS_RESOLVED=13
FINDINGS_ACCEPTED_NON_ACTIONABLE=3

## Maintenance 2 reconciliation

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
FINAL_SOURCE_SHA=28fba94
FINAL_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
DOCUMENT_STATUS=MAINTENANCE_2_FINDINGS_RECONCILED

| ID | DOMAIN | SEVERITY | STATUS | EVIDENCE | FIX / LIMIT |
|---|---|---:|---|---|---|
| MAINT-008 | DB observability | MEDIUM | RESOLVED_SOURCE | query/error listeners opt-in before maintenance proxy, bounded fingerprints, 10/10 tests | Runtime remains OFF until controlled canary |
| MAINT-009 | PostgreSQL tooling | MEDIUM | BLOCKED_EXTERNAL | `test:postgres:real --dry-run` PASS; real run exits 1 because Docker daemon is unavailable | Run against disposable cluster when Docker/admin or external disposable URL exists |
| MAINT-010 | Meta inbound | HIGH readiness | RESOLVED_SOURCE | helper 3/3; WhatsApp 12/12; Instagram 8/8; Messenger 9/9; processor 11/11 | Channels remain OFF; activation requires tenant canary |
| MAINT-011 | PostgreSQL checkpoint | MEDIUM | ACCEPTED_NON_ACTIONABLE | historical 202.98s outlier; no recurrence in observed window | Monitor with new telemetry; fix only on recurrence/correlation |

CRITICAL_ACTIONABLE_OPEN=0
HIGH_ACTIONABLE_OPEN=0
MEDIUM_ACTIONABLE_OPEN=0
LOW_ACTIONABLE_OPEN=0

## Pós-GA2 maintenance findings

| ID | Severity | Finding | Status | Fix/evidence |
|---|---|---|---|---|
| MAINT-001 | MEDIUM | Prisma SQLite/PG clients compartilhavam output e corriam no Windows | RESOLVED | 0c058e5; workspace/loader isolado, PG harness 22/22 |
| MAINT-002 | MODERATE | ExcelJS transitivamente resolvia uuid vulnerável | RESOLVED | 6695b78; uuid 11.1.1 override, audit zero, XLSX/import 1/1 |
| MAINT-003 | MEDIUM | P2028/P2034 podiam ser quarantined no primeiro erro do stock outbox | RESOLVED | 82c15ba; retry bounded + teste stock worker 9/9 |
| MAINT-004 | MEDIUM | Sync inteiro sem limite/timeout/margem de lease | RESOLVED | 0c058e5; batch 100, timeout/CAS/retry accounting, sync 14/14 |
| MAINT-005 | LOW | Exaustão de jobs não tinha evento observável | RESOLVED | 0c058e5; `job_attempts_exhausted`, automação 14/14 |
| MAINT-006 | LOW | Checkpoint isolado de 202.98s sem histogramas de query | ACCEPTED_NON_ACTIONABLE | sem reincidência; monitoramento/pg_stat_statements fica pendente |
| MAINT-007 | LOW | Webhooks Meta OFF ainda não têm retry P2028 bounded | ACCEPTED_NON_ACTIONABLE | capability OFF; requisito congelado antes de futura ativação |
