# E6A current-state map

CURRENT_STATE_AS_OF=2026-08-24 BRT
POST_STOCK_RUNTIME_BASE_SHA=a1232a195795912d0a900d51edfcc5f12d4b8955
AI_COMMERCE_SOURCE_COMMIT=2b8209ef25ba28a40b756948edfcc12c07f12970
AI_COMMERCE_RUNTIME_SHA=NOT_DEPLOYED

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
