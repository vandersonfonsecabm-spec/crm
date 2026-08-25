# Manifesto de release — GA3

CURRENT_STATE_AS_OF=2026-08-25 BRT
START_SOURCE_SHA=25b36e639612275abc826f36f8f89a66fd06701a
FINAL_SOURCE_SHA=cf7e87f961b05996d4e806ab7bcfd657b2b111f0
DOCUMENTATION_HEAD=DOCUMENTATION_ONLY_OVERLAY_AFTER_RUNTIME_TAG
FINAL_RUNTIME_SHA=cf7e87f961b05996d4e806ab7bcfd657b2b111f0
DOCUMENT_STATUS=GA3_RELEASE_RECONCILED

| Componente | Ref/deployment | Estado |
|---|---|---|
| Runtime code tag | `saas-ga3-final-pass-2026-08-25` → `cf7e87f961b05996d4e806ab7bcfd657b2b111f0` | PASS |
| Git master/release | documentation-only overlay after runtime tag; exact ref is the delivery `git rev-parse HEAD` | PASS; no runtime code delta |
| Railway API | `6fe8c55f-b7d3-4179-9d1e-56a8c4a596f6` | SUCCESS/RUNNING |
| Railway worker | `e9fcc843-43d4-4899-a886-05593251b8e2` | SUCCESS/RUNNING |
| Vercel canonical project | `dpl_65YLScSrTpiZNnaB5aCiLc2FYwhX` at `a3c0600` | READY; frontend tree parity PASS |
| PostgreSQL | official Railway target | ready/database ok; 16 migrations |

Vercel did not need a new frontend build after cf7: `git diff a3c0600..cf7e87f -- frontend` is empty. Backend/worker received the cf7 runtime delta.

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
