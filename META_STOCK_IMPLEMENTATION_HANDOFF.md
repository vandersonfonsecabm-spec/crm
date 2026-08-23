# Handoff para missão futura de implementação

CURRENT_STATE_AS_OF=2026-08-23T17:51:15Z
BASELINE_SHA=a5a280c3ebc54741ced02a77d4da5ec51834d583
ARCHITECTURE_VERSION=E1-v1.0
DOCUMENT_STATUS=FINAL

## Não executar neste handoff

Não contém código pronto nem autoriza migration, deploy, flag, credencial, provider, webhook ou UI. A próxima missão deve criar branch nova a partir de `saas-global-audit-pass-2026-08-23`, nunca da branch histórica 618a.

## MVP futuro

1. `FILE_IMPORT_CSV` sintético, read-only para a fonte, preview/validation.
2. Fonte/capabilities/lifecycle, sync run/checkpoint, normalização e quality.
3. Produto/lote/local/saldo/mapping tenant-safe; validade DATE e quantidade decimal.
4. Rules `STOCK_LOT_EXPIRING`, `STOCK_LOT_EXPIRED`, `STOCK_DATA_STALE`, `STOCK_SYNC_FAILED`.
5. Outbox PostgreSQL e projeção H8 idempotente; sem segunda Central.
6. API/UI contratual de fontes, sync, produtos/lotes, freshness e mapping.

## Lotes de implementação

0. Preflight baseline/worktree/DB/recovery.
1. Migrations aditivas core + feature OFF.
2. Adapter contract/conformance + CSV parser seguro.
3. Canonical normalization/mapping/location/lot/balance.
4. Sync/checkpoint/outbox/leases/retries/fairness.
5. Rules shadow mode e quality/freshness.
6. H8 projection canário com occurrence/recipient/deep links.
7. UI estados/loading/error/stale/mobile/a11y.
8. Dataset E1, unit/integration/concurrency/security/E2E/perf.
9. Sol, canário, rollback e release.

## Arquivos/camadas prováveis

- `backend/prisma/schema.prisma` + migrations futuras;
- `backend/src/stock/` (domain, adapters, normalization, sync, rules, outbox, routes);
- extensão focal do worker existente, não segundo worker de notificações;
- integração focal com `backend/src/notifications/` para projection;
- `frontend/src/services/crmApi.ts` e componentes de estoque reutilizando primitives existentes;
- testes backend/frontend/adapters e fixtures sintéticas.

## Flags e rollout

`STOCK_DOMAIN_ENABLED`, `STOCK_SYNC_WORKER_ENABLED`, `STOCK_RULE_ENGINE_ENABLED`, `STOCK_H8_PROJECTION_ENABLED`, `STOCK_TENANT_ALLOWLIST`, `STOCK_SOURCE_ENABLED`, todos OFF por default e tenant-scoped. `AUTOMATION_WORKER_ENABLED` e flags H8 existentes não devem ser reutilizadas ambiguamente.

## Gates obrigatórios

DB precheck/recovery/rehearsal, source freeze, conformance, tenant/recipient isolation, mapping ambiguity, freshness, no outbound, H8 lifecycle, performance/fairness, visual/a11y, observação, rollback e Sol final. Falha de segredo, cross-tenant, storm, cursor perdido, snapshot parcial apagando dados ou writeback externo é hard stop.

## Decisões de produto pendentes

Janela padrão de validade, recipients, snooze crítico, política sem validade, quantidade relevante, autoridade multi-source e retenção. Usar o `META_STOCK_ARCHITECTURE_DECISIONS.md` para escolher/configurar; não codificar silenciosamente.

## Fora de escopo explícito

Bling como fonte, estoque futuro baseado em provider específico, writeback ERP, `PRODUCT_STALE/PRODUCT_INCOMPLETE`, custo/preço, sincronização externa real, compra de infraestrutura, migration/deploy nesta missão.

## Entrega

`ARCHITECTURE_DOCS_COMMIT` será informado na mensagem final após o commit local; não inserir o próprio SHA dentro de documentos já commitados.
