# E6A current-state map

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
