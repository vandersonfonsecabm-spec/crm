# Runtime claim matrix E6A

| Claim | Status | Evidência |
|---|---|---|
| Baseline stock congelada | PASS | tag local aponta para a1232a1; docs 23485b5 |
| Runtime source E6A | PASS | core 2b8209e; production merge a45eba71; audit/tool/scalar fixes merged |
| Canonical catalog authority | PASS | overlay + FK ProdutoEstoque; tests 4/4 |
| Sellable availability truth | PASS | stale/unknown/expired fail-closed |
| Deterministic search | PASS | bounded/tenant-safe test |
| ProductOffer snapshot/TTL | PASS | offer test |
| Closed tools | PASS | registry test; no generic dangerous tool |
| Single connection slot | PASS | Unconfigured + Mock only |
| Real connector/provider | NOT_APPLICABLE | explicit NO |
| Mock no-network | PASS | deterministic connection tests |
| Orchestrator bounded/idempotent | PASS | focused tests |
| Granular HITL effects | PASS | effects test + CAS draft test |
| Existing Inbox reuse | PASS | frontend contracts 19/19 |
| Tenant schema/FKs | PASS | architecture/post-migration gates |
| SQLite rehearsal | PASS | 39 migrations isolated copy |
| PostgreSQL empty/restore rehearsal | PASS | isolated `e6a_restore_20260824`; all 16 migrations; runtime smoke |
| Official logical backup | PASS | 64,627,065 bytes; SHA-256 8fae9053…; protected temp only |
| Official PostgreSQL migration | PASS | two additive E6A migrations; post-gate 157/157, no orphan/cross-tenant |
| Official post-migration health | PASS | API/ready 200; locks waiting=0; no pre-existing table decrease |
| PostgreSQL official runner | BLOCKED | generic engine error before execution; not converted to PASS |
| Railway/Vercel deploy | PASS_OFF | API 35288463, worker 3c46b9a2, Vercel dpl_jX2… READY at SHA a45eba71 |
| Live Mock canary | PASS | tenant 1: SHADOW/SUGGESTION/HUMAN approvals, no outbound, cleanup OFF |
| Live tenant isolation | PASS | foreign tenant request 403; capability false after cleanup |
| Remote E6A branch | PASS | fixes merged through PR #6; master a45eba71 |
| Vercel preview build | PASS | dpl_7GcexRMqBfGdSWKdMBQjEKwK7eHq, exact branch SHA |
| Authenticated production visual QA | BLOCKED_SESSION | production opened CRM login gate; no authenticated feature screen |
| Authenticated preview visual QA | BLOCKED_SESSION | preview origin could not validate session |
| Auto reply/outbound | PASS_ZERO | outbound=0; no sender path |
| Final state | PASS_OFF | all AI flags/allowlist OFF |

`AI_COMMERCE_SHA_PARITY=PASS_EXACT_DEPLOY_METADATA` for current Railway and
Vercel merge deployment. Older manual uploads remain un-attested. The live API
canary is PASS; only authenticated visual UI proof remains open, so the final
status is foundation OFF-ready, not live autonomous seller.
