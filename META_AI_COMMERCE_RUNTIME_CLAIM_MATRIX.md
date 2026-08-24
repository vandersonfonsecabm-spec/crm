# Runtime claim matrix E6A

| Claim | Status | Evidência |
|---|---|---|
| Baseline stock congelada | PASS | tag local aponta para a1232a1; docs 23485b5 |
| Runtime source E6A | PASS | commit 2b8209e |
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
| PostgreSQL official runner | BLOCKED | generic engine error before execution |
| PostgreSQL official migration | BLOCKED | official DB identified but E6A tables absent |
| Official backup/restore | BLOCKED | Railway Hobby disables Backups/PITR |
| Railway/Vercel deploy | NOT_EXECUTED | current production is E5R runtime |
| Live canary | NOT_EXECUTED | local controlled Mock only |
| Auto reply/outbound | PASS_ZERO | outbound=0; no sender path |
| Final state | PASS_OFF | all AI flags/allowlist OFF |

`AI_COMMERCE_SHA_PARITY` is not claimed for a deployment; only source commit
parity is evidenced.
