# STORE-1 — Fechamento técnico de fundações para providers

Data: 2026-08-27

Source funcional final: `db59f37ee69c0ed2b4cb3c75b871dfb1ed5a0162`

Branch: `codex/store1-release-reconcile`

## Resumo executivo

O núcleo interno permanece aprovado e o candidato integrado foi publicado somente no staging. Produção não foi alterada. Meta, Bling, e-mail e IA reais não foram conectados; nenhuma credencial real foi usada e nenhum outbound de provider foi habilitado.

Foram implementadas e provadas as fundações duráveis de ACK/retry Meta, coordenação distribuída Bling, outbox de e-mail, porta provider-neutral de IA, checkpoints de workers e estados verdadeiros de UI.

## Resultado canônico

```text
STORE1_INTERNAL_PRODUCT_READY=PASS
FINAL_RUNTIME_READY=PASS
FINAL_RUNTIME_QA=PASS
POSTGRES_ONLY_EVIDENCE=PASS
SOURCE_RUNTIME_PARITY=PASS
STABLE_ALIAS_PARITY=PASS
PRODUCTION_CHANGED=false
REAL_PROVIDER_CONNECTIONS=0
REAL_PROVIDER_CREDENTIALS_USED=0
REAL_OUTBOUND=0

META_CONNECTOR_FOUNDATION=PASS
META_ASYNC_ACK=PASS
META_INBOUND_WORKER=PASS
WHATSAPP_FOUNDATION_READY=PASS
INSTAGRAM_FOUNDATION_READY=PASS
MESSENGER_FOUNDATION_READY=PASS

BLING_DISTRIBUTED_LOCK=PASS
BLING_TOKEN_LIFECYCLE=PASS
BLING_SYNC_IDEMPOTENCY=PASS
BLING_FOUNDATION_READY=PASS

EMAIL_DELIVERY_FOUNDATION=PASS
EMAIL_REAL_PROVIDER_ADAPTER=PENDING_PROVIDER_SELECTION
AI_CONNECTOR_FOUNDATION=PASS
AI_REAL_PROVIDER_ADAPTER=PENDING_PROVIDER_SELECTION

INTEGRATION_UI_TRUTH=PASS
FALSE_CONNECTED_STATES=0
PROVIDER_SECRET_HANDLING=PASS_LOCAL_BOUNDARIES
WORKER_OPERATIONAL_READINESS=PASS

BOUNDED_AUTHENTICATED_SMOKE=PASS
SOAK_4H15=PASS
SOAK_REQUESTS=5560
SOAK_FAILURES=0
SOAK_HTTP_5XX=0
SOAK_PROVIDER_EGRESS=0
SOAK_PRODUCTION_REQUESTS=0
SOAK_RESTART=PASS
SOAK_CLEANUP=PASS
```

## Alterações principais

- Meta: webhook responde depois do commit do intake; worker durável com CAS, lease, retry e recuperação.
- Bling: lease tenant-scoped com fencing, refresh coalescido, OAuth único por tenant, 401 final verdadeiro e redirect fail-closed.
- E-mail: outbox durável, token AES-256-GCM, CAS, retry, receipt/bounce idempotentes; adapter real deliberadamente não escolhido.
- IA: connector port único, timeout/Abort, resposta estrita e token HMAC server-side; adapter real deliberadamente não escolhido.
- Workers: checkpoints persistentes, cursor pós-sucesso, watchdog, shutdown e saída fatal não-zero.
- UI: WhatsApp, Instagram, Messenger, Bling e IA não exibem conexão sem evidência suficiente.
- Segurança: configuração genérica rejeita secrets inclusive em valores; Bling não pode ser forjado pelo writer genérico.
- Runtime: endpoint sanitizado `/runtime-fingerprint` prova staging, SHA e providers/outbound OFF.

## Evidências

- Frontend: `217/217 PASS`; TypeScript, ESLint e Vite build PASS.
- Bundle final: initial `287.59 kB` (`90.29 kB gzip`); Dashboard `395.70 kB` (`99.73 kB gzip`).
- PostgreSQL real descartável 18.6: PASS; suite canônica com 10 arquivos e cleanup.
- Manifest PG source SHA-256: `be0adea131077fae03331f82b3fdaeacbf7cc156b6d6511a0219a145046d498d`.
- Evidência PG log SHA-256: `8c6d3960bc1b36fae2bdd1b84ef7b87e1a51dc9d8c692fe53a176a91c1726f09`.
- SQLite migration/tenant gate: 162 relações, zero orphan/cross-tenant, 238 FKs verificadas.
- `backend/prisma/dev.db`: `6116ca72110d8c4a6b5bc214a476993afdc155ec32b3b2431e4ce54254a42533` (intacto).
- Railway API staging deployment final: `39cde9ad-5662-4b67-bad0-5dd1fb53cebb` (`SUCCESS`).
- Railway worker staging deployment: `bd70b271-4968-464a-8333-632dca1dd5fa` (`SUCCESS`).
- Vercel staging deployment: `dpl_5KLEGHgZ6AB6eW9kmZjXwSMpQEmH` (`READY`).
- API direta e alias Vercel retornaram fingerprint autoritativo idêntico: source manifest `e8750e1bfd01cd9b507d6279e05699356382ab8f3a2508e0e109e1c2c3bcbb5e`, IDs Railway e banco staging verificados, providers/outbound OFF. Sem token técnico, o endpoint retorna 404 antes de hash ou banco.
- Browser QA autenticado: rotas críticas PASS, console error/warn = 0.
- Egress do worker: somente DNS interno e PostgreSQL staging; provider egress = 0.
- Soak staging de 255 minutos: `PASS`, executado de `2026-08-27T22:38:27.355Z` a `2026-08-28T02:53:32.801Z`.
- Ledger sanitizado SHA-256: `235699e82aba06f46b5deb68410ddfcc0e2388710d569a2b1eefb3e2713fda9e`.
- Requests: 5.560/5.560 bem-sucedidos; p95 542 ms; p99 692 ms; zero 4xx/5xx contabilizado como sucesso.
- Health/ready: 1.112 verificações cada, zero falha.
- Autenticação: 3 logins, 57 refreshes, 60 validações e zero falha/relogin.
- Jobs no baseline e final: total/pending/running/failed/stuck/retries/duplicates = 0.
- Restart controlado: `PASS`.
- Cleanup confirmado: 3 usuários desativados, 3 sessões revogadas, zero sessão/token/lease ativo remanescente.
- Proxy TCP temporário do PostgreSQL staging removido após validação; pacote temporário removido; Prisma local restaurado para SQLite.

## Falhas encontradas e recuperadas

1. Prisma não desserializava retorno `void` do advisory lock PostgreSQL (`P2010`); retorno passou a ser texto e recebeu teste real.
2. Runner PG omitia o lifecycle lock; manifesto corrigido.
3. Testes antigos tratavam canal pausado como erro permanente; contrato/retestes atualizados para retry durável.
4. Testes canônicos ainda apontavam para migration/relation count antigos; reconciliados para 41 migrations e 162 relações.
5. Upload Railway era `SKIPPED` por watch path; pacote temporário com source exato e watch `**` forçou build verificável.
6. Worker novo tentou iniciar como API; guard bloqueou. Manifest temporário correto publicou o worker sem efeitos externos.
7. Revisão adversarial detectou fingerprint, worker gate Meta, bypass genérico Bling e watchdog; todos corrigidos e retestados.

## Limitações honestas

- E-mail e IA possuem fundação/porta provider-neutral, mas ainda exigem seleção e implementação do adapter específico na missão de ativação.
- O soak canônico de 255 minutos foi concluído com três identidades QA temporárias e cleanup integral. As identidades permaneceram exclusivamente no staging e foram desativadas ao final.
- Nenhuma conta Meta, número WhatsApp, Página Messenger, Instagram, conta Bling, SMTP ou provider de IA foi conectado.

## Review adversarial final

`SHIP` — nenhum finding bloqueante restante após quatro rodadas adversariais focadas.

## Otimizações de execução

- Evidências causais anteriores foram reutilizadas somente quando arquivos relacionados permaneceram equivalentes.
- A regressão backend foi retomada por ponto canônico após falhas tardias, evitando repetir testes já aprovados sem mudança.
- Deploys `SKIPPED` não foram tratados como sucesso; fingerprint encerrou a ambiguidade de runtime.
