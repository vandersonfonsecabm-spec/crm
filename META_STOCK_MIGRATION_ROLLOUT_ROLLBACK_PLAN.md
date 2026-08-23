# Plano futuro de migration, rollout e rollback

CURRENT_STATE_AS_OF=2026-08-23T17:51:15Z
BASELINE_SHA=a5a280c3ebc54741ced02a77d4da5ec51834d583
ARCHITECTURE_VERSION=E1-v1.0
DOCUMENT_STATUS=FINAL

## Estado desta missão

`NEW_MIGRATION=NOT_CREATED`; nenhum schema foi alterado. As migrations abaixo são desenho conceitual para uma missão futura, sempre com DB precheck, backup/restore, rehearsal e Sol antes de escrita.

## Sequência aditiva proposta

1. **Core de fontes/sync:** `FonteEstoque`, capacidades, lifecycle, `ExecucaoSincronizacaoEstoque`, checkpoint e índices de lease.
2. **Modelo canônico:** `ProdutoEstoque`, mapping externo, locais, lotes, saldos, unidades e constraints tenant-safe.
3. **Qualidade/regras:** freshness, observations, quality issues, regras, overrides e auditoria.
4. **Confiabilidade/projeção:** outbox transacional, material version, projection status e índices de dedupe.
5. **Retenção/índices:** somente após volume/precheck; sem NOT NULL/unique que não tenha backfill seguro.

Runtime antigo continua saudável em cada etapa; defaults OFF; nenhum down migration destrutivo é rollback normal.

## Outbox escolhido

`EventoOutboxEstoque` no PostgreSQL oficial, escrito na mesma transação que aplica a observação/saldo. O worker existente consome com lease/CAS e chama a projeção H8 idempotente. Não adicionar Redis, Kafka ou microserviço: a outbox atende confiabilidade e replay na infraestrutura atual.

## Flags deny-by-default

- `STOCK_DOMAIN_ENABLED`
- `STOCK_SYNC_WORKER_ENABLED`
- `STOCK_RULE_ENGINE_ENABLED`
- `STOCK_H8_PROJECTION_ENABLED`
- `STOCK_TENANT_ALLOWLIST`
- `STOCK_SOURCE_ENABLED`

Nenhuma reutiliza flag H7/H8. A conexão e o tenant também precisam estar ativos; ausência de qualquer gate mantém OFF.

## Rollout futuro

0. schema/adapters publicados com tudo OFF;
1. adapter CSV sintético em tenant QA controlado;
2. sync read-only e conformance;
3. shadow rules sem H8 projection;
4. projection H8 apenas no canário;
5. E2E/visual/a11y/cache/tenant/no-outbound;
6. target controlado ou real autorizado;
7. expansão gradual por allowlist e observação.

Cada fase registra source SHA, flags, counts, health, rollback e auditoria. Não chamar QA de produção.

## Rollback futuro

1. `STOCK_H8_PROJECTION_ENABLED=false`;
2. `STOCK_RULE_ENGINE_ENABLED=false`;
3. `STOCK_SYNC_WORKER_ENABLED=false`;
4. desligar fontes/tenant allowlist;
5. preservar checkpoints e outbox para retomada idempotente;
6. limpar fixtures sintéticas sem apagar auditoria;
7. se necessário, voltar API/worker/frontend ao deployment anterior identificado na baseline;
8. manter tabelas aditivas inertes; nunca DROP/down migration destrutiva.

## Gates pré-promoção

DB binding/parity, migration/recovery, source SHA, flags OFF, tenant isolation, conformance, shadow mode, E2E, performance/fairness, no-outbound, visual/a11y, Sol e rollback readiness. Um finding de cross-tenant, source spoof, storm, segredo ou perda de checkpoint é hard stop.
