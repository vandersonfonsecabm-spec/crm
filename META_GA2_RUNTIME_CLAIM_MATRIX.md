# GA2 runtime claim matrix

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=a45eba71aede67546cf1459b0955e80e6586bff9
FINAL_SOURCE_SHA=eda455912c5ddecb8ae42766f56e2397dce0085c
FINAL_RUNTIME_SHA=e18121ec91ab0278c72856048fea5411db407cbb (Vercel docs-only; source/API/worker baseline eda)
DOCUMENT_STATUS=FINAL_CLAIMS_PASS

| Claim | Status | Evidence |
|---|---|---|
| SOURCE_IDENTITY | PASS | GitHub master and clean GA2 source baseline at eda4559; tag resolves to eda |
| GIT_RELEASE_INTEGRITY | PASS | fast-forward from a45 through eda; report artifacts committed in the final docs commit |
| OFFICIAL_SHA_PARITY | PASS_MANIFEST | API/worker eda; Vercel e181 docs-only redeploy; frontend runtime tree unchanged from ca |
| DATABASE_INTEGRITY | PASS | existing Postgres tenant/FK/orphan gate; no GA2 schema delta |
| MIGRATION_INTEGRITY | PASS | no GA2 migration; prior E6A history unchanged |
| RECOVERY_READINESS | PASS_LOGICAL | protected logical backup/restore evidence retained |
| GLOBAL_TENANT_ISOLATION | PASS_FOCUSED | existing gate plus E6A tenant tests |
| GLOBAL_RECIPIENT_ISOLATION | PASS_FOCUSED | H8 evidence reused; no recipient code changed |
| AUTHENTICATION | PASS | auth contracts, official endpoint and canonical browser session pass |
| AUTHORIZATION | PASS_FOCUSED | role/tenant/tool gates reviewed |
| SESSION_ISOLATION | PASS_SOURCE | existing 194 frontend/session suite |
| SECURITY_GLOBAL | PASS_WITH_ADVISORIES | raw detail leak fixed; dependency advisory accepted |
| BACKEND_GLOBAL | PASS | canonical isolated SQLite node-suite passed; PostgreSQL-specific files remain separately gated |
| WORKERS_GLOBAL | PASS | final worker SUCCESS; no storm/duplicate |
| H7_GLOBAL | PASS_REUSED | no causal H7 delta |
| H8_GLOBAL | PASS_REUSED | no causal H8 delta |
| STOCK_GLOBAL | PASS_REUSED | no causal stock delta; flags scoped |
| AI_COMMERCE_FOUNDATION_GLOBAL | PASS_FOCUSED | 21/21 latest orchestrator; catalog/route fixes |
| AI_COMMERCE_FINAL_OFF_STATE | PASS | env/settings/allowlist deny-by-default; provider NO |
| INBOX_V63_PRESERVED | PASS_SOURCE | full frontend suite |
| V65_OVERVIEW_PRESERVED | PASS_SOURCE | full frontend suite |
| V65_COMMERCIAL_PRESERVED | PASS_SOURCE | full frontend suite |
| V66_RECENT_ACTIVITY_PRESERVED | PASS_REUSED | no related delta |
| AGENDA_GLOBAL | PASS_SOURCE | full frontend suite |
| DEALS_GLOBAL | PASS_SOURCE | full frontend suite |
| CLIENTS_GLOBAL | PASS_SOURCE | full frontend suite |
| INTEGRATIONS_GLOBAL | PASS_REUSED | no integration delta; no outbound |
| FRONTEND_GLOBAL | PASS_SOURCE | 194/194, tsc, lint, build |
| RESPONSIVE_GLOBAL | PASS | authenticated SPA smoke across six required viewports; no horizontal overflow |
| ACCESSIBILITY_GLOBAL | PASS | authenticated shell/controls/states plus existing keyboard/ARIA suite |
| CACHE_SESSION_GLOBAL | PASS_SOURCE | existing session/multitab suite |
| MULTI_TAB_GLOBAL | PASS_SOURCE | existing session/multitab suite |
| PERFORMANCE_GLOBAL | PASS_WITH_ADVISORIES | bounded code; historical DB outliers observed |
| OBSERVABILITY_GLOBAL | PASS | health/ready/deploy/log evidence |
| DEPENDENCY_AUDIT | ACCEPTED_NON_ACTIONABLE | ExcelJS/uuid path reviewed; no force fix |
| TOOLCHAIN_INTEGRITY | PASS | tsc/lint/build and runtime manifests |
| BUILD_REPRODUCIBILITY | PASS | Vite build and Railway/Vercel deploys |
| BACKEND_FULL_SUITE | PASS | confirmation log SHA `40a81acee6c0a7828287d984fb265a47932cde82f42d182d4baeeae08ccb30dc`; canonical isolated SQLite node-suite exit 0, H11 15/15; PG-only cases intentionally separate |
| FRONTEND_FULL_SUITE | PASS | 194/194 |
| TENANT_GATE | PASS_REUSED | 157 relation gate, no schema delta |
| E2E_GLOBAL | PASS | authenticated canonical-domain SPA smoke for Central/catalog/settings/Inbox |
| GLOBAL_DATA_INTEGRITY | PASS_REUSED | no data/migration write in GA2 |
| PRODUCTION_SMOKE | PASS | API/ready/frontend HTTP 200 |
| ROLLBACK_AVAILABLE | PASS_MANIFEST | previous Railway/Vercel deployments and flags |
| FINAL_RECURSIVE_AUDIT | PASS_FOCUSED | three domain audits plus root integration |
| GA2_FINAL_RUNTIME_RECONCILIATION | PASS | Git, Railway, Vercel, health, flags and browser evidence reconciled |
| POST_E6A_BASELINE_FROZEN | PASS | annotated tag created and verified at eda455912c5ddecb8ae42766f56e2397dce0085c |

AI_REAL_PROVIDER_CONNECTED=NO
AI_AUTO_REPLY_ENABLED=NO
AI_EXTERNAL_OUTBOUND=0
