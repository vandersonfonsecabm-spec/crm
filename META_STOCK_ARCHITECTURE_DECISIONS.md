# ADRs e registro de decisões da arquitetura de estoque

CURRENT_STATE_AS_OF=2026-08-23T17:51:15Z
BASELINE_SHA=a5a280c3ebc54741ced02a77d4da5ec51834d583
ARCHITECTURE_VERSION=E1-v1.0
DOCUMENT_STATUS=FINAL

## ADR-001 — modelo canônico source-agnostic

**Status:** Accepted for future implementation. **Contexto:** Hub atual usa `ProdutoExterno/EstoqueExterno`; faltam lote, validade, freshness e chave tenant direta para produto legado. **Decisão:** criar camada canônica futura com `ProdutoEstoque`, `LoteEstoque`, `SaldoEstoque` e `empresaId` direto; adapters só normalizam. **Alternativas:** reutilizar `Produto` global (rejeitada por isolamento), modelar Bling (rejeitada), payload JSON único (rejeitada por query/constraint). **Consequências:** migrations aditivas e mapping explícito; mais entidades, porém sem acoplamento.

## ADR-002 — contrato de capability

**Status:** Accepted. **Decisão:** manifesto versionado e truthful governa regras; ausência de capability bloqueia avaliação. **Alternativas:** detectar por campos em runtime (rejeitada), defaults mágicos (rejeitada). **Risco:** adapter precisa manter manifesto sincronizado; conformance suite mitiga.

## ADR-003 — identidade/mapping de produto

**Status:** Accepted. **Decisão:** external ID é único em tenant+fonte; nome nunca faz merge; SKU/barcode apenas evidência; mapping ambíguo fica em quarantine. **Alternativas:** nome/SKU como chave global (rejeitadas). **Consequência:** resolução manual para casos ambíguos.

## ADR-004 — lote/validade

**Status:** Accepted. **Decisão:** validade date-only com precisão DAY/MONTH/YEAR/UNKNOWN, avaliada no timezone do tenant; lote não é global por código. **Alternativa:** timestamp UTC universal (rejeitada por mudança de dia). **Consequência:** adapters preservam precisão original.

## ADR-005 — full/delta/reconciliação

**Status:** Accepted. **Decisão:** full declara generation e só cria tombstones após conclusão íntegra; delta exige cursor/version; webhook agenda reconciliação. **Alternativas:** última escrita vence (rejeitada), ausência no delta remove (rejeitada). **Consequência:** checkpoint/outbox persistidos.

## ADR-006 — multi-source/autoridade

**Status:** Accepted. **Decisão:** prioridade/autoridade tenant-scoped por domínio/local; default `OBSERVATION_ONLY`; conflitos visíveis/quarentenados. **Alternativas:** soma universal, last-write-wins (rejeitadas). **Consequência:** decisão de produto para autoridade é parametrizada.

## ADR-007 — regras → H8

**Status:** Accepted. **Decisão:** regras operam no canônico e emitem `StockRuleProjection` para H8 existente; nenhuma Central/worker/badge paralelos. **Alternativas:** segunda tabela de notificações (rejeitada), provider dispara direto (rejeitada). **Consequência:** lifecycle H8 continua única fonte de verdade.

## ADR-008 — occurrence/lifecycle

**Status:** Accepted. **Decisão:** chave estável por target canônico/regra/fonte causal; bandas evoluem na mesma occurrence; read não resolve. **Alternativa:** occurrence por retry/banda (rejeitada por storm). **Consequência:** materialVersion e resolution predicates obrigatórios.

## ADR-009 — confiabilidade transacional

**Status:** Accepted. **Decisão:** outbox PostgreSQL na mesma transação do saldo/observation; worker existente consome com lease/CAS e projeção idempotente. **Alternativas:** broker externo (rejeitada sem necessidade), scan não transacional (rejeitado por perda). **Consequência:** nova tabela aditiva e retenção bounded futura.

## ADR-010 — tenant/security

**Status:** Accepted. **Decisão:** `empresaId` direto em entidades, FKs compostas, contexto server-side, adapters read-only no MVP, secrets encrypted/redacted, threat controls. **Alternativa:** tenant apenas em payload (rejeitada). **Consequência:** prechecks e testes cross-tenant obrigatórios.

## ADR-011 — adapter de referência/MVP

**Status:** Accepted. **Decisão:** `FILE_IMPORT_CSV` sintético, read-only para a fonte, preview/validation e sem outbound. **Alternativas:** Bling (rejeitada por TEST_ONLY), API vendor (rejeitada por dependência), manual puro (rejeitada por baixa cobertura). **Consequência:** primeiro adapter é determinístico e barato.

## ADR-012 — rollout/rollback

**Status:** Accepted. **Decisão:** schema OFF → sync canário → shadow rules → H8 projection canário → target controlado → expansão; flags deny-by-default, rollback por camada e sem down migration. **Alternativa:** ativação global (rejeitada). **Consequência:** múltiplos gates, porém reversão rápida.

## Registro de decisões de produto pendentes

| Decisão | Opções | Recomendação segura | Impacto |
|---|---|---|---|
| Janela de validade | 7/14/30 dias ou por fonte | default tenant-configurável 7 dias | altera antecedência, não modelo |
| Recipient | admins; gestores por local; inscrição explícita | admins + gestores configurados | precisa RBAC/policy |
| Snooze crítico | respeitar; quebrar em mudança material | respeitar até contrato explícito | evita surpresa operacional |
| Sem validade | ignorar regra; alertar quality; inferir data | quality issue, nunca inferir | não inventa dado |
| Quantidade relevante | onHand; available; fórmula por fonte | semântica declarada pelo adapter; fallback explícito | afeta resolução |
| Autoridade multi-source | single; field; location; observation | single por local, observation default | evita soma arbitrária |
| Retenção | curta; operacional; legal | mínimo para replay/auditoria + policy tenant-aware | custo/privacidade |

Essas escolhas podem ser parametrizadas e não bloqueiam o contrato estrutural.
