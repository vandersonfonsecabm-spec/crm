# E6A current-state map

CURRENT_STATE_AS_OF=2026-08-24 BRT
POST_STOCK_RUNTIME_BASE_SHA=a1232a195795912d0a900d51edfcc5f12d4b8955
AI_COMMERCE_SOURCE_COMMIT=a45eba71aede67546cf1459b0955e80e6586bff9
AI_COMMERCE_RUNTIME_SHA=a45eba71aede67546cf1459b0955e80e6586bff9

| Area | Existing source | E6A adaptation |
|---|---|---|
| Stock truth | `ProdutoEstoque`, `SaldoEstoque`, `LoteEstoque`, `FonteEstoque` | canonical availability service only |
| Legacy catalog | `commercialCatalogService.js`, `ProdutoExterno`, `EstoqueExterno` | excluded from AI path |
| Inbox | `DashboardInboxPanel`, `ConversaCanal`, `MensagemCanal` | add assist panel; preserve composer/lease |
| Commercial context | `InboxCommercialPanel`, `Negocio`, `Acompanhamento` | reuse qualification and official promotion path |
| Feature gate | `tenant-features/service.js` | integrate AI capability; no parallel gate |
| Worker | existing automation worker | synchronous Mock first; no second worker |
| Notifications | existing H8 center | no AI notification center |
| External channels | existing test-only simulators | no AI sender/outbound |

## Estado operacional pós-migration

- PostgreSQL oficial: migrations E6A aditivas aplicadas; tenant/FK gate 157/157
  sem órfãos ou vínculos cruzados.
- Railway API/worker: deployments SUCCESS no merge SHA
  `a45eba71aede67546cf1459b0955e80e6586bff9`.
- Vercel production: READY no mesmo merge SHA; `/health`, `/ready` e frontend
  HTTP 200.
- AI flags/env: ausentes/default OFF; nenhum modelo real, adapter ou outbound.
- Live Mock canary API: PASS em tenant 1; SHADOW/SUGGESTION/HUMAN_APPROVAL,
  tenant isolation e zero outbound.
- QA visual autenticado: PASS nos seis viewports; primeira tentativa chegou ao
  login, depois a conta de teste permitiu a coleta completa.
