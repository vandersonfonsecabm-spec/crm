# Runtime claim matrix E6A

| Claim | Status | Evidência |
|---|---|---|
| Baseline stock congelada | PASS | tag local aponta para a1232a1; docs 23485b5 |
| Runtime source E6A | PASS | core 2b8209e; UI fix 0fbd3bc; production merge 80a4f8d5 |
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
| Railway/Vercel deploy | PASS_OFF | API 1b95b3b9, worker 6aca96b6, Vercel dpl_3UPrg… all merge SHA 80a4f8d5 |
| Live Mock canary | BLOCKED_SESSION | no authenticated admin/controlled-tenant session; AI remains OFF |
| Remote E6A branch | PASS | origin/feature/ai-commerce-e6a at eff5c3c; merged to master 80a4f8d5 |
| Vercel preview build | PASS | dpl_7GcexRMqBfGdSWKdMBQjEKwK7eHq, exact branch SHA |
| Authenticated production visual QA | BLOCKED_SESSION | production opened CRM login gate; no authenticated feature screen |
| Authenticated preview visual QA | BLOCKED_SESSION | preview origin could not validate session |
| Auto reply/outbound | PASS_ZERO | outbound=0; no sender path |
| Final state | PASS_OFF | all AI flags/allowlist OFF |

`AI_COMMERCE_SHA_PARITY=PASS_EXACT_DEPLOY_METADATA` for the current Railway and
Vercel merge deployment. Older manual uploads remain un-attested. The live
canary and authenticated visual gates remain open; therefore the final status
is OFF-ready, not live-AI-ready.
