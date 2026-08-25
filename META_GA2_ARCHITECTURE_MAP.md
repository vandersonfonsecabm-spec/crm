# GA2 architecture map

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=a45eba71aede67546cf1459b0955e80e6586bff9
FINAL_SOURCE_SHA=eda455912c5ddecb8ae42766f56e2397dce0085c
FINAL_RUNTIME_SHA=e18121ec91ab0278c72856048fea5411db407cbb (Vercel docs-only; source/API/worker baseline eda)
DOCUMENT_STATUS=GA2_ARCHITECTURE_MAPPED

## Maintenance 2 overlay

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
FINAL_SOURCE_SHA=c81328d
FINAL_RUNTIME_SHA=0c058e5bc7663dc278d6ae4b26bd76816fc57eb6
DOCUMENT_STATUS=MAINTENANCE_2_ARCHITECTURE_DELTA_MAPPED

New source modules are bounded to database query observability, read-only
`pg_stat_statements` reporting, a disposable PostgreSQL test command, and the
shared Meta inbound retry helper. No new worker, route, table, migration,
provider adapter or outbound path was introduced.

| Domain | Owner/source | Routes/tables | Runtime status | Risk/legacy |
|---|---|---|---|---|
| Auth/session | existing Express auth + frontend session | auth/session tables | healthy | canonical browser session validated |
| Inbox/H1-H2/V63 | DashboardInboxPanel, conversation services | ConversaCanal/MensagemCanal/lease | preserved | no second Inbox |
| H7 | automation worker/services | automation runs/jobs | healthy | no new delta |
| H8 | notification center/projection | notification/outbox tables | healthy | tenant 1 scoped |
| Stock | stock services + existing worker | canonical stock tables | healthy | Bling remains TEST_ONLY |
| E6A catalog | ai-commerce catalog/search/availability/offer | CommercialCatalogProduct/ProductOffer | OFF-safe | legacy hub excluded from AI path |
| E6A orchestration | connection/tools/policy/orchestrator | AICommerceRun/Draft/HITL/audit | OFF-safe | CAS and replay guard fixed in b9 |
| Frontend | existing Dashboard shell + E6A panels | Vite React routes | build/lint/full suite/browser smoke pass | six viewports validated |
| Deploy | Railway API/worker + Vercel CRM | deployment manifests | component parity manifest pass | API/worker stayed at b9 because ca changed frontend only |

No second worker, second Central, provider adapter, generic HTTP/SQL tool or
outbound path was introduced.
