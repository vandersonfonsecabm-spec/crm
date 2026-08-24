# UI, Inbox e E2A/E2E

## Integração

O assistente foi acoplado ao `DashboardInboxPanel` e ao
`InboxCommercialPanel`, preservando fila, chat, composer e ReplyLease. Não há
segunda Inbox, Central ou composer.

O painel mostra intenção, evidência de oferta, freshness/confidence, stale/
expired, draft e aprovação. “Inserir rascunho” é explícito, verifica conversa/
revisão/lease e nunca envia.

Catálogo e configurações usam o router/dashboard shell existente:
`/catalogo-comercial` e `/configuracoes/ia-comercial`. Não há API key ou lista
fictícia de provedores.

## Evidência

- TypeScript `tsc -p frontend/tsconfig.json --noEmit`: PASS.
- E6A/Inbox focused: 19/19 PASS.
- Full frontend Node suite: 194/194 PASS após junction temporária para
  dependências existentes; junction removida e lockfiles preservados.
- A11y foi coberta por contratos existentes e estados `aria-live`, foco,
  teclado, Escape, loading/error/stale/expired e mobile. A QA autenticada em
  produção percorreu o shell, catálogo, configurações e Inbox nos viewports
  1920/1440/1366/1024/900/390, sem overflow ou envio.

`AI_COMMERCE_PRODUCTION_VISUAL_QA=PASS`
`AI_COMMERCE_SOURCE_UI_CONTRACTS=PASS`
`AI_COMMERCE_VERCEL_BUILD=PASS`

Viewports de produção aprovados: 1920/1440/1366/1024/900/390. A prova cobre
somente fundação OFF/mock controlado, sem IA real ou outbound.

Frontend lint isolado ficou BLOCKED por ausência intencional de node_modules no
worktree; não foi mascarado como PASS.
