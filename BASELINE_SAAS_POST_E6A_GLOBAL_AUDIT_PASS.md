# Baseline GA2

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=a45eba71aede67546cf1459b0955e80e6586bff9
FINAL_SOURCE_SHA=eda455912c5ddecb8ae42766f56e2397dce0085c
FINAL_RUNTIME_SHA=e18121ec91ab0278c72856048fea5411db407cbb (Vercel docs-only; API/worker eda; source tag eda)
DOCUMENT_STATUS=FROZEN

The annotated tag `saas-post-e6a-global-audit-pass-2026-08-24` points exactly to
the final source baseline SHA `eda455912c5ddecb8ae42766f56e2397dce0085c`.
API and worker run eda; Vercel production is READY at docs-only commit
`e18121ec91ab0278c72856048fea5411db407cbb` (frontend code lineage ca9744b),
and the canonical authenticated six-viewport smoke passed.

AI remains OFF, the real provider is NO, auto-reply is NO, outbound is zero,
H7/H8/stock are preserved and the Prisma runner remains a documented tooling
blocker rather than a false PASS.

Maintenance follow-up source: `0c058e5bc7663dc278d6ae4b26bd76816fc57eb6`.
Maintenance tag: `saas-post-e6a-maintenance-audit-pass-2026-08-25`.
This tag adds only bounded runner/retry/lease/telemetry/dependency maintenance;
the original GA2 tag remains immutable and continues to identify the original
foundation baseline.
