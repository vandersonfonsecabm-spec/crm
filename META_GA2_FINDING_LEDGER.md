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
