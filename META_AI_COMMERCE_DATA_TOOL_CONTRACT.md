# Contratos de dados e ferramentas E6A

## Autoridade

`CommercialCatalogProduct` é um overlay tenant-scoped ligado por FK composta a
`ProdutoEstoque`. `ProdutoExterno`, `EstoqueExterno`, `PrecoExterno` e o
simulador WhatsApp são legado e não alimentam ofertas AI.

## SellableAvailability.v1

Estados públicos: `AVAILABLE`, `LOW_AVAILABILITY`, `OUT_OF_STOCK`,
`NEEDS_CONFIRMATION`, `NOT_SELLABLE`, `DATA_STALE`, `UNKNOWN`. Stale, unknown,
conflito de fonte, unidade incompatível, lote expirado ou semântica ausente
nunca viram disponibilidade afirmativa. Quantidade exata é interna por padrão.

## ProductOffer.v1

Oferta é snapshot imutável com `offerId` opaco, tenant/conversa, preço/moeda,
availability label, freshness/confidence, TTL, revision de catálogo,
materialVersion de estoque e policyVersion. Revalidações de leitura e efeito
invalidam alteração de catálogo, preço, estoque, tenant, conversa ou TTL.

## Registry fechado

Read: `searchCommercialCatalog`, `getProductDetails`,
`getSellableAvailability`, `getProductAlternatives`, `getPurchaseLink`.

Efeito com HITL: `registerProductInterest`, `createOpportunityDraft`,
`handoffToSalesperson`. Cada efeito usa actor, tenant/conversa, approval,
CAS e idempotency. Não existem ferramentas SQL, HTTP genérico, sender,
reserva, desconto, pagamento ou pedido.

## ConnectionPort

Implementações permitidas nesta missão: `UnconfiguredCommerceAIConnection` e
`MockCommerceAIConnection`. Ambas falham fechado e não fazem rede externa.
