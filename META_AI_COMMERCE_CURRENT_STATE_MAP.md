# E6A current-state map

CURRENT_STATE_AS_OF=2026-08-24 BRT
POST_STOCK_RUNTIME_BASE_SHA=a1232a195795912d0a900d51edfcc5f12d4b8955
AI_COMMERCE_SOURCE_COMMIT=80a4f8d5c5067934e818f8e75f2f696d716e5ce0
AI_COMMERCE_RUNTIME_SHA=80a4f8d5c5067934e818f8e75f2f696d716e5ce0

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
  `80a4f8d5c5067934e818f8e75f2f696d716e5ce0`.
- Vercel production: READY no mesmo merge SHA; `/health`, `/ready` e frontend
  HTTP 200.
- AI flags/env: ausentes/default OFF; nenhum modelo real, adapter ou outbound.
- Live Mock canary e QA visual autenticado: `BLOCKED_SESSION`, pois a sessão
  disponível chegou apenas à tela de login.
