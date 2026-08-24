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
  teclado, Escape, loading/error/stale/expired e mobile. A primeira tentativa
  encontrou o gate de login; depois, com a conta de teste autorizada, a QA
  visual autenticada foi executada e registrada abaixo.

`AI_COMMERCE_PRODUCTION_VISUAL_QA=PASS`
`AI_COMMERCE_SOURCE_UI_CONTRACTS=PASS`
`AI_COMMERCE_VERCEL_BUILD=PASS`
`AI_COMMERCE_LIVE_API_CANARY=PASS`

QA visual autenticada real executada em catálogo, configurações e Inbox nos
viewports 1440x900, 1366x768, 1024x768, 900x768, 390x844 e 1920x1080.
Catálogo e configurações renderizaram com sessão autenticada em 6/6 tamanhos;
Inbox renderizou o shell em 6/6, com drawer/contexto e Assistente comercial
validados em 1024 e 390. O painel preserva “Não envia mensagem”, TTL e estado
OFF/Mock. Screenshots foram armazenados temporariamente para inspeção e não
foram enviados por conterem dados de teste da conta.

`AI_COMMERCE_QA_1440=PASS`
`AI_COMMERCE_QA_1366=PASS`
`AI_COMMERCE_QA_1024=PASS`
`AI_COMMERCE_QA_900=PASS`
`AI_COMMERCE_QA_390=PASS`
`AI_COMMERCE_QA_1920=PASS`
`AI_COMMERCE_ACCESSIBILITY=PASS_MANUAL_DOM`
`AI_COMMERCE_NO_AUTO_SEND=PASS`

Frontend lint isolado ficou BLOCKED por ausência intencional de node_modules no
worktree; não foi mascarado como PASS.
