# GA2 preflight

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=a45eba71aede67546cf1459b0955e80e6586bff9
FINAL_SOURCE_SHA=eda455912c5ddecb8ae42766f56e2397dce0085c
FINAL_RUNTIME_SHA=e18121ec91ab0278c72856048fea5411db407cbb (Vercel docs-only deploy; source baseline/tag eda)
DOCUMENT_STATUS=GA2_PREFLIGHT_COMPLETE

## Maintenance 2 continuation

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
FINAL_SOURCE_SHA=28fba94
FINAL_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
DOCUMENT_STATUS=MAINTENANCE_2_PREFLIGHT_COMPLETE_NO_PRODUCTION_WRITE

The continuation began from the reconciled 0c runtime. The GA2 worktree has no
`backend/prisma/dev.db`; this known layout divergence was not worked around by
copying or writing any protected database. All new tests used fakes or a
temporary migration-derived sandbox. Docker/daemon availability was checked
only through the fail-closed real-run command and was unavailable.

Runtime base was resolved from GitHub `origin/master`, not from the dirty
historical checkout. `a45eba7` was the production E6A runtime. The GA2 branch
was created from that commit in an isolated worktree. The final branch is clean
and remote master points to `eda4559`.

Official Railway target: project `glistening-playfulness`, environment
`production`, API deployment `c5e36ec7` and worker deployment `dcf18b0f`, both
SUCCESS/RUNNING at `eda4559`. Official database: Postgres-u_yI. Vercel
production final: `dpl_CL2ewq4mD1h7GTTwVu4T1fRuZeJ7`, READY, commit `e18121e`
(docs-only after source baseline eda).

Health/readiness remained green. AI flags remained OFF, allowlist deny-all,
provider absent and outbound zero. No schema or migration changed in GA2.

The final browser proof used the authenticated canonical CRM domain and passed
without changing credentials or AI flags. The six viewport SPA smoke covered
Central, catalog, settings and Inbox; no horizontal overflow or AI execution
CTA appeared while the capability remained OFF.
