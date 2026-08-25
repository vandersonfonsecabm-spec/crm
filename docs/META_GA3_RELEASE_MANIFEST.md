# Manifesto de release — GA3

CURRENT_STATE_AS_OF=2026-08-25 BRT
START_SOURCE_SHA=25b36e639612275abc826f36f8f89a66fd06701a
FINAL_SOURCE_SHA=d6b665ea8c1cb8eb6d4e80a3f3210aa2ee433950
FINAL_RUNTIME_SHA=d6b665ea8c1cb8eb6d4e80a3f3210aa2ee433950
DOCUMENT_STATUS=GA3_RELEASE_RECONCILED

| Componente | Ref/deployment | Estado |
|---|---|---|
| Git master | `d6b665ea8c1cb8eb6d4e80a3f3210aa2ee433950` | PASS |
| Git release/ga2-post-e6a | `d6b665ea8c1cb8eb6d4e80a3f3210aa2ee433950` | PASS |
| Railway API | `59c6142f-a594-4f27-a66a-a6d786320fd1` | SUCCESS/RUNNING |
| Railway worker | `482ac3c0-c8dd-4fe5-808a-df59ee8ddd54` | SUCCESS/RUNNING |
| Vercel canonical project | `dpl_65YLScSrTpiZNnaB5aCiLc2FYwhX` at `a3c0600` | READY; frontend tree parity PASS |
| PostgreSQL | official Railway target | ready/database ok; 16 migrations |

Vercel did not need a new frontend build after d6: `git diff a3c0600..d6b665e -- frontend` is empty. Backend/worker received the d6 runtime delta.

Flags at reconciliation:

`AI_COMMERCE_ENABLED=false`
`AI_COMMERCE_MOCK_ENABLED=false`
`AI_COMMERCE_RUNTIME_CANARY_APPROVED=false`
`AI_COMMERCE_TENANT_ALLOWLIST=0`
`CRM_PRISMA_QUERY_OBSERVABILITY=false`
`AI_REAL_PROVIDER_CONNECTED=NO`
`AI_AUTO_REPLY_ENABLED=NO`
`AI_EXTERNAL_OUTBOUND=0`
`META_REAL_CHANNELS=OFF`
