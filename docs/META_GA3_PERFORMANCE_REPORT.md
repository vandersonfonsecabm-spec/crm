# Relatório de performance e confiabilidade — GA3

CURRENT_STATE_AS_OF=2026-08-25 BRT
START_SOURCE_SHA=25b36e639612275abc826f36f8f89a66fd06701a
CURRENT_SOURCE_SHA=cf7e87f961b05996d4e806ab7bcfd657b2b111f0
FINAL_RUNTIME_SHA=cf7e87f961b05996d4e806ab7bcfd657b2b111f0
DOCUMENT_STATUS=GA3_MEASURED_WITH_EXTERNAL_PG_GATE

## Medições de produção

- Janela Prisma controlada somente na API: observabilidade ON, threshold 50 ms, métricas bounded; depois OFF e redeploy confirmado.
- Cinco health/readiness probes durante a janela: HTTP 200; nenhum `prisma_slow_query` ou `prisma_database_error` observado.
- Amostra HTTP direta: p50/p95 5 ms, máximo 87 ms (amostra pequena; não é benchmark de carga).
- Worker: 82 ciclos observados; p50 ~334 ms, p95 ~416 ms, máximo ~1077 ms; `failedCount=0`, `failedTenants=[]`.
- Última janela Railway pós-deploy: ciclos stock ~200–280 ms, sem erro.
- PostgreSQL: locks aguardando 0, queries ativas >5s 0, idle transactions 0, 13 conexões/500 máximas; 16 migrations aplicadas.
- Outbox: 4 pendentes, 60.259 processados e 3 quarentenados históricos; nenhum crescimento contínuo comprovado nesta janela.

## Outlier

Um checkpoint PostgreSQL de ~247,253 s (mais outliers de 44–48 s) foi observado. Não houve P2028 atual, lock ou query longa correlacionada. Estado: advisory de recuperação/IO; abrir correção somente com reincidência ou correlação causal.

## Código

- Busca usa projeção mínima e limite bounded; disponibilidade é opt-in para evitar N+1.
- Disponibilidade falha fechado para fonte ambígua, unidade incompatível, duplicata, precisão/overflow.
- ProductOffer reutiliza preview ativo por tenant/conversa/produto e limita ativos.
- Contadores de ferramentas e payloads de auditoria têm TTL/caps.

## Limitações

Não há sampling probabilístico no listener Prisma; o controle atual é opt-in + threshold + TTL/cap. Não foi executado teste de carga 5–100 usuários nem `EXPLAIN ANALYZE` em produção; isso exigiria uma janela própria e autorização de carga.

`POSTGRES_REAL_REHEARSAL=BLOCKED_ENVIRONMENT` e `PG_STAT_STATEMENTS_LIVE=BLOCKED_EXTERNAL` permanecem honestos.
