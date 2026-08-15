# H8 — Deep links

Destinos persistidos como pares estruturados `alvoTipo + alvoId`; URL livre nao e
aceita. A camada frontend converte por allowlist:

- `CONVERSATION` -> `/caixa-de-entrada?conversationId=<id>`
- `FOLLOW_UP` -> `/agenda?acompanhamentoId=<id>`
- `DEAL` -> `/negocios?negocioId=<id>`

O Dashboard le os parametros na montagem e entrega o ID ao painel correspondente.
O backend continua autoridade de tenant, permissao e existencia. Target removido
ou proibido nao ganha acesso por causa da notificacao.
