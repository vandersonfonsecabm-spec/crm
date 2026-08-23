# Contrato de Estoque → Central H8

CURRENT_STATE_AS_OF=2026-08-23T17:51:15Z
BASELINE_SHA=a5a280c3ebc54741ced02a77d4da5ec51834d583
ARCHITECTURE_VERSION=E1-v1.0
DOCUMENT_STATUS=FINAL

## Princípio

O domínio de estoque não cria segunda Central, tabela paralela de notificações, badge, preferências ou lifecycle. Ele produz `StockRuleProjection`, que é adaptado para a entidade/lifecycle H8 existente.

```text
Saldo/Lote/Freshness canônico
  -> avaliação de regra
  -> StockRuleProjection
  -> H8ProjectionInput
  -> occurrence/recipient/notificação H8
```

## Regras MVP futuras

| Código | Disparo | Resolução | Capability mínima |
|---|---|---|---|
| `STOCK_LOT_EXPIRING` | lote relevante entra na janela configurada | quantidade relevante zero, lote encerrado ou validade corrigida | lote + validade + quantidade + unidade |
| `STOCK_LOT_EXPIRED` | data local do tenant cruza validade | destinação operacional, quantidade zero ou correção válida | mesmas; `DATE`/timezone |
| `STOCK_DATA_STALE` | SLA de fonte/escopo excedido | sync bem-sucedido restaura freshness | `SOURCE_UPDATED_AT` ou sync success |
| `STOCK_SYNC_FAILED` | retries esgotados para causa causal | execução posterior saudável | status/health de run |

`PRODUCT_STALE`, `PRODUCT_INCOMPLETE`, `CLIENT_NO_CONTACT`, `PROPOSAL_EXPIRY` e `DEAL_STALLED` não são reutilizados nem reclassificados nesta arquitetura.

## Projection input

```json
{
  "tenantId": "server-resolved",
  "type": "STOCK_LOT_EXPIRING",
  "occurrenceKey": "tenant:rule:canonicalLot[:location]",
  "priority": "WARNING|HIGH|CRITICAL|EXPIRED",
  "recipientSet": "resolved-server-side",
  "title": "sanitized short text",
  "summary": "sanitized summary",
  "snapshot": {
    "productId": 123,
    "lotId": 456,
    "locationId": 789,
    "expiryDate": "date-only",
    "quantityRelevant": "decimal",
    "dataConfidence": "FRESH|AGING|STALE|UNKNOWN"
  },
  "destination": { "kind": "ESTOQUE_LOTE", "productId": 123, "lotId": 456 },
  "materialVersion": "canonical revision/checksum",
  "sourceObservedAt": "instant",
  "resolutionState": "OPEN|RESOLVED|SUPPRESSED"
}
```

Nenhuma URL livre, token, payload bruto, external ID desnecessário ou cross-tenant ID entra no H8. O backend valida o destino pela empresa do contexto.

## Occurrence keys e coalescência

- `STOCK_LOT_EXPIRING`: `empresaId + ruleType + canonicalLotId + canonicalLocationId?`; a prioridade evolui na mesma occurrence conforme a banda muda.
- `STOCK_LOT_EXPIRED`: mesma chave lógica, caso o produto decida continuidade entre expiring/expired; default recomendado é a mesma ocorrência com `priority=EXPIRED` para não duplicar.
- `STOCK_DATA_STALE`: `empresaId + ruleType + sourceConnectionId + scopeKey`; uma falha de sync não cria uma occurrence por retry.
- `STOCK_SYNC_FAILED`: `empresaId + ruleType + sourceConnectionId + errorFamily`; retries da mesma causa coalescem.

Mudança material atualiza snapshot/version, pode reabrir unread conforme contrato H8 e não cria duplicata. Uma simples abertura/read não resolve.

## Lifecycle reutilizado

`CREATE → UPDATE/COALESCE → REOPEN (se material e resolvido anteriormente) → READ → READ_ALL(cutoff) → SNOOZE → UNSNOOZE → RESOLVE → SUPPRESS/ARCHIVE`. Resolução exige predicado operacional; não depende de clique.

Snooze segue o contrato H8. Para prioridade `CRITICAL`, a política de ignorar snooze é decisão de produto pendente; default seguro é respeitar snooze e gerar nova urgência somente em mudança material documentada.

## Recipients

Resolver no tenant: administradores/gestores autorizados e responsáveis por localização conforme configuração. Usuário ativo, role válida, fallback explícito e auditado; ausência de recipient é métrica/quality issue, nunca descarte silencioso. Preferência de usuário pode silenciar alertas opcionais, não obrigatório-operacionais sem regra.

## Configuração e precedência

`item/lote override > source/location rule > tenant/company default > safe system default`. Toda mudança exige actor, before/after, correlationId, transação e política de recálculo. Alteração não reescreve histórico; decide explicitamente se afeta ocorrências abertas, futuras ou ambas.

## Deep links

- `ESTOQUE_LOTE`: produto/lote/local canônicos; abre detalhe autorizado.
- `ESTOQUE_PRODUTO`: produto e filtros seguros.
- `ESTOQUE_FONTE`: fonte/sync/status, sem credencial.

O backend valida `empresaId` e retorna 404/403 seguro para ID externo/tenant incorreto. A UI monta rota apenas a partir do target estruturado.

## Não-outbound e isolamento

Projeção H8 é interna. Nenhum e-mail, WhatsApp, Messenger, Instagram, SMS, push ou webhook é disparado pelo domínio de estoque. Worker bounded, tenant-scoped, recipient-scoped e protegido pela allowlist H8; flags novas serão deny-by-default e não reutilizarão H7/H8 de modo ambíguo.
