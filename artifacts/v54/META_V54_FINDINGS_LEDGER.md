# V54 Findings Ledger

| Finding | Resolution | Status |
|---|---|---|
| Child writers could race archive | Shared tenant-scoped row lock used across operational writers | PASS |
| Nota cascade could erase history | Schema/migrations use Nota→Cliente Restrict plus transactional delete preflight | PASS |
| Legacy status drift | Canonical status allowlist and preflight count; official legacy count was zero | PASS |
| Visual evidence stale after V52 | New sanitized AFTER fixtures captured at required desktop/mobile sizes | PASS |
| Production target ambiguity | Railway project/environment/service identities positively confirmed | PASS |
| Official migration/deploy/smoke | Migration 9/9, invariants, Railway/Vercel SHA parity, health and safe smoke passed; authenticated session was unavailable and no mutating smoke was attempted | PASS_WITH_LIMITATION |
