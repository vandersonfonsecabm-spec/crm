# GA2 architecture map

CURRENT_STATE_AS_OF=2026-08-24 BRT
START_RUNTIME_SHA=a45eba71aede67546cf1459b0955e80e6586bff9
FINAL_SOURCE_SHA=eda455912c5ddecb8ae42766f56e2397dce0085c
FINAL_RUNTIME_SHA=eda455912c5ddecb8ae42766f56e2397dce0085c (source baseline; API/worker b9, Vercel ca)
DOCUMENT_STATUS=GA2_ARCHITECTURE_MAPPED

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
